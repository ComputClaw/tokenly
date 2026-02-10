package logging

import (
	"log/slog"
	"os"
	"strings"
)

// NewLogger creates a structured JSON logger for the given component.
// The level can be dynamically changed via the returned LevelVar.
func NewLogger(component, level string) (*slog.Logger, *slog.LevelVar) {
	lvl := &slog.LevelVar{}
	lvl.Set(ParseLevel(level))

	handler := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		Level: lvl,
	})

	logger := slog.New(handler).With("component", component)
	return logger, lvl
}

// ParseLevel converts a string level name to slog.Level.
func ParseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
