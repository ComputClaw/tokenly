package logging

import (
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewLogger(t *testing.T) {
	logger, lvl := NewLogger("launcher", "info")
	require.NotNil(t, logger)
	require.NotNil(t, lvl)
	assert.Equal(t, slog.LevelInfo, lvl.Level())
}

func TestNewLoggerDynamicLevel(t *testing.T) {
	logger, lvl := NewLogger("worker", "debug")
	require.NotNil(t, logger)
	assert.Equal(t, slog.LevelDebug, lvl.Level())

	lvl.Set(slog.LevelError)
	assert.Equal(t, slog.LevelError, lvl.Level())
}

func TestParseLevel(t *testing.T) {
	tests := []struct {
		input    string
		expected slog.Level
	}{
		{"debug", slog.LevelDebug},
		{"DEBUG", slog.LevelDebug},
		{"info", slog.LevelInfo},
		{"INFO", slog.LevelInfo},
		{"warn", slog.LevelWarn},
		{"warning", slog.LevelWarn},
		{"error", slog.LevelError},
		{"ERROR", slog.LevelError},
		{"unknown", slog.LevelInfo},
		{"", slog.LevelInfo},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			assert.Equal(t, tt.expected, ParseLevel(tt.input))
		})
	}
}
