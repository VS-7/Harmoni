package ytdlp

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"harmoni/internal/core/domain/ingest"
)

type Downloader struct {
	outputDir string
}

func NewDownloader(outputDir string) (*Downloader, error) {
	absOut, err := filepath.Abs(filepath.Clean(outputDir))
	if err != nil {
		return nil, fmt.Errorf("caminho de saída inválido: %w", err)
	}
	if err := os.MkdirAll(absOut, 0755); err != nil {
		return nil, fmt.Errorf("falha ao criar pasta de downloads: %w", err)
	}
	return &Downloader{outputDir: absOut}, nil
}

// Download invokes yt-dlp throttled with nice -n 19 (Guardrails 4 & 5).
func (d *Downloader) Download(ctx context.Context, rawURL string, subDir string) (string, string, error) {
	safeURL, err := ingest.ValidateAndSanitizeURL(rawURL)
	if err != nil {
		return "", "", fmt.Errorf("url insegura ou inválida para download: %w", err)
	}

	targetDir := d.outputDir
	if subDir != "" {
		targetDir = filepath.Join(d.outputDir, filepath.Clean(subDir))
		_ = os.MkdirAll(targetDir, 0755)
	}

	outputTemplate := filepath.Join(targetDir, "%(title)s [%(id)s].%(ext)s")

	slog.InfoContext(ctx, "executando download via yt-dlp", "url", safeURL, "targetDir", targetDir)

	// Execute yt-dlp under nice -n 19 for low OS priority (Guardrail 4)
	args := []string{
		"-n", "19",
		"yt-dlp",
		"--extract-audio",
		"--audio-format", "mp3",
		"--audio-quality", "0",
		"--write-thumbnail",
		"--convert-thumbnails", "jpg",
		"--no-playlist",
		"--output", outputTemplate,
		safeURL,
	}

	cmd := exec.CommandContext(ctx, "nice", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		slog.ErrorContext(ctx, "falha ao executar yt-dlp", "output", string(output), "err", err)
		return "", "", fmt.Errorf("erro no download com yt-dlp: %w (output: %s)", err, string(output))
	}

	// Find newly created mp3 and jpg files
	var audioPath, coverPath string
	entries, _ := os.ReadDir(targetDir)
	for _, entry := range entries {
		name := entry.Name()
		full := filepath.Join(targetDir, name)
		if strings.HasSuffix(name, ".mp3") {
			audioPath = full
		} else if strings.HasSuffix(name, ".jpg") {
			coverPath = full
		}
	}

	if audioPath == "" {
		return "", "", fmt.Errorf("arquivo de áudio não foi encontrado após o download")
	}

	slog.InfoContext(ctx, "download concluído com sucesso", "audioPath", audioPath, "coverPath", coverPath)
	return audioPath, coverPath, nil
}
