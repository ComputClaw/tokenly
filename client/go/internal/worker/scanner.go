package worker

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/bmatcuk/doublestar/v4"
)

// FileCandidate represents a file discovered during scanning.
type FileCandidate struct {
	Path       string
	SizeBytes  int64
	ModifiedAt time.Time
}

// ScannerConfig holds settings that control file discovery.
type ScannerConfig struct {
	DiscoveryPaths  []string
	FilePatterns    []string
	ExcludePatterns []string
	MaxFileAgeHours int
	MaxFileSizeMB   int
	MaxDepth        int
	MaxFiles        int
}

// Scanner discovers JSONL files on the local filesystem.
type Scanner struct {
	config  ScannerConfig
	learner *Learner
	logger  *slog.Logger
}

// NewScanner creates a Scanner with the given configuration.
func NewScanner(cfg ScannerConfig, learner *Learner, logger *slog.Logger) *Scanner {
	if cfg.MaxDepth <= 0 {
		cfg.MaxDepth = 10
	}
	if cfg.MaxFiles <= 0 {
		cfg.MaxFiles = 1000
	}
	return &Scanner{config: cfg, learner: learner, logger: logger}
}

// Scan discovers file candidates across configured and learned paths.
func (s *Scanner) Scan(ctx context.Context) ([]FileCandidate, error) {
	var candidates []FileCandidate
	seen := make(map[string]bool)

	// Phase 1: Priority paths from learner (skip negative cached).
	if s.learner != nil {
		for _, p := range s.learner.GetPriorityPaths() {
			if err := ctx.Err(); err != nil {
				return candidates, nil
			}
			found, err := s.scanPath(ctx, p, seen)
			if err != nil {
				s.logger.Warn("error scanning priority path", "path", p, "error", err)
				continue
			}
			candidates = append(candidates, found...)
			if len(candidates) >= s.config.MaxFiles {
				break
			}
		}
	}

	// Phase 2: Base paths from config (skip already scanned in phase 1).
	if len(candidates) < s.config.MaxFiles {
		for _, rawPath := range s.config.DiscoveryPaths {
			if err := ctx.Err(); err != nil {
				return candidates, nil
			}
			expanded := os.ExpandEnv(rawPath)
			if seen[expanded] {
				continue
			}
			found, err := s.scanPath(ctx, expanded, seen)
			if err != nil {
				s.logger.Warn("error scanning config path", "path", expanded, "error", err)
				continue
			}
			candidates = append(candidates, found...)
			if len(candidates) >= s.config.MaxFiles {
				break
			}
		}
	}

	// Phase 3: Exploratory — 10% chance to try parent dirs of known paths.
	if len(candidates) < s.config.MaxFiles && s.learner != nil && rand.Float64() < 0.1 {
		for _, p := range s.learner.GetPriorityPaths() {
			if err := ctx.Err(); err != nil {
				return candidates, nil
			}
			parent := filepath.Dir(p)
			if seen[parent] || parent == p {
				continue
			}
			found, err := s.scanPath(ctx, parent, seen)
			if err != nil {
				s.logger.Warn("error scanning exploratory path", "path", parent, "error", err)
				continue
			}
			candidates = append(candidates, found...)
			if len(candidates) >= s.config.MaxFiles {
				break
			}
		}
	}

	// Cap at MaxFiles.
	if len(candidates) > s.config.MaxFiles {
		candidates = candidates[:s.config.MaxFiles]
	}

	// Sort by ModifiedAt ascending (oldest first).
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].ModifiedAt.Before(candidates[j].ModifiedAt)
	})

	return candidates, nil
}

// scanPath walks a single base path, expanding globs and collecting matching files.
func (s *Scanner) scanPath(ctx context.Context, basePath string, seen map[string]bool) ([]FileCandidate, error) {
	seen[basePath] = true

	var candidates []FileCandidate
	now := time.Now()
	maxAge := time.Duration(s.config.MaxFileAgeHours) * time.Hour
	maxSize := int64(s.config.MaxFileSizeMB) * 1024 * 1024

	// Expand glob patterns in the base path itself (e.g., /opt/*/logs).
	expanded, err := doublestar.FilepathGlob(basePath)
	if err != nil {
		return nil, fmt.Errorf("expand glob %q: %w", basePath, err)
	}
	if len(expanded) == 0 {
		// Not a glob — treat as literal path.
		expanded = []string{basePath}
	}

	for _, dir := range expanded {
		if err := ctx.Err(); err != nil {
			return candidates, nil
		}

		info, err := os.Stat(dir)
		if err != nil {
			if os.IsNotExist(err) || os.IsPermission(err) {
				s.logger.Warn("cannot access path", "path", dir, "error", err)
				continue
			}
			return nil, fmt.Errorf("stat %q: %w", dir, err)
		}
		if !info.IsDir() {
			continue
		}

		err = s.walkDir(ctx, dir, 0, now, maxAge, maxSize, &candidates)
		if err != nil {
			s.logger.Warn("error walking directory", "path", dir, "error", err)
		}
	}

	return candidates, nil
}

// walkDir recursively walks a directory up to MaxDepth, collecting matching files.
func (s *Scanner) walkDir(ctx context.Context, dir string, depth int, now time.Time, maxAge time.Duration, maxSize int64, candidates *[]FileCandidate) error {
	if depth > s.config.MaxDepth {
		return nil
	}
	if err := ctx.Err(); err != nil {
		return nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsPermission(err) {
			s.logger.Warn("permission denied", "path", dir)
			return nil
		}
		return fmt.Errorf("read dir %q: %w", dir, err)
	}

	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return nil
		}
		if len(*candidates) >= s.config.MaxFiles {
			return nil
		}

		fullPath := filepath.Join(dir, entry.Name())

		if entry.IsDir() {
			if err := s.walkDir(ctx, fullPath, depth+1, now, maxAge, maxSize, candidates); err != nil {
				return err
			}
			continue
		}

		name := entry.Name()

		// Check exclude patterns first.
		if matchesAny(name, s.config.ExcludePatterns) {
			continue
		}

		// Check file patterns.
		if !matchesAny(name, s.config.FilePatterns) {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			s.logger.Warn("cannot stat file", "path", fullPath, "error", err)
			continue
		}

		// Filter by age.
		if maxAge > 0 && now.Sub(info.ModTime()) > maxAge {
			continue
		}

		// Filter by size.
		if maxSize > 0 && info.Size() > maxSize {
			continue
		}

		*candidates = append(*candidates, FileCandidate{
			Path:       fullPath,
			SizeBytes:  info.Size(),
			ModifiedAt: info.ModTime(),
		})
	}

	return nil
}

// matchesAny returns true if name matches any of the given glob patterns.
func matchesAny(name string, patterns []string) bool {
	for _, pattern := range patterns {
		matched, err := doublestar.Match(pattern, name)
		if err == nil && matched {
			return true
		}
	}
	return false
}
