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

// Download invokes yt-dlp throttled with nice -n 19, supporting single tracks or full playlists (Guardrails 4 & 5).
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

	isPlaylist := strings.Contains(safeURL, "list=") || strings.Contains(safeURL, "/playlist")

	var outputTemplate string
	if isPlaylist {
		outputTemplate = filepath.Join(targetDir, "%(playlist_title,playlist)s", "%(playlist_index)02d - %(artist,creator,channel)s - %(title)s [%(id)s].%(ext)s")
	} else {
		outputTemplate = filepath.Join(targetDir, "%(artist,creator,channel)s - %(title)s [%(id)s].%(ext)s")
	}

	slog.InfoContext(ctx, "executando download via yt-dlp", "url", safeURL, "isPlaylist", isPlaylist, "targetDir", targetDir)

	args := []string{
		"-n", "19",
		"yt-dlp",
		"--extract-audio",
		"--audio-format", "mp3",
		"--audio-quality", "0",
		"--add-metadata",
		"--embed-metadata",
		"--write-thumbnail",
		"--convert-thumbnails", "jpg",
		"--embed-thumbnail",
	}

	if isPlaylist {
		args = append(args, "--yes-playlist")
	} else {
		args = append(args, "--no-playlist")
	}

	args = append(args, "--output", outputTemplate, safeURL)

	cmd := exec.CommandContext(ctx, "nice", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		slog.ErrorContext(ctx, "falha ao executar yt-dlp", "output", string(output), "err", err)
		return "", "", fmt.Errorf("erro no download com yt-dlp: %w (output: %s)", err, string(output))
	}

	// Walk target directory recursively to find the downloaded audio and cover
	var audioPath, coverPath string
	_ = filepath.Walk(targetDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		name := strings.ToLower(info.Name())
		if strings.HasSuffix(name, ".mp3") {
			audioPath = path
		} else if strings.HasSuffix(name, ".jpg") || strings.HasSuffix(name, ".png") {
			coverPath = path
		}
		return nil
	})

	if audioPath == "" {
		return "", "", fmt.Errorf("nenhum arquivo de áudio foi encontrado após o download")
	}

	slog.InfoContext(ctx, "download concluído com sucesso", "audioPath", audioPath, "coverPath", coverPath, "isPlaylist", isPlaylist)
	return audioPath, coverPath, nil
}
