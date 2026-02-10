//go:build linux

package platform

// DataDir returns the data directory for Linux.
func DataDir() string { return "/var/lib/tokenly" }

// RunDir returns the runtime directory for Linux.
func RunDir() string { return "/var/run/tokenly" }

// LogDir returns the log directory for Linux.
func LogDir() string { return "/var/log/tokenly" }
