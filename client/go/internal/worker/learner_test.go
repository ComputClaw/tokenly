package worker

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ComputClaw/tokenly-client/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestLearner(t *testing.T) (*Learner, string) {
	t.Helper()
	dir := t.TempDir()
	savePath := filepath.Join(dir, "learning.json")
	l, err := NewLearner(savePath, testLogger())
	require.NoError(t, err)
	return l, savePath
}

func TestLearner_UpdateAfterScan_FilesFound(t *testing.T) {
	l, _ := newTestLearner(t)
	l.UpdateAfterScan("/var/log", 5)

	paths := l.GetPriorityPaths()
	assert.Contains(t, paths, "/var/log")

	stats := l.data.Directories["/var/log"]
	assert.Equal(t, 1, stats.ScanCount)
	assert.Equal(t, 5, stats.FileCount)
	assert.Equal(t, 5.0, stats.SuccessRate)
	assert.NotEmpty(t, stats.LastSuccess)
}

func TestLearner_UpdateAfterScan_NoFiles_LessThan5Scans(t *testing.T) {
	l, _ := newTestLearner(t)

	for i := 0; i < 4; i++ {
		l.UpdateAfterScan("/empty/dir", 0)
	}

	assert.False(t, l.IsNegativeCached("/empty/dir"))
}

func TestLearner_UpdateAfterScan_NoFiles_5OrMoreScans(t *testing.T) {
	l, _ := newTestLearner(t)

	for i := 0; i < 5; i++ {
		l.UpdateAfterScan("/empty/dir", 0)
	}

	assert.True(t, l.IsNegativeCached("/empty/dir"))
}

func TestLearner_FilesFoundRemovesNegativeCache(t *testing.T) {
	l, _ := newTestLearner(t)

	// Build up negative cache.
	for i := 0; i < 5; i++ {
		l.UpdateAfterScan("/was/empty", 0)
	}
	assert.True(t, l.IsNegativeCached("/was/empty"))

	// Finding files should remove from negative cache.
	l.UpdateAfterScan("/was/empty", 3)
	assert.False(t, l.IsNegativeCached("/was/empty"))
}

func TestLearner_GetPriorityPaths_SortedByScore(t *testing.T) {
	l, _ := newTestLearner(t)

	// Path A: high success, recent.
	l.UpdateAfterScan("/high/success", 10)
	l.UpdateAfterScan("/high/success", 8)

	// Path B: low success, recent.
	l.UpdateAfterScan("/low/success", 1)
	l.UpdateAfterScan("/low/success", 0)

	paths := l.GetPriorityPaths()
	require.Len(t, paths, 2)
	assert.Equal(t, "/high/success", paths[0])
	assert.Equal(t, "/low/success", paths[1])
}

func TestLearner_Score_RecentSuccess(t *testing.T) {
	l, _ := newTestLearner(t)

	stats := &config.DirectoryStats{
		SuccessRate: 5.0,
		LastSuccess: time.Now().UTC().Format(time.RFC3339),
	}
	score := l.Score(stats)
	assert.InDelta(t, 5.0, score, 0.1) // recency ~1.0
}

func TestLearner_Score_NoSuccess(t *testing.T) {
	l, _ := newTestLearner(t)

	stats := &config.DirectoryStats{
		SuccessRate: 5.0,
		LastSuccess: "",
	}
	score := l.Score(stats)
	assert.InDelta(t, 0.5, score, 0.01) // 5.0 * 0.1
}

func TestLearner_Score_OldSuccess(t *testing.T) {
	l, _ := newTestLearner(t)

	old := time.Now().Add(-31 * 24 * time.Hour).UTC().Format(time.RFC3339)
	stats := &config.DirectoryStats{
		SuccessRate: 5.0,
		LastSuccess: old,
	}
	score := l.Score(stats)
	assert.InDelta(t, 0.5, score, 0.01) // 5.0 * 0.1 (fully decayed)
}

func TestLearner_SaveLoadRoundTrip(t *testing.T) {
	l, savePath := newTestLearner(t)

	l.UpdateAfterScan("/test/dir", 3)
	require.NoError(t, l.Save())

	// Verify file exists.
	_, err := os.Stat(savePath)
	require.NoError(t, err)

	// Load into a new learner.
	l2, err := NewLearner(savePath, testLogger())
	require.NoError(t, err)

	stats := l2.data.Directories["/test/dir"]
	require.NotNil(t, stats)
	assert.Equal(t, 1, stats.ScanCount)
	assert.Equal(t, 3, stats.FileCount)
}

func TestRecencyMultiplier(t *testing.T) {
	tests := []struct {
		name     string
		last     string
		expected float64
		delta    float64
	}{
		{
			name:     "empty string",
			last:     "",
			expected: 0.1,
			delta:    0.01,
		},
		{
			name:     "recent (1h ago)",
			last:     time.Now().Add(-1 * time.Hour).UTC().Format(time.RFC3339),
			expected: 1.0,
			delta:    0.01,
		},
		{
			name:     "old (31 days)",
			last:     time.Now().Add(-31 * 24 * time.Hour).UTC().Format(time.RFC3339),
			expected: 0.1,
			delta:    0.01,
		},
		{
			name:     "mid-range (15 days)",
			last:     time.Now().Add(-15 * 24 * time.Hour).UTC().Format(time.RFC3339),
			expected: 0.55, // roughly mid-decay
			delta:    0.1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := recencyMultiplier(tt.last)
			assert.InDelta(t, tt.expected, got, tt.delta)
		})
	}
}
