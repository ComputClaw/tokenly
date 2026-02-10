package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// DirectoryStats holds learning data for a single directory.
type DirectoryStats struct {
	Path           string  `json:"path"`
	ScanCount      int     `json:"scan_count"`
	FileCount      int     `json:"file_count"`
	LastSuccess    string  `json:"last_success,omitempty"`
	SuccessRate    float64 `json:"success_rate"`
	AvgFilesPerScan float64 `json:"avg_files_per_scan"`
}

// LearningFile represents persisted learning data (spec 02, section "Learning Data Model").
type LearningFile struct {
	Directories   map[string]*DirectoryStats `json:"directories"`
	NegativeCache []string                   `json:"negative_cache"`
	LastUpdated   string                     `json:"last_updated"`
}

// NewLearningFile returns a new empty LearningFile.
func NewLearningFile() *LearningFile {
	return &LearningFile{
		Directories:   make(map[string]*DirectoryStats),
		NegativeCache: []string{},
	}
}

// LoadLearning reads and parses the learning file from the given path.
// Returns a new empty LearningFile if the file does not exist.
func LoadLearning(path string) (*LearningFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return NewLearningFile(), nil
		}
		return nil, fmt.Errorf("read learning file: %w", err)
	}

	var lf LearningFile
	if err := json.Unmarshal(data, &lf); err != nil {
		return nil, fmt.Errorf("parse learning file: %w", err)
	}
	if lf.Directories == nil {
		lf.Directories = make(map[string]*DirectoryStats)
	}
	if lf.NegativeCache == nil {
		lf.NegativeCache = []string{}
	}
	return &lf, nil
}

// Save writes the learning file to the given path atomically (temp file + rename).
func (lf *LearningFile) Save(path string) error {
	data, err := json.MarshalIndent(lf, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal learning data: %w", err)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create learning dir: %w", err)
	}

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return fmt.Errorf("write temp learning file: %w", err)
	}

	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("rename learning file: %w", err)
	}
	return nil
}
