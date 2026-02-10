package worker

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ComputClaw/tokenly-client/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testWorkerConfig(t *testing.T) WorkerConfig {
	t.Helper()
	return WorkerConfig{
		Config: &config.ClientConfig{
			ScanEnabled:          true,
			ScanIntervalMinutes:  1,
			MaxFileAgeHours:      24,
			MaxFileSizeMB:        10,
			MaxConcurrentUploads: 2,
			DiscoveryPaths: config.DiscoveryPaths{
				Windows: []string{t.TempDir()},
				Linux:   []string{t.TempDir()},
				Darwin:  []string{t.TempDir()},
			},
			FilePatterns:    []string{"*.jsonl"},
			ExcludePatterns: []string{"*temp*"},
		},
		Hostname:     "test-host",
		StatePath:    filepath.Join(t.TempDir(), "state.json"),
		ServerURL:    "http://localhost:8080",
		LearningPath: filepath.Join(t.TempDir(), "learning.json"),
	}
}

func TestNewWorker(t *testing.T) {
	cfg := testWorkerConfig(t)
	w, err := NewWorker(cfg, testLogger())
	require.NoError(t, err)
	assert.NotNil(t, w)
	assert.Equal(t, "idle", w.state)
}

func TestWorker_RunAndCancel(t *testing.T) {
	cfg := testWorkerConfig(t)
	w, err := NewWorker(cfg, testLogger())
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() {
		done <- w.Run(ctx)
	}()

	// Give it a moment to start.
	time.Sleep(100 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		assert.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("worker did not shut down in time")
	}
}

func TestWorker_ScanCycleWithFiles(t *testing.T) {
	dir := t.TempDir()

	// Create a valid JSONL file in the scan directory.
	content := `{"timestamp":"2025-01-15T10:30:00Z","service":"openai","model":"gpt-4","input_tokens":100}` + "\n"
	require.NoError(t, os.WriteFile(filepath.Join(dir, "usage.jsonl"), []byte(content), 0644))

	cfg := WorkerConfig{
		Config: &config.ClientConfig{
			ScanEnabled:          true,
			ScanIntervalMinutes:  60,
			MaxFileAgeHours:      24,
			MaxFileSizeMB:        10,
			MaxConcurrentUploads: 1,
			DiscoveryPaths: config.DiscoveryPaths{
				Windows: []string{dir},
				Linux:   []string{dir},
				Darwin:  []string{dir},
			},
			FilePatterns: []string{"*.jsonl"},
		},
		Hostname:     "test-host",
		StatePath:    filepath.Join(t.TempDir(), "state.json"),
		ServerURL:    "http://localhost:0", // Will fail upload, but should not crash.
		LearningPath: filepath.Join(t.TempDir(), "learning.json"),
	}

	w, err := NewWorker(cfg, testLogger())
	require.NoError(t, err)

	// Run a single scan cycle (not the full Run loop).
	ctx := context.Background()
	w.runScanCycle(ctx)

	assert.Equal(t, "idle", w.state)
	assert.Equal(t, 1, w.filesFound)
}

func TestWorker_GracefulShutdownSavesLearning(t *testing.T) {
	cfg := testWorkerConfig(t)
	w, err := NewWorker(cfg, testLogger())
	require.NoError(t, err)

	// Simulate some learning data.
	w.learner.UpdateAfterScan("/test", 5)

	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() {
		done <- w.Run(ctx)
	}()

	time.Sleep(100 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		assert.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("worker did not shut down")
	}

	// Verify learning data was saved.
	stats := w.learner.data.Directories["/test"]
	require.NotNil(t, stats)
	assert.Equal(t, 5, stats.FileCount)
}

func TestWorker_ReloadConfig(t *testing.T) {
	dir := t.TempDir()
	statePath := filepath.Join(dir, "state.json")

	// Write a state file with config.
	cfg := config.DefaultConfig()
	cfg.ScanIntervalMinutes = 999
	state := &config.StateFile{
		ServerConfig: &cfg,
	}
	require.NoError(t, state.Save(statePath))

	wcfg := testWorkerConfig(t)
	wcfg.StatePath = statePath
	w, err := NewWorker(wcfg, testLogger())
	require.NoError(t, err)

	// Reload should pick up the new config.
	w.reloadConfig()
	assert.Equal(t, 999, w.config.ScanIntervalMinutes)
}
