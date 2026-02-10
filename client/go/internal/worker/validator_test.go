package worker

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func writeJSONLFile(t *testing.T, dir, name string, lines []string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0644)
	require.NoError(t, err)
	return path
}

func validRecord() string {
	return `{"timestamp":"2025-01-15T10:30:00Z","service":"openai","model":"gpt-4","input_tokens":100,"output_tokens":50}`
}

func invalidRecord() string {
	return `{"not":"a valid record"}`
}

func TestValidateJSONLFile(t *testing.T) {
	tests := []struct {
		name           string
		lines          []string
		wantValid      bool
		wantTotal      int
		wantValidRecs  int
		wantInvalidRecs int
	}{
		{
			name:          "all valid records",
			lines:         []string{validRecord(), validRecord(), validRecord()},
			wantValid:     true,
			wantTotal:     3,
			wantValidRecs: 3,
		},
		{
			name: "mixed 70/30 above threshold",
			lines: []string{
				validRecord(), validRecord(), validRecord(),
				validRecord(), validRecord(), validRecord(),
				validRecord(), invalidRecord(), invalidRecord(),
				invalidRecord(),
			},
			wantValid:       true,
			wantTotal:       10,
			wantValidRecs:   7,
			wantInvalidRecs: 3,
		},
		{
			name: "mixed 30/70 below threshold",
			lines: []string{
				validRecord(), validRecord(), validRecord(),
				invalidRecord(), invalidRecord(), invalidRecord(),
				invalidRecord(), invalidRecord(), invalidRecord(),
				invalidRecord(),
			},
			wantValid:       false,
			wantTotal:       10,
			wantValidRecs:   3,
			wantInvalidRecs: 7,
		},
		{
			name:            "empty file",
			lines:           []string{},
			wantValid:       false,
			wantTotal:       0,
			wantValidRecs:   0,
			wantInvalidRecs: 0,
		},
		{
			name:            "file with only empty lines",
			lines:           []string{"", "", ""},
			wantValid:       false,
			wantTotal:       0,
			wantValidRecs:   0,
			wantInvalidRecs: 0,
		},
		{
			name:          "single valid record",
			lines:         []string{validRecord()},
			wantValid:     true,
			wantTotal:     1,
			wantValidRecs: 1,
		},
		{
			name: "missing timestamp",
			lines: []string{
				`{"service":"openai","model":"gpt-4"}`,
			},
			wantValid:       false,
			wantTotal:       1,
			wantInvalidRecs: 1,
		},
		{
			name: "missing service",
			lines: []string{
				`{"timestamp":"2025-01-15T10:30:00Z","model":"gpt-4"}`,
			},
			wantValid:       false,
			wantTotal:       1,
			wantInvalidRecs: 1,
		},
		{
			name: "missing model",
			lines: []string{
				`{"timestamp":"2025-01-15T10:30:00Z","service":"openai"}`,
			},
			wantValid:       false,
			wantTotal:       1,
			wantInvalidRecs: 1,
		},
		{
			name: "bad timestamp format",
			lines: []string{
				`{"timestamp":"2025-01-15 10:30:00","service":"openai","model":"gpt-4"}`,
			},
			wantValid:       false,
			wantTotal:       1,
			wantInvalidRecs: 1,
		},
		{
			name: "negative input_tokens",
			lines: []string{
				`{"timestamp":"2025-01-15T10:30:00Z","service":"openai","model":"gpt-4","input_tokens":-1}`,
			},
			wantValid:       false,
			wantTotal:       1,
			wantInvalidRecs: 1,
		},
		{
			name: "input_tokens over 1M",
			lines: []string{
				`{"timestamp":"2025-01-15T10:30:00Z","service":"openai","model":"gpt-4","input_tokens":1000001}`,
			},
			wantValid:       false,
			wantTotal:       1,
			wantInvalidRecs: 1,
		},
		{
			name: "negative output_tokens",
			lines: []string{
				`{"timestamp":"2025-01-15T10:30:00Z","service":"openai","model":"gpt-4","output_tokens":-5}`,
			},
			wantValid:       false,
			wantTotal:       1,
			wantInvalidRecs: 1,
		},
		{
			name: "output_tokens over 1M",
			lines: []string{
				`{"timestamp":"2025-01-15T10:30:00Z","service":"openai","model":"gpt-4","output_tokens":2000000}`,
			},
			wantValid:       false,
			wantTotal:       1,
			wantInvalidRecs: 1,
		},
		{
			name: "malformed JSON line",
			lines: []string{
				`not json at all`,
			},
			wantValid:       false,
			wantTotal:       1,
			wantInvalidRecs: 1,
		},
		{
			name: "exactly 50 percent valid",
			lines: []string{
				validRecord(), validRecord(),
				invalidRecord(), invalidRecord(),
			},
			wantValid:       true,
			wantTotal:       4,
			wantValidRecs:   2,
			wantInvalidRecs: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			path := writeJSONLFile(t, dir, "test.jsonl", tt.lines)

			result, err := ValidateJSONLFile(path)
			require.NoError(t, err)

			assert.Equal(t, tt.wantValid, result.Valid, "Valid")
			assert.Equal(t, tt.wantTotal, result.TotalLines, "TotalLines")
			if tt.wantValidRecs > 0 {
				assert.Equal(t, tt.wantValidRecs, result.ValidRecords, "ValidRecords")
			}
			if tt.wantInvalidRecs > 0 {
				assert.Equal(t, tt.wantInvalidRecs, result.InvalidRecords, "InvalidRecords")
			}
		})
	}
}

func TestValidateJSONLFile_FileNotFound(t *testing.T) {
	_, err := ValidateJSONLFile("/nonexistent/path/file.jsonl")
	assert.Error(t, err)
}
