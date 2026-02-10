package launcher

import (
	"io"
	"log/slog"
	"testing"

	"github.com/ComputClaw/tokenly-client/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockChecker implements ProcessChecker for testing.
type mockChecker struct {
	running    map[int]bool
	nextPID    int
	startError error
}

func newMockChecker() *mockChecker {
	return &mockChecker{
		running: make(map[int]bool),
		nextPID: 1000,
	}
}

func (c *mockChecker) IsProcessRunning(pid int) bool {
	return c.running[pid]
}

func (c *mockChecker) StartProcess(binary string, args ...string) (int, error) {
	if c.startError != nil {
		return 0, c.startError
	}
	pid := c.nextPID
	c.nextPID++
	c.running[pid] = true
	return pid, nil
}

func silentLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func testState() *config.StateFile {
	cfg := config.DefaultConfig()
	return &config.StateFile{
		ServerApproved: true,
		ServerConfig:   &cfg,
	}
}

func TestEnsureRunning_StartsWorker(t *testing.T) {
	checker := newMockChecker()
	wm := NewWorkerManager("tokenly-worker", "/tmp/state.json", checker, silentLogger())
	state := testState()

	pid, started, err := wm.EnsureRunning(state)
	require.NoError(t, err)
	assert.True(t, started)
	assert.Equal(t, 1000, pid)
	assert.True(t, wm.IsRunning())
}

func TestEnsureRunning_AlreadyRunning(t *testing.T) {
	checker := newMockChecker()
	wm := NewWorkerManager("tokenly-worker", "/tmp/state.json", checker, silentLogger())
	state := testState()

	// Start once.
	pid1, started1, err := wm.EnsureRunning(state)
	require.NoError(t, err)
	assert.True(t, started1)

	// Call again — should detect it's running, not start again.
	pid2, started2, err := wm.EnsureRunning(state)
	require.NoError(t, err)
	assert.False(t, started2)
	assert.Equal(t, pid1, pid2)
}

func TestEnsureRunning_RestartsDeadWorker(t *testing.T) {
	checker := newMockChecker()
	wm := NewWorkerManager("tokenly-worker", "/tmp/state.json", checker, silentLogger())
	state := testState()

	pid1, _, err := wm.EnsureRunning(state)
	require.NoError(t, err)

	// Simulate process dying.
	checker.running[pid1] = false

	pid2, started, err := wm.EnsureRunning(state)
	require.NoError(t, err)
	assert.True(t, started)
	assert.NotEqual(t, pid1, pid2)
}

func TestEnsureRunning_PicksUpPIDFromState(t *testing.T) {
	checker := newMockChecker()
	checker.running[5555] = true // simulate existing worker process
	wm := NewWorkerManager("tokenly-worker", "/tmp/state.json", checker, silentLogger())

	state := testState()
	state.WorkerPID = 5555

	pid, started, err := wm.EnsureRunning(state)
	require.NoError(t, err)
	assert.False(t, started) // should find existing, not start new
	assert.Equal(t, 5555, pid)
}

func TestEnsureStopped(t *testing.T) {
	checker := newMockChecker()
	wm := NewWorkerManager("tokenly-worker", "/tmp/state.json", checker, silentLogger())
	state := testState()

	pid, _, err := wm.EnsureRunning(state)
	require.NoError(t, err)
	assert.True(t, checker.running[pid])

	wm.EnsureStopped(state)
	assert.Equal(t, 0, wm.PID())
}

func TestIsRunning_NotStarted(t *testing.T) {
	checker := newMockChecker()
	wm := NewWorkerManager("tokenly-worker", "/tmp/state.json", checker, silentLogger())
	assert.False(t, wm.IsRunning())
}

func TestWorkerBinaryName(t *testing.T) {
	name := WorkerBinaryName()
	assert.NotEmpty(t, name)
	assert.Contains(t, name, "tokenly-worker")
}
