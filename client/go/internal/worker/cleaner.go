package worker

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// Cleaner removes uploaded files and empty parent directories.
type Cleaner struct {
	protectedPaths []string
	logger         *slog.Logger
}

// NewCleaner creates a Cleaner that will never remove directories in protectedPaths.
func NewCleaner(protectedPaths []string, logger *slog.Logger) *Cleaner {
	// Normalize protected paths.
	normalized := make([]string, len(protectedPaths))
	for i, p := range protectedPaths {
		normalized[i] = filepath.Clean(p)
	}
	return &Cleaner{
		protectedPaths: normalized,
		logger:         logger,
	}
}

// CleanupFile deletes the file and removes empty parent directories up to a
// protected or root boundary.
func (c *Cleaner) CleanupFile(path string) error {
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("remove file %q: %w", path, err)
	}
	c.logger.Debug("deleted file", "path", path)

	// Walk up parent directories, removing empty ones.
	dir := filepath.Dir(path)
	for {
		dir = filepath.Clean(dir)

		if c.isProtectedPath(dir) {
			break
		}

		// Check if directory is empty.
		entries, err := os.ReadDir(dir)
		if err != nil {
			break
		}
		if len(entries) > 0 {
			break
		}

		if err := os.Remove(dir); err != nil {
			break
		}
		c.logger.Debug("removed empty directory", "path", dir)

		parent := filepath.Dir(dir)
		if parent == dir {
			// Reached filesystem root.
			break
		}
		dir = parent
	}

	return nil
}

// isProtectedPath returns true if dir is a protected path or a filesystem root.
func (c *Cleaner) isProtectedPath(dir string) bool {
	cleaned := filepath.Clean(dir)

	// Check filesystem root.
	if cleaned == filepath.VolumeName(cleaned)+string(filepath.Separator) {
		return true
	}
	// On Windows, volume root like "C:" without trailing separator.
	if filepath.VolumeName(cleaned) == cleaned {
		return true
	}

	for _, pp := range c.protectedPaths {
		if strings.EqualFold(cleaned, pp) {
			return true
		}
	}
	return false
}
