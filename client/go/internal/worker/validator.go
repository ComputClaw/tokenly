package worker

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// ValidationResult holds the outcome of validating a JSONL file.
type ValidationResult struct {
	TotalLines     int
	ValidRecords   int
	InvalidRecords int
	Valid          bool
}

// ValidateJSONLFile opens the file at path and validates each non-empty line
// as a token-usage JSON record. The file is considered valid if at least 50%
// of its non-empty lines are valid records.
func ValidateJSONLFile(path string) (*ValidationResult, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open file for validation: %w", err)
	}
	defer f.Close()

	result := &ValidationResult{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		result.TotalLines++

		var data map[string]any
		if err := json.Unmarshal([]byte(line), &data); err != nil {
			result.InvalidRecords++
			continue
		}

		if validateRecord(data) {
			result.ValidRecords++
		} else {
			result.InvalidRecords++
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan file: %w", err)
	}

	if result.TotalLines == 0 {
		result.Valid = false
	} else {
		result.Valid = result.ValidRecords >= (result.TotalLines+1)/2 // ceiling division for >= 50%
	}

	return result, nil
}

// validateRecord checks that a single parsed JSON record has the required
// fields and that optional numeric fields are within bounds.
func validateRecord(data map[string]any) bool {
	// timestamp: required, string, RFC 3339
	tsRaw, ok := data["timestamp"]
	if !ok {
		return false
	}
	ts, ok := tsRaw.(string)
	if !ok || ts == "" {
		return false
	}
	if _, err := time.Parse(time.RFC3339, ts); err != nil {
		return false
	}

	// service: required, non-empty string
	svcRaw, ok := data["service"]
	if !ok {
		return false
	}
	svc, ok := svcRaw.(string)
	if !ok || svc == "" {
		return false
	}

	// model: required, non-empty string
	modelRaw, ok := data["model"]
	if !ok {
		return false
	}
	mdl, ok := modelRaw.(string)
	if !ok || mdl == "" {
		return false
	}

	// input_tokens: optional, but if present must be a non-negative number <= 1,000,000
	if v, exists := data["input_tokens"]; exists {
		if !isValidTokenCount(v) {
			return false
		}
	}

	// output_tokens: optional, but if present must be a non-negative number <= 1,000,000
	if v, exists := data["output_tokens"]; exists {
		if !isValidTokenCount(v) {
			return false
		}
	}

	return true
}

// isValidTokenCount checks that v is a number, non-negative, and <= 1,000,000.
// JSON numbers are decoded as float64 by encoding/json into map[string]any.
func isValidTokenCount(v any) bool {
	n, ok := v.(float64)
	if !ok {
		return false
	}
	return n >= 0 && n <= 1_000_000
}
