package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/ComputClaw/tokenly-client/internal/config"
	"github.com/ComputClaw/tokenly-client/internal/logging"
	"github.com/ComputClaw/tokenly-client/internal/worker"
)

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	statePath := flag.String("state-path", "", "Path to the shared state file (required)")
	logLevel := flag.String("log-level", "info", "Log level: debug, info, warn, error")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("tokenly-worker version %s (commit: %s, built: %s)\n", version, commit, date)
		os.Exit(0)
	}

	if *statePath == "" {
		fmt.Fprintln(os.Stderr, "error: --state-path is required")
		flag.Usage()
		os.Exit(1)
	}

	logger, _ := logging.NewLogger("worker", *logLevel)

	// Load config from shared state file written by the launcher.
	state, err := config.LoadState(*statePath)
	if err != nil {
		logger.Error("failed to load state file", "path", *statePath, "error", err)
		os.Exit(1)
	}

	if state.ServerConfig == nil {
		logger.Error("state file has no server config, cannot start")
		os.Exit(1)
	}

	hostname := state.Hostname
	if hostname == "" {
		h, err := os.Hostname()
		if err != nil {
			h = "unknown"
		}
		hostname = h
	}

	serverURL := state.ServerEndpoint
	if serverURL == "" {
		logger.Error("state file has no server endpoint, cannot start")
		os.Exit(1)
	}

	// Set up signal handling.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-sigCh
		logger.Info("received signal, shutting down", "signal", sig)
		cancel()
	}()

	// Create and run the worker.
	w, err := worker.NewWorker(worker.WorkerConfig{
		Config:    state.ServerConfig,
		Hostname:  hostname,
		StatePath: *statePath,
		ServerURL: serverURL,
		LogLevel:  *logLevel,
	}, logger)
	if err != nil {
		logger.Error("failed to create worker", "error", err)
		os.Exit(1)
	}

	if err := w.Run(ctx); err != nil {
		logger.Error("worker exited with error", "error", err)
		os.Exit(1)
	}

	logger.Info("worker exited cleanly")
}
