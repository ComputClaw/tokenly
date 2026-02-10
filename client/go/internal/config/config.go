package config

// ClientConfig matches the server's ClientConfig type exactly (api/src/models/client.ts:73-93).
type ClientConfig struct {
	ScanEnabled            bool            `json:"scan_enabled"`
	ScanIntervalMinutes    int             `json:"scan_interval_minutes"`
	MaxFileAgeHours        int             `json:"max_file_age_hours"`
	MaxFileSizeMB          int             `json:"max_file_size_mb"`
	WorkerTimeoutSeconds   int             `json:"worker_timeout_seconds"`
	MaxConcurrentUploads   int             `json:"max_concurrent_uploads"`
	DiscoveryPaths         DiscoveryPaths  `json:"discovery_paths"`
	FilePatterns           []string        `json:"file_patterns"`
	ExcludePatterns        []string        `json:"exclude_patterns"`
	HeartbeatIntervalSecs  int             `json:"heartbeat_interval_seconds"`
	RetryFailedUploads     bool            `json:"retry_failed_uploads"`
	RetryDelaySeconds      int             `json:"retry_delay_seconds"`
	LogLevel               string          `json:"log_level"`
	UpdateEnabled          bool            `json:"update_enabled"`
	UpdateCheckIntervalHrs int             `json:"update_check_interval_hours"`
}

// DiscoveryPaths holds per-platform discovery paths.
type DiscoveryPaths struct {
	Linux   []string `json:"linux"`
	Windows []string `json:"windows"`
	Darwin  []string `json:"darwin"`
}

// DefaultConfig returns a sensible default configuration used before the server provides one.
func DefaultConfig() ClientConfig {
	return ClientConfig{
		ScanEnabled:            true,
		ScanIntervalMinutes:    60,
		MaxFileAgeHours:        24,
		MaxFileSizeMB:          10,
		WorkerTimeoutSeconds:   30,
		MaxConcurrentUploads:   3,
		DiscoveryPaths: DiscoveryPaths{
			Linux:   []string{"/var/log", "/opt/*/logs", "/home/*/logs"},
			Windows: []string{"%APPDATA%/logs", "%PROGRAMDATA%/logs"},
			Darwin:  []string{"/var/log", "/usr/local/var/log"},
		},
		FilePatterns:           []string{"*.jsonl", "*token*.log", "*usage*.log"},
		ExcludePatterns:        []string{"*temp*", "*cache*", "*backup*"},
		HeartbeatIntervalSecs:  3600,
		RetryFailedUploads:     true,
		RetryDelaySeconds:      300,
		LogLevel:               "info",
		UpdateEnabled:          true,
		UpdateCheckIntervalHrs: 24,
	}
}
