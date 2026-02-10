package platform

import "path/filepath"

// IPCSocketPath returns the path to the IPC socket file.
func IPCSocketPath() string {
	return filepath.Join(RunDir(), "worker.sock")
}

// StateFilePath returns the path to the state file.
func StateFilePath() string {
	return filepath.Join(DataDir(), "tokenly-state.json")
}

// LearningFilePath returns the path to the learning data file.
func LearningFilePath() string {
	return filepath.Join(DataDir(), "tokenly-learning.json")
}
