//go:build darwin

package platform

// DataDir returns the data directory for macOS.
func DataDir() string { return "/Library/Application Support/Tokenly" }

// RunDir returns the runtime directory for macOS.
func RunDir() string { return "/var/run/tokenly" }

// LogDir returns the log directory for macOS.
func LogDir() string { return "/var/log/tokenly" }
