package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/ComputClaw/tokenly-client/internal/config"
	"github.com/ComputClaw/tokenly-client/internal/platform"
)

// WorkerConfig holds the parameters needed to create a Worker.
type WorkerConfig struct {
	Config       *config.ClientConfig
	Hostname     string
	StatePath    string
	ServerURL    string
	LogLevel     string
	LearningPath string // optional; defaults to platform learning path
}

// Worker orchestrates scanning, validating, uploading, and cleaning JSONL files.
type Worker struct {
	config    *config.ClientConfig
	hostname  string
	statePath string

	scanner  *Scanner
	uploader *Uploader
	cleaner  *Cleaner
	learner  *Learner
	logger   *slog.Logger

	mu            sync.Mutex
	state         string // "idle", "scanning", "uploading", "stopped"
	lastScan      time.Time
	filesFound    int
	filesUploaded int
	cancelFunc    context.CancelFunc
}

// NewWorker creates a Worker with all sub-components wired up.
func NewWorker(cfg WorkerConfig, logger *slog.Logger) (*Worker, error) {
	lpath := cfg.LearningPath
	if lpath == "" {
		lpath = learningFilePath()
	}
	learner, err := NewLearner(lpath, logger)
	if err != nil {
		return nil, fmt.Errorf("create learner: %w", err)
	}

	discoveryPaths := platformDiscoveryPaths(cfg.Config.DiscoveryPaths)

	scanner := NewScanner(ScannerConfig{
		DiscoveryPaths:  discoveryPaths,
		FilePatterns:    cfg.Config.FilePatterns,
		ExcludePatterns: cfg.Config.ExcludePatterns,
		MaxFileAgeHours: cfg.Config.MaxFileAgeHours,
		MaxFileSizeMB:   cfg.Config.MaxFileSizeMB,
	}, learner, logger)

	uploader := NewUploader(cfg.ServerURL, cfg.Hostname, logger)
	cleaner := NewCleaner(discoveryPaths, logger)

	return &Worker{
		config:    cfg.Config,
		hostname:  cfg.Hostname,
		statePath: cfg.StatePath,
		scanner:   scanner,
		uploader:  uploader,
		cleaner:   cleaner,
		learner:   learner,
		logger:    logger,
		state:     "idle",
	}, nil
}

// Run executes the main scan-upload loop until ctx is cancelled.
func (w *Worker) Run(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	w.mu.Lock()
	w.cancelFunc = cancel
	w.mu.Unlock()
	defer cancel()

	w.logger.Info("worker started", "hostname", w.hostname)

	interval := time.Duration(w.config.ScanIntervalMinutes) * time.Minute
	if interval <= 0 {
		interval = 60 * time.Minute
	}

	// Run first scan immediately, then on interval.
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	w.runScanCycle(ctx)

	for {
		select {
		case <-ctx.Done():
			w.logger.Info("worker shutting down")
			w.saveLearningData()
			return nil
		case <-ticker.C:
			w.runScanCycle(ctx)
		}
	}
}

// runScanCycle performs one full scan-validate-upload-cleanup cycle.
func (w *Worker) runScanCycle(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}

	w.mu.Lock()
	if !w.config.ScanEnabled {
		w.mu.Unlock()
		w.logger.Debug("scanning disabled, skipping cycle")
		return
	}
	w.state = "scanning"
	w.mu.Unlock()

	start := time.Now()
	w.logger.Info("starting scan cycle")

	candidates, err := w.scanner.Scan(ctx)
	if err != nil {
		w.logger.Error("scan failed", "error", err)
		w.mu.Lock()
		w.state = "idle"
		w.mu.Unlock()
		return
	}

	w.mu.Lock()
	w.lastScan = time.Now()
	w.filesFound = len(candidates)
	w.state = "uploading"
	w.mu.Unlock()

	w.logger.Info("scan complete", "files_found", len(candidates), "duration", time.Since(start))

	// Process files with concurrency limit.
	maxConcurrent := w.config.MaxConcurrentUploads
	if maxConcurrent <= 0 {
		maxConcurrent = 3
	}
	sem := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup
	var uploadCount int
	var uploadMu sync.Mutex
	stopUploads := false

	for _, candidate := range candidates {
		if ctx.Err() != nil {
			break
		}
		if stopUploads {
			break
		}

		sem <- struct{}{}
		wg.Add(1)
		go func(c FileCandidate) {
			defer wg.Done()
			defer func() { <-sem }()

			if err := w.processFile(ctx, c); err != nil {
				w.logger.Warn("file processing failed", "path", c.Path, "error", err)
				// Check if we should stop all uploads (auth error).
				if err.Error() == "stop uploads" {
					uploadMu.Lock()
					stopUploads = true
					uploadMu.Unlock()
				}
			} else {
				uploadMu.Lock()
				uploadCount++
				uploadMu.Unlock()
			}
		}(candidate)
	}
	wg.Wait()

	w.mu.Lock()
	w.filesUploaded = uploadCount
	w.state = "idle"
	w.mu.Unlock()

	// Update learning for scanned directories.
	dirCounts := make(map[string]int)
	for _, c := range candidates {
		dirCounts[filepath.Dir(c.Path)]++
	}
	for dir, count := range dirCounts {
		w.learner.UpdateAfterScan(dir, count)
	}

	w.saveLearningData()

	w.logger.Info("scan cycle complete",
		"files_found", len(candidates),
		"files_uploaded", uploadCount,
		"total_duration", time.Since(start))
}

