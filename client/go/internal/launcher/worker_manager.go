package launcher

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"sync"

	"github.com/ComputClaw/tokenly-client/internal/config"
)

// ProcessChecker abstracts process existence checking for testability.
type ProcessChecker interface {
	// IsProcessRunning checks whether a process with the given PID exists.
	IsProcessRunning(pid int) bool
	// StartProcess spawns the worker binary and returns its PID.
	StartProcess(binary string, args ...string) (int, error)
}

// OSProcessChecker implements ProcessChecker using real OS calls.
type OSProcessChecker struct{}

// IsProcessRunning checks if a process exists by sending signal 0.
func (c *OSProcessChecker) IsProcessRunning(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, Signal(0) checks existence without sending a signal.
	// On Windows, FindProcess always succeeds, but Signal will fail if process is gone.
	err = proc.Signal(syscall0())
	return err == nil
}

// StartProcess spawns a new process and returns its PID.
func (c *OSProcessChecker) StartProcess(binary string, args ...string) (int, error) {
	cmd := exec.Command(binary, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("start process %s: %w", binary, err)
	}
	return cmd.Process.Pid, nil
}

// WorkerManager checks if the worker process is running and starts it if not.
// No IPC — the worker reads config from the shared state file.
type WorkerManager struct {
	workerBinary string
	statePath    string
	checker      ProcessChecker
	logger       *slog.Logger

	mu  sync.Mutex
	pid int
}

// NewWorkerManager creates a WorkerManager.
func NewWorkerManager(workerBinary string, statePath string, checker ProcessChecker, logger *slog.Logger) *WorkerManager {
	return &WorkerManager{
		workerBinary: workerBinary,
		statePath:    statePath,
		checker:      checker,
		logger:       logger,
	}
}

// EnsureRunning checks if the worker is alive (by PID). If not, starts it.
// Returns the worker PID and whether it was newly started.
func (m *WorkerManager) EnsureRunning(state *config.StateFile) (pid int, started bool, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// First check the PID we have in memory.
	if m.pid > 0 && m.checker.IsProcessRunning(m.pid) {
		return m.pid, false, nil
	}

	// Fall back to PID from state file.
	if state.WorkerPID > 0 && m.pid != state.WorkerPID && m.checker.IsProcessRunning(state.WorkerPID) {
		m.pid = state.WorkerPID
		return m.pid, false, nil
	}

	// Worker is not running — start it.
	m.logger.Info("worker not running, starting", "binary", m.workerBinary)

	newPid, err := m.checker.StartProcess(
		m.workerBinary,
		"--state-path", m.statePath,
	)
	if err != nil {
		m.pid = 0
		return 0, false, fmt.Errorf("start worker: %w", err)
	}

	m.pid = newPid
	m.logger.Info("worker started", "pid", newPid)
	return newPid, true, nil
}

// EnsureStopped kills the worker if it's running.
func (m *WorkerManager) EnsureStopped(state *config.StateFile) {
	m.mu.Lock()
	defer m.mu.Unlock()

	pid := m.pid
	if pid <= 0 {
		pid = state.WorkerPID
	}
	if pid <= 0 {
		return
	}

	if m.checker.IsProcessRunning(pid) {
		proc, err := os.FindProcess(pid)
		if err == nil {
			m.logger.Info("stopping worker", "pid", pid)
			proc.Signal(os.Interrupt)
		}
	}

	m.pid = 0
}

// IsRunning checks if the worker process is alive.
func (m *WorkerManager) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.pid > 0 && m.checker.IsProcessRunning(m.pid)
}

// PID returns the current worker PID (0 if unknown/not running).
func (m *WorkerManager) PID() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.pid
}

// workerBinaryName returns the expected worker binary name for the current OS.
func WorkerBinaryName() string {
	if runtime.GOOS == "windows" {
		return "tokenly-worker.exe"
	}
	return "tokenly-worker"
}

// syscall0 returns signal 0 for process existence checking.
// On Windows, os.Signal doesn't support signal 0, so we use a type that
// implements os.Signal but is a no-op.
func syscall0() os.Signal {
	return signal0{}
}

type signal0 struct{}

func (signal0) Signal() {}
func (signal0) String() string { return "signal 0" }

// WorkerStatusFromPID returns the worker_status string for the heartbeat
// based on whether the PID is alive.
func WorkerStatusFromPID(pid int, checker ProcessChecker) string {
	if pid > 0 && checker.IsProcessRunning(pid) {
		return "running"
	}
	return "stopped"
}

// WritePIDFile writes the worker PID to the state file path + ".pid" for cross-process discovery.
func WritePIDFile(path string, pid int) error {
	return os.WriteFile(path, []byte(strconv.Itoa(pid)), 0644)
}

// ReadPIDFile reads a PID from a file. Returns 0 if the file doesn't exist.
func ReadPIDFile(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	pid, err := strconv.Atoi(string(data))
	if err != nil {
		return 0
	}
	return pid
}
