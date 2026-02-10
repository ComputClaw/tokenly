package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"syscall"

	"github.com/ComputClaw/tokenly-client/internal/launcher"
	"github.com/ComputClaw/tokenly-client/internal/logging"
)

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	serverURL := flag.String("server", "", "Server URL (required)")
	hostname := flag.String("hostname", "", "Override hostname (default: OS hostname)")
	logLevel := flag.String("log-level", "info", "Log level: debug, info, warn, error")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("tokenly-launcher version %s (commit: %s, built: %s)\n", version, commit, date)
		os.Exit(0)
	}

	if *serverURL == "" {
		fmt.Fprintln(os.Stderr, "error: --server flag is required")
		flag.Usage()
		os.Exit(1)
	}

	if *hostname == "" {
		h, err := os.Hostname()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: could not determine hostname: %v\n", err)
			os.Exit(1)
		}
		*hostname = h
	}

	logger, levelVar := logging.NewLogger("launcher", *logLevel)

	// Determine state file path per platform.
	statePath := defaultStatePath()

	// Determine worker binary name for the current OS.
	workerBinary := launcher.WorkerBinaryName()

	checker := &launcher.OSProcessChecker{}
	workerManager := launcher.NewWorkerManager(workerBinary, statePath, checker, logger)

	heartbeatClient := launcher.NewHeartbeatClient(*serverURL, logger)

	cfg := launcher.LauncherConfig{
		ServerURL: *serverURL,
		Hostname:  *hostname,
		LogLevel:  *logLevel,
	}

	l := launcher.NewLauncher(cfg, statePath, heartbeatClient, workerManager, logger, levelVar, version)

	// Context with signal handling.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-sigCh
		logger.Info("received signal, shutting down", "signal", sig)
		cancel()
	}()

	logger.Info("starting tokenly-launcher",
		"version", version,
		"server", *serverURL,
		"hostname", *hostname,
	)

	if err := l.Run(ctx); err != nil {
		logger.Error("launcher exited with error", "error", err)
		os.Exit(1)
	}
}

func defaultStatePath() string {
	switch runtime.GOOS {
	case "windows":
		pd := os.Getenv("PROGRAMDATA")
		if pd == "" {
			pd = `C:\ProgramData`
		}
		return pd + `\Tokenly\tokenly-state.json`
	case "darwin":
		return "/Library/Application Support/Tokenly/tokenly-state.json"
	default: // linux
		return "/var/lib/tokenly/tokenly-state.json"
	}
}
