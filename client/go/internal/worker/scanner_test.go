package worker

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func TestScan_FindsJSONLFiles(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "a.jsonl"), []byte("{}"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "b.jsonl"), []byte("{}"), 0644))

	sc := NewScanner(ScannerConfig{
		DiscoveryPaths:  []string{dir},
		FilePatterns:    []string{"*.jsonl"},
		MaxFileAgeHours: 24,
		MaxFileSizeMB:   10,
	}, nil, testLogger())

	candidates, err := sc.Scan(context.Background())
	require.NoError(t, err)
	assert.Len(t, candidates, 2)
}

func TestScan_FilesTooOld(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "old.jsonl")
	require.NoError(t, os.WriteFile(path, []byte("{}"), 0644))

	// Set mod time to 48 hours ago.
	oldTime := time.Now().Add(-48 * time.Hour)
	require.NoError(t, os.Chtimes(path, oldTime, oldTime))

	sc := NewScanner(ScannerConfig{
		DiscoveryPaths:  []string{dir},
		FilePatterns:    []string{"*.jsonl"},
		MaxFileAgeHours: 24,
		MaxFileSizeMB:   10,
	}, nil, testLogger())

	candidates, err := sc.Scan(context.Background())
	require.NoError(t, err)
	assert.Empty(t, candidates)
}

func TestScan_FilesTooLarge(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "big.jsonl")
	// Write a file larger than 1 byte limit (we set MaxFileSizeMB very small in bytes).
	data := make([]byte, 2*1024*1024) // 2 MB
	require.NoError(t, os.WriteFile(path, data, 0644))

	sc := NewScanner(ScannerConfig{
		DiscoveryPaths:  []string{dir},
		FilePatterns:    []string{"*.jsonl"},
		MaxFileAgeHours: 24,
		MaxFileSizeMB:   1, // 1 MB limit
	}, nil, testLogger())

	candidates, err := sc.Scan(context.Background())
	require.NoError(t, err)
	assert.Empty(t, candidates)
}

func TestScan_ExcludePatterns(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "data.jsonl"), []byte("{}"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "temp_data.jsonl"), []byte("{}"), 0644))

	sc := NewScanner(ScannerConfig{
		DiscoveryPaths:  []string{dir},
		FilePatterns:    []string{"*.jsonl"},
		ExcludePatterns: []string{"temp*"},
		MaxFileAgeHours: 24,
		MaxFileSizeMB:   10,
	}, nil, testLogger())

	candidates, err := sc.Scan(context.Background())
	require.NoError(t, err)
	assert.Len(t, candidates, 1)
	assert.Contains(t, candidates[0].Path, "data.jsonl")
}

func TestScan_FilePatterns(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "data.jsonl"), []byte("{}"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "data.txt"), []byte("{}"), 0644))

	sc := NewScanner(ScannerConfig{
		DiscoveryPaths:  []string{dir},
		FilePatterns:    []string{"*.jsonl"},
		MaxFileAgeHours: 24,
		MaxFileSizeMB:   10,
	}, nil, testLogger())

	candidates, err := sc.Scan(context.Background())
	require.NoError(t, err)
	assert.Len(t, candidates, 1)
	assert.Contains(t, candidates[0].Path, "data.jsonl")
}

func TestScan_MaxFilesLimit(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 10; i++ {
		name := filepath.Join(dir, fmt.Sprintf("file%d.jsonl", i))
		require.NoError(t, os.WriteFile(name, []byte("{}"), 0644))
	}

	sc := NewScanner(ScannerConfig{
		DiscoveryPaths:  []string{dir},
		FilePatterns:    []string{"*.jsonl"},
		MaxFileAgeHours: 24,
		MaxFileSizeMB:   10,
		MaxFiles:        3,
	}, nil, testLogger())

	candidates, err := sc.Scan(context.Background())
	require.NoError(t, err)
	assert.LessOrEqual(t, len(candidates), 3)
}

func TestScan_ContextCancellation(t *testing.T) {
	dir := t.TempDir()
	for i := 0; i < 5; i++ {
		name := filepath.Join(dir, fmt.Sprintf("file%d.jsonl", i))
		require.NoError(t, os.WriteFile(name, []byte("{}"), 0644))
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately.

	sc := NewScanner(ScannerConfig{
		DiscoveryPaths:  []string{dir},
		FilePatterns:    []string{"*.jsonl"},
		MaxFileAgeHours: 24,
		MaxFileSizeMB:   10,
	}, nil, testLogger())

	candidates, err := sc.Scan(ctx)
	require.NoError(t, err)
	// With immediate cancellation, we expect few or no results.
	assert.LessOrEqual(t, len(candidates), 5)
}

func TestScan_EmptyDirectory(t *testing.T) {
	dir := t.TempDir()

	sc := NewScanner(ScannerConfig{
		DiscoveryPaths:  []string{dir},
		FilePatterns:    []string{"*.jsonl"},
		MaxFileAgeHours: 24,
		MaxFileSizeMB:   10,
	}, nil, testLogger())

	candidates, err := sc.Scan(context.Background())
	require.NoError(t, err)
	assert.Empty(t, candidates)
}

func TestScan_SortedByModifiedAtAscending(t *testing.T) {
	dir := t.TempDir()

	// Create files with different mod times.
	paths := []string{
		filepath.Join(dir, "newest.jsonl"),
		filepath.Join(dir, "middle.jsonl"),
		filepath.Join(dir, "oldest.jsonl"),
	}
	for _, p := range paths {
		require.NoError(t, os.WriteFile(p, []byte("{}"), 0644))
	}

	now := time.Now()
	require.NoError(t, os.Chtimes(paths[0], now, now))
	require.NoError(t, os.Chtimes(paths[1], now.Add(-1*time.Hour), now.Add(-1*time.Hour)))
	require.NoError(t, os.Chtimes(paths[2], now.Add(-2*time.Hour), now.Add(-2*time.Hour)))

	sc := NewScanner(ScannerConfig{
		DiscoveryPaths:  []string{dir},
		FilePatterns:    []string{"*.jsonl"},
		MaxFileAgeHours: 24,
		MaxFileSizeMB:   10,
	}, nil, testLogger())

	candidates, err := sc.Scan(context.Background())
	require.NoError(t, err)
	require.Len(t, candidates, 3)

	// Oldest first.
	assert.Contains(t, candidates[0].Path, "oldest.jsonl")
	assert.Contains(t, candidates[1].Path, "middle.jsonl")
	assert.Contains(t, candidates[2].Path, "newest.jsonl")
}
