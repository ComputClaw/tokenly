package launcher

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/ComputClaw/tokenly-client/internal/config"
	"github.com/ComputClaw/tokenly-client/internal/logging"
	"github.com/ComputClaw/tokenly-client/internal/platform"
)

// LauncherConfig holds the top-level launcher configuration from CLI flags.
type LauncherConfig struct {
	ServerURL string
	Hostname  string
	LogLevel  string
}

// Launcher orchestrates heartbeating and worker process supervision.
// It does NOT communicate with the worker via IPC — instead it writes config
// to the shared state file and the worker reads it.
type Launcher struct {
	config          LauncherConfig
	heartbeatClient HeartbeatSender
	workerManager   *WorkerManager
	state           *config.StateFile
	statePath       string
	logger          *slog.Logger
	levelVar        *slog.LevelVar
	launcherVersion string
}

// NewLauncher creates a Launcher instance.
func NewLauncher(
	cfg LauncherConfig,
	statePath string,
	heartbeatClient HeartbeatSender,
	workerManager *WorkerManager,
	logger *slog.Logger,
	levelVar *slog.LevelVar,
	launcherVersion string,
) *Launcher {
	return &Launcher{
		config:          cfg,
		heartbeatClient: heartbeatClient,
		workerManager:   workerManager,
		statePath:       statePath,
		logger:          logger,
		levelVar:        levelVar,
		launcherVersion: launcherVersion,
	}
}

// Run executes the main launcher loop until the context is cancelled.
func (l *Launcher) Run(ctx context.Context) error {
	state, err := config.LoadState(l.statePath)
	if err != nil {
		return fmt.Errorf("load state: %w", err)
	}
	l.state = state
	l.state.ServerEndpoint = l.config.ServerURL
	l.state.Hostname = l.config.Hostname

	// Initial heartbeat interval: 60s for quick registration.
	interval := 60 * time.Second

	l.logger.Info("launcher starting",
		"server", l.config.ServerURL,
		"hostname", l.config.Hostname,
		"initial_interval", interval,
	)

	timer := time.NewTimer(0) // fire immediately
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			l.logger.Info("launcher shutting down")
			l.workerManager.EnsureStopped(l.state)
			l.state.WorkerStatus = "stopped"
			l.state.WorkerPID = 0
			if err := l.state.Save(l.statePath); err != nil {
				l.logger.Error("failed to save state on shutdown", "error", err)
			}
			return nil

		case <-timer.C:
			newInterval := l.doHeartbeat(ctx)
			if newInterval > 0 {
				interval = newInterval
			}
			timer.Reset(interval)
		}
	}
}

// doHeartbeat sends one heartbeat and handles the response. Returns the next interval.
func (l *Launcher) doHeartbeat(ctx context.Context) time.Duration {
	// Check current worker status before sending heartbeat.
	workerStatus := "stopped"
	if l.workerManager.IsRunning() {
		workerStatus = "running"
	}
	l.state.WorkerStatus = workerStatus

	req := l.buildHeartbeatRequest()

	resp, status, err := l.heartbeatClient.SendHeartbeat(ctx, req)
	if err != nil {
		l.state.ConsecutiveFailures++
		failures := l.state.ConsecutiveFailures
		backoff := math.Min(float64(60)*math.Pow(2, float64(failures)), 3600)
		interval := time.Duration(backoff) * time.Second
		l.logger.Warn("heartbeat failed",
			"error", err,
			"consecutive_failures", failures,
			"next_retry", interval,
		)
		l.saveState()
		return interval
	}

	l.state.LastHeartbeat = time.Now().UTC().Format(time.RFC3339)

	switch {
	case status == 200:
		return l.handleApproved(resp)
	case status == 202:
		l.handlePending(resp)
		if resp.RetryAfterSeconds > 0 {
			return time.Duration(resp.RetryAfterSeconds) * time.Second
		}
		return 60 * time.Second
	case status == 403:
		l.handleRejected()
		return 3600 * time.Second
	default:
		l.state.ConsecutiveFailures++
		l.logger.Warn("unexpected heartbeat status", "status", status)
		l.saveState()
		return 60 * time.Second
	}
}

// handleApproved processes a 200 approved heartbeat response.
func (l *Launcher) handleApproved(resp *HeartbeatResponse) time.Duration {
	l.state.ServerApproved = true
	l.state.ConsecutiveFailures = 0

	if resp.Config != nil {
		l.state.ServerConfig = resp.Config

		// Update log level from server config.
		if resp.Config.LogLevel != "" {
			l.levelVar.Set(logging.ParseLevel(resp.Config.LogLevel))
		}
	}

	// Save config to state file BEFORE ensuring worker is running,
	// so the worker can read the latest config on startup.
	l.saveState()

	// Ensure worker process is running.
	pid, started, err := l.workerManager.EnsureRunning(l.state)
	if err != nil {
		l.logger.Error("failed to ensure worker running", "error", err)
	} else {
		l.state.WorkerPID = pid
		l.state.WorkerStatus = "running"
		if started {
			l.logger.Info("worker started", "pid", pid)
			l.saveState()
		}
	}

	l.logger.Info("heartbeat approved", "client_id", resp.ClientID)

	if resp.Config != nil && resp.Config.HeartbeatIntervalSecs > 0 {
		return time.Duration(resp.Config.HeartbeatIntervalSecs) * time.Second
	}
	return 300 * time.Second
}

// handlePending processes a 202 pending heartbeat response.
func (l *Launcher) handlePending(resp *HeartbeatResponse) {
	l.state.ServerApproved = false
	l.state.ConsecutiveFailures = 0

	// Stop worker — not approved yet.
	l.workerManager.EnsureStopped(l.state)
	l.state.WorkerStatus = "stopped"
	l.state.WorkerPID = 0
	l.saveState()

	l.logger.Info("heartbeat pending",
		"message", resp.Message,
		"retry_after", resp.RetryAfterSeconds,
	)
}

// handleRejected processes a 403 rejected heartbeat response.
func (l *Launcher) handleRejected() {
	l.state.ServerApproved = false
	l.state.ConsecutiveFailures = 0

	l.workerManager.EnsureStopped(l.state)
	l.state.WorkerStatus = "stopped"
	l.state.WorkerPID = 0
	l.saveState()

	l.logger.Warn("client rejected by server, heartbeat interval set to 1hr")
}

// buildHeartbeatRequest constructs a HeartbeatRequest from current state.
func (l *Launcher) buildHeartbeatRequest() *HeartbeatRequest {
	workerVersion := l.state.WorkerVersion
	if workerVersion == "" {
		workerVersion = "0.0.0"
	}

	workerStatus := l.state.WorkerStatus
	if workerStatus == "" {
		workerStatus = "stopped"
	}

	return &HeartbeatRequest{
		ClientHostname:  l.config.Hostname,
		Timestamp:       time.Now().UTC().Format(time.RFC3339),
		LauncherVersion: l.launcherVersion,
		WorkerVersion:   workerVersion,
		WorkerStatus:    workerStatus,
		SystemInfo: SystemInfo{
			OS:       platform.OSName(),
			Arch:     platform.ArchName(),
			Platform: platform.PlatformDetail(),
		},
	}
}

func (l *Launcher) saveState() {
	if err := l.state.Save(l.statePath); err != nil {
		l.logger.Error("failed to save state", "error", err)
	}
}
