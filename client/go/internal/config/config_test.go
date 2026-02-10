package config

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	assert.True(t, cfg.ScanEnabled)
	assert.Equal(t, 60, cfg.ScanIntervalMinutes)
	assert.Equal(t, 24, cfg.MaxFileAgeHours)
	assert.Equal(t, 10, cfg.MaxFileSizeMB)
	assert.Equal(t, 30, cfg.WorkerTimeoutSeconds)
	assert.Equal(t, 3, cfg.MaxConcurrentUploads)
	assert.NotEmpty(t, cfg.DiscoveryPaths.Linux)
	assert.NotEmpty(t, cfg.DiscoveryPaths.Windows)
	assert.NotEmpty(t, cfg.DiscoveryPaths.Darwin)
	assert.NotEmpty(t, cfg.FilePatterns)
	assert.NotEmpty(t, cfg.ExcludePatterns)
	assert.Equal(t, 3600, cfg.HeartbeatIntervalSecs)
	assert.True(t, cfg.RetryFailedUploads)
	assert.Equal(t, 300, cfg.RetryDelaySeconds)
	assert.Equal(t, "info", cfg.LogLevel)
	assert.True(t, cfg.UpdateEnabled)
	assert.Equal(t, 24, cfg.UpdateCheckIntervalHrs)
}

func TestConfigJSONRoundTrip(t *testing.T) {
	cfg := DefaultConfig()
	data, err := json.Marshal(cfg)
	require.NoError(t, err)

	var decoded ClientConfig
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Equal(t, cfg, decoded)
}

func TestConfigMatchesServerSchema(t *testing.T) {
	// Verify JSON keys match server's ClientConfig exactly
	serverJSON := `{
		"scan_enabled": true,
		"scan_interval_minutes": 60,
		"max_file_age_hours": 24,
		"max_file_size_mb": 10,
		"worker_timeout_seconds": 30,
		"max_concurrent_uploads": 3,
		"discovery_paths": {
			"linux": ["/var/log"],
			"windows": ["%APPDATA%/logs"],
			"darwin": ["/var/log"]
		},
		"file_patterns": ["*.jsonl"],
		"exclude_patterns": ["*temp*"],
		"heartbeat_interval_seconds": 3600,
		"retry_failed_uploads": true,
		"retry_delay_seconds": 300,
		"log_level": "info",
		"update_enabled": true,
		"update_check_interval_hours": 24
	}`

	var cfg ClientConfig
	err := json.Unmarshal([]byte(serverJSON), &cfg)
	require.NoError(t, err)
	assert.True(t, cfg.ScanEnabled)
	assert.Equal(t, 60, cfg.ScanIntervalMinutes)
	assert.Equal(t, 3600, cfg.HeartbeatIntervalSecs)
	assert.Equal(t, []string{"/var/log"}, cfg.DiscoveryPaths.Linux)
}
