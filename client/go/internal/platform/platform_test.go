package platform

import (
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOSName(t *testing.T) {
	name := OSName()
	assert.Equal(t, runtime.GOOS, name)
	assert.Contains(t, []string{"linux", "windows", "darwin"}, name)
}

func TestArchName(t *testing.T) {
	arch := ArchName()
	switch runtime.GOARCH {
	case "amd64":
		assert.Equal(t, "x64", arch)
	case "arm64":
		assert.Equal(t, "arm64", arch)
	default:
		assert.Equal(t, runtime.GOARCH, arch)
	}
}

func TestPlatformDetail(t *testing.T) {
	detail := PlatformDetail()
	require.NotEmpty(t, detail)
	assert.Contains(t, detail, "/")
}

func TestDataDir(t *testing.T) {
	dir := DataDir()
	require.NotEmpty(t, dir)
	assert.True(t, strings.Contains(dir, "tokenly") || strings.Contains(dir, "Tokenly"))
}

func TestRunDir(t *testing.T) {
	dir := RunDir()
	require.NotEmpty(t, dir)
}

func TestLogDir(t *testing.T) {
	dir := LogDir()
	require.NotEmpty(t, dir)
}

func TestIPCSocketPath(t *testing.T) {
	path := IPCSocketPath()
	require.NotEmpty(t, path)
	assert.Contains(t, path, "worker.sock")
}

func TestStateFilePath(t *testing.T) {
	path := StateFilePath()
	require.NotEmpty(t, path)
	assert.Contains(t, path, "tokenly-state.json")
}

func TestLearningFilePath(t *testing.T) {
	path := LearningFilePath()
	require.NotEmpty(t, path)
	assert.Contains(t, path, "tokenly-learning.json")
}
