package platform

import "runtime"

// OSName returns the OS name matching the protocol spec values: linux, windows, darwin.
func OSName() string {
	return runtime.GOOS
}

// ArchName returns the architecture name matching the protocol spec values: x64, arm64.
func ArchName() string {
	switch runtime.GOARCH {
	case "amd64":
		return "x64"
	case "arm64":
		return "arm64"
	default:
		return runtime.GOARCH
	}
}

// PlatformDetail returns a human-readable platform description.
func PlatformDetail() string {
	return runtime.GOOS + "/" + runtime.GOARCH
}
