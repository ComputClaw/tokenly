package launcher

import (
	"context"
	"io"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/ComputClaw/tokenly-client/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockHeartbeatSender2 implements HeartbeatSender for launcher tests.
type mockHeartbeatSender2 struct {
	response *HeartbeatResponse
	status   int
	err      error
	calls    int
}

func (m *mockHeartbeatSender2) SendHeartbeat(_ context.Context, _ *HeartbeatRequest) (*HeartbeatResponse, int, error) {
	m.calls++
	return m.response, m.status, m.err
}

func newLauncherForTest(t *testing.T, hb HeartbeatSender) (*Launcher, string) {
	t.Helper()
	dir := t.TempDir()
	statePath := filepath.Join(dir, "state.json")

	checker := newMockChecker()
	wm := NewWorkerManager("tokenly-worker", statePath, checker, silentLogger())

	lvl := &slog.LevelVar{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	l := NewLauncher(
		LauncherConfig{ServerURL: "http://test", Hostname: "test-host"},
		statePath, hb, wm, logger, lvl, "1.0.0",
	)
	return l, statePath
}

func TestLauncher_ApprovedFlow(t *testing.T) {
	cfg := config.DefaultConfig()
	hb := &mockHeartbeatSender2{
		response: &HeartbeatResponse{
			ClientID: "test-id",
			Approved: true,
			Config:   &cfg,
		},
		status: 200,
	}

	l, statePath := newLauncherForTest(t, hb)

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	err := l.Run(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, hb.calls, 1)

	state, err := config.LoadState(statePath)
	require.NoError(t, err)
	assert.True(t, state.ServerApproved)
	assert.NotNil(t, state.ServerConfig)
}

func TestLauncher_PendingFlow(t *testing.T) {
	hb := &mockHeartbeatSender2{
		response: &HeartbeatResponse{
			ClientID:          "test-id",
			Approved:          false,
			Message:           "awaiting approval",
			RetryAfterSeconds: 5,
		},
		status: 202,
	}

	l, statePath := newLauncherForTest(t, hb)

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	err := l.Run(ctx)
	require.NoError(t, err)

	state, err := config.LoadState(statePath)
	require.NoError(t, err)
	assert.False(t, state.ServerApproved)
	assert.Equal(t, "stopped", state.WorkerStatus)
}

func TestLauncher_RejectedFlow(t *testing.T) {
	hb := &mockHeartbeatSender2{
		response: &HeartbeatResponse{
			ClientID: "test-id",
			Approved: false,
		},
		status: 403,
	}

	l, statePath := newLauncherForTest(t, hb)

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	err := l.Run(ctx)
	require.NoError(t, err)

	state, err := config.LoadState(statePath)
	require.NoError(t, err)
	assert.False(t, state.ServerApproved)
	assert.Equal(t, "stopped", state.WorkerStatus)
}

func TestLauncher_ErrorBackoff(t *testing.T) {
	hb := &mockHeartbeatSender2{
		err: assert.AnError,
	}

	l, statePath := newLauncherForTest(t, hb)

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	err := l.Run(ctx)
	require.NoError(t, err)

	state, err := config.LoadState(statePath)
	require.NoError(t, err)
	assert.Greater(t, state.ConsecutiveFailures, 0)
}

func TestLauncher_GracefulShutdown(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.HeartbeatIntervalSecs = 9999
	hb := &mockHeartbeatSender2{
		response: &HeartbeatResponse{
			ClientID: "test-id",
			Approved: true,
			Config:   &cfg,
		},
		status: 200,
	}

	l, statePath := newLauncherForTest(t, hb)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- l.Run(ctx) }()

	time.Sleep(200 * time.Millisecond)
	cancel()

	err := <-done
	require.NoError(t, err)

	state, err := config.LoadState(statePath)
	require.NoError(t, err)
	assert.Equal(t, "stopped", state.WorkerStatus)
}
