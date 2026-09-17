package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	Port            string
	DatabaseURL     string
	MusicDir        string
	DataDir         string
	Env             string
	DownloadWorkers int
}

func Load() (*Config, error) {
	port := getEnv("PORT", "8080")
	dbURL := getEnv("DATABASE_URL", "postgres://harmoni:harmoni_secret@localhost:5432/harmoni?sslmode=disable")
	musicDir := getEnv("MUSIC_DIR", "./music")
	dataDir := getEnv("DATA_DIR", "./data")
	env := getEnv("ENV", "development")

	cleanMusicDir, err := filepath.Abs(filepath.Clean(musicDir))
	if err != nil {
		return nil, fmt.Errorf("caminho de música inválido %q: %w", musicDir, err)
	}

	cleanDataDir, err := filepath.Abs(filepath.Clean(dataDir))
	if err != nil {
		return nil, fmt.Errorf("caminho de dados inválido %q: %w", dataDir, err)
	}

	workersStr := getEnv("DOWNLOAD_WORKERS", "1")
	workers, err := strconv.Atoi(workersStr)
	if err != nil || workers <= 0 {
		workers = 1
	}
	// Guardrail 4: strict single worker for throttled media downloads
	if workers > 1 {
		workers = 1
	}

	return &Config{
		Port:            port,
		DatabaseURL:     dbURL,
		MusicDir:        cleanMusicDir,
		DataDir:         cleanDataDir,
		Env:             env,
		DownloadWorkers: workers,
	}, nil
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}
