package logger

import (
	"log/slog"
	"os"
)

// Init initializes the global slog logger based on the environment.
func Init(env string) *slog.Logger {
	var handler slog.Handler

	opts := &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}

	if env == "production" {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		opts.Level = slog.LevelDebug
		handler = slog.NewTextHandler(os.Stdout, opts)
	}

	l := slog.New(handler)
	slog.SetDefault(l)
	return l
}
