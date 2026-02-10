package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// StateFile represents the launcher's persistent state (spec 01, section "Runtime State File").
type StateFile struct {
	ServerEndpoint      string        `json:"server_endpoint"`
	Hostname            string        `json:"hostname"`
	WorkerStatus        string        `json:"worker_status"`
	WorkerPID           int           `json:"worker_pid"`
	WorkerVersion       string        `json:"worker_version"`
	LastHeartbeat       string        `json:"last_heartbeat,omitempty"`
	LastUpdateCheck     string        `json:"last_update_check,omitempty"`
	ServerApproved      bool          `json:"server_approved"`
	ConsecutiveFailures int           `json:"consecutive_failures"`
	ServerConfig        *ClientConfig `json:"server_config,omitempty"`
}

// LoadState reads and parses the state file from the given path.
// Returns a zero-value StateFile if the file does not exist.
func LoadState(path string) (*StateFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &StateFile{}, nil
		}
		return nil, fmt.Errorf("read state file: %w", err)
	}

	var state StateFile
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("parse state file: %w", err)
	}
	return &state, nil
}

// Save writes the state file to the given path atomically (temp file + rename).
func (s *StateFile) Save(path string) error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create state dir: %w", err)
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return fmt.Errorf("write temp state file: %w", err)
	}

	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("rename state file: %w", err)
	}
	return nil
}