// processFile validates, uploads, and cleans up a single file.
func (w *Worker) processFile(ctx context.Context, candidate FileCandidate) error {
	// Validate.
	result, err := ValidateJSONLFile(candidate.Path)
	if err != nil {
		return fmt.Errorf("validate %q: %w", candidate.Path, err)
	}
	if !result.Valid {
		w.logger.Debug("skipping invalid file", "path", candidate.Path,
			"valid_records", result.ValidRecords, "total_lines", result.TotalLines)
		return nil
	}

	// Build metadata.
	meta, err := buildFileMetadata(candidate.Path)
	if err != nil {
		return fmt.Errorf("build metadata for %q: %w", candidate.Path, err)
	}

	// Upload.
	uploadResult, err := w.uploader.Upload(ctx, candidate.Path, meta)
	if err != nil {
		return fmt.Errorf("upload %q: %w", candidate.Path, err)
	}

	if uploadResult.ShouldStopUploads {
		w.logger.Error("authentication failure, stopping uploads", "status", uploadResult.StatusCode)
		return fmt.Errorf("stop uploads")
	}

	if uploadResult.ShouldDelete {
		if err := w.cleaner.CleanupFile(candidate.Path); err != nil {
			w.logger.Warn("cleanup failed", "path", candidate.Path, "error", err)
		}
		return nil
	}

	if uploadResult.Error != "" {
		w.logger.Warn("upload issue", "path", candidate.Path, "error", uploadResult.Error,
			"retry", uploadResult.ShouldRetry)
	}

	return nil
}

// reloadConfig re-reads the state file and updates config if changed.
func (w *Worker) reloadConfig() {
	if w.statePath == "" {
		return
	}
	state, err := config.LoadState(w.statePath)
	if err != nil {
		w.logger.Warn("failed to reload config from state file", "error", err)
		return
	}
	if state.ServerConfig != nil {
		w.mu.Lock()
		w.config = state.ServerConfig
		w.mu.Unlock()
		w.logger.Debug("config reloaded from state file")
	}
}

// saveLearningData persists learning data, logging any errors.
func (w *Worker) saveLearningData() {
	if err := w.learner.Save(); err != nil {
		w.logger.Error("failed to save learning data", "error", err)
	}
}

// buildFileMetadata gathers metadata about a file for upload.
func buildFileMetadata(path string) (*FileMetadata, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("stat file: %w", err)
	}

	lineCount, err := countLines(path)
	if err != nil {
		return nil, fmt.Errorf("count lines: %w", err)
	}

	hash, err := hashFile(path)
	if err != nil {
		return nil, fmt.Errorf("hash file: %w", err)
	}

	return &FileMetadata{
		OriginalPath: path,
		Directory:    filepath.Dir(path),
		Filename:     filepath.Base(path),
		SizeBytes:    info.Size(),
		ModifiedAt:   info.ModTime().UTC().Format(time.RFC3339),
		CreatedAt:    info.ModTime().UTC().Format(time.RFC3339), // Creation time not portable; use mod time.
		LineCount:    lineCount,
		FileHash:     hash,
	}, nil
}

// countLines counts non-empty lines in a file.
func countLines(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	buf := make([]byte, 32*1024)
	count := 0
	for {
		n, err := f.Read(buf)
		for i := 0; i < n; i++ {
			if buf[i] == '\n' {
				count++
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, err
		}
	}
	return count, nil
}

// hashFile returns the SHA-256 hex digest of a file.
func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// platformDiscoveryPaths returns the discovery paths for the current OS.
func platformDiscoveryPaths(dp config.DiscoveryPaths) []string {
	switch runtime.GOOS {
	case "linux":
		return dp.Linux
	case "darwin":
		return dp.Darwin
	case "windows":
		return dp.Windows
	default:
		return dp.Linux
	}
}

// learningFilePath returns the default learning file path using the platform package.
func learningFilePath() string {
	return platform.LearningFilePath()
}
