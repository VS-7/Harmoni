package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"harmoni/internal/platform/config"
)

func TestConfigLoadDefaults(t *testing.T) {
	os.Unsetenv("PORT")
	os.Unsetenv("DATABASE_URL")
	os.Unsetenv("MUSIC_DIR")
	os.Unsetenv("DATA_DIR")
	os.Unsetenv("ENV")
	os.Unsetenv("DOWNLOAD_WORKERS")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("unexpected error loading config: %v", err)
	}

	if cfg.Port != "8080" {
		t.Errorf("expected port 8080, got %s", cfg.Port)
	}
	if cfg.Env != "development" {
		t.Errorf("expected env development, got %s", cfg.Env)
	}
	if cfg.DownloadWorkers != 1 {
		t.Errorf("expected download workers 1, got %d", cfg.DownloadWorkers)
	}
}

func TestConfigSingleWorkerGuardrail(t *testing.T) {
	os.Setenv("DOWNLOAD_WORKERS", "10")
	defer os.Unsetenv("DOWNLOAD_WORKERS")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Guardrail: must be clamped to 1
	if cfg.DownloadWorkers != 1 {
		t.Errorf("expected download workers to be clamped to 1, got %d", cfg.DownloadWorkers)
	}
}

func TestConfigPathCleaning(t *testing.T) {
	os.Setenv("MUSIC_DIR", "./music/../music")
	defer os.Unsetenv("MUSIC_DIR")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !filepath.IsAbs(cfg.MusicDir) {
		t.Errorf("expected absolute path, got %s", cfg.MusicDir)
	}
}
