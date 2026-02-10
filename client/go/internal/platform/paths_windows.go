//go:build windows

package platform

import (
	"os"
	"path/filepath"
)

// DataDir returns the data directory for Windows.
func DataDir() string {
	return filepath.Join(os.Getenv("PROGRAMDATA"), "Tokenly")
}

// RunDir returns the runtime directory for Windows (same as data dir).
func RunDir() string {
	return filepath.Join(os.Getenv("PROGRAMDATA"), "Tokenly")
}

// LogDir returns the log directory for Windows.
func LogDir() string {
	return filepath.Join(os.Getenv("PROGRAMDATA"), "Tokenly", "logs")
}
