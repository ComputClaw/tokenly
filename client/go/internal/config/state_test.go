package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStateFileRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")

	cfg := DefaultConfig()
	state := &StateFile{
		ServerEndpoint:      "https://example.com",
		Hostname:            "test-host",
		WorkerStatus:        "running",
		WorkerPID:           12345,
		WorkerVersion:       "1.0.0",
		LastHeartbeat:       "2026-02-09T09:00:00Z",
		ServerApproved:      true,
		ConsecutiveFailures: 0,
		ServerConfig:        &cfg,
	}

	err := state.Save(path)
	require.NoError(t, err)

	loaded, err := LoadState(path)
	require.NoError(t, err)
	assert.Equal(t, state.ServerEndpoint, loaded.ServerEndpoint)
	assert.Equal(t, state.Hostname, loaded.Hostname)
	assert.Equal(t, state.WorkerStatus, loaded.WorkerStatus)
	assert.Equal(t, state.WorkerPID, loaded.WorkerPID)
	assert.Equal(t, state.WorkerVersion, loaded.WorkerVersion)
	assert.Equal(t, state.LastHeartbeat, loaded.LastHeartbeat)
	assert.Equal(t, state.ServerApproved, loaded.ServerApproved)
	assert.Equal(t, state.ConsecutiveFailures, loaded.ConsecutiveFailures)
	assert.NotNil(t, loaded.ServerConfig)
	assert.Equal(t, cfg.ScanIntervalMinutes, loaded.ServerConfig.ScanIntervalMinutes)
}

func TestLoadStateMissingFile(t *testing.T) {
	state, err := LoadState(filepath.Join(t.TempDir(), "nonexistent.json"))
	require.NoError(t, err)
	assert.Equal(t, &StateFile{}, state)
}

func TestLoadStateInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	err := os.WriteFile(path, []byte("invalid json"), 0644)
	require.NoError(t, err)

	_, err = LoadState(path)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "parse state file")
}

func TestStateSaveAtomicity(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "subdir", "state.json")

	state := &StateFile{Hostname: "test"}
	err := state.Save(path)
	require.NoError(t, err)

	// Verify no temp file left behind
	_, err = os.Stat(path + ".tmp")
	assert.True(t, os.IsNotExist(err))
}
