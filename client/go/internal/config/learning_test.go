package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLearningFileRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "learning.json")

	lf := &LearningFile{
		Directories: map[string]*DirectoryStats{
			"/var/log/openai": {
				Path:            "/var/log/openai",
				ScanCount:       15,
				FileCount:       42,
				LastSuccess:     "2026-02-09T08:00:00Z",
				SuccessRate:     2.8,
				AvgFilesPerScan: 2.8,
			},
		},
		NegativeCache: []string{"/tmp/logs"},
		LastUpdated:   "2026-02-09T09:00:00Z",
	}

	err := lf.Save(path)
	require.NoError(t, err)

	loaded, err := LoadLearning(path)
	require.NoError(t, err)
	assert.Equal(t, lf.LastUpdated, loaded.LastUpdated)
	assert.Len(t, loaded.Directories, 1)
	assert.Equal(t, 15, loaded.Directories["/var/log/openai"].ScanCount)
	assert.Equal(t, 42, loaded.Directories["/var/log/openai"].FileCount)
	assert.Equal(t, 2.8, loaded.Directories["/var/log/openai"].SuccessRate)
	assert.Equal(t, []string{"/tmp/logs"}, loaded.NegativeCache)
}

func TestLoadLearningMissingFile(t *testing.T) {
	lf, err := LoadLearning(filepath.Join(t.TempDir(), "nonexistent.json"))
	require.NoError(t, err)
	assert.NotNil(t, lf.Directories)
	assert.Empty(t, lf.Directories)
	assert.NotNil(t, lf.NegativeCache)
	assert.Empty(t, lf.NegativeCache)
}

func TestLoadLearningInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "learning.json")
	err := os.WriteFile(path, []byte("not json"), 0644)
	require.NoError(t, err)

	_, err = LoadLearning(path)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "parse learning file")
}

func TestLoadLearningNilFields(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "learning.json")
	err := os.WriteFile(path, []byte(`{"last_updated":"2026-01-01T00:00:00Z"}`), 0644)
	require.NoError(t, err)

	lf, err := LoadLearning(path)
	require.NoError(t, err)
	assert.NotNil(t, lf.Directories)
	assert.NotNil(t, lf.NegativeCache)
}

func TestNewLearningFile(t *testing.T) {
	lf := NewLearningFile()
	assert.NotNil(t, lf.Directories)
	assert.NotNil(t, lf.NegativeCache)
	assert.Empty(t, lf.Directories)
	assert.Empty(t, lf.NegativeCache)
}

func TestLearningSaveAtomicity(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "subdir", "learning.json")

	lf := NewLearningFile()
	err := lf.Save(path)
	require.NoError(t, err)

	_, err = os.Stat(path + ".tmp")
	assert.True(t, os.IsNotExist(err))
}
