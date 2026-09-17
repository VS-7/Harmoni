package ytdlp

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/ports"
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
// The exact files produced are read from yt-dlp itself instead of scanning the output directory.
func (d *Downloader) Download(ctx context.Context, canonicalURL string, subDir string) (*ports.DownloadResult, error) {
	ref, err := ingest.ParseDownloadURL(canonicalURL)
	if err != nil {
		return nil, fmt.Errorf("url insegura ou inválida para download: %w", err)
	}
	// Rebuild once more so only validated IDs reach the command line.
	safeURL := ref.CanonicalURL()
	isPlaylist := ref.Kind == ingest.KindPlaylist

	targetDir := d.outputDir
	if subDir != "" {
		targetDir = filepath.Join(d.outputDir, filepath.Clean(subDir))
		if !isWithin(d.outputDir, targetDir) {
			return nil, fmt.Errorf("subdiretório fora da pasta de downloads: %s", subDir)
		}
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			return nil, fmt.Errorf("falha ao criar subdiretório de download: %w", err)
		}
	}

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
		"--embed-metadata",
		"--write-thumbnail",
		"--convert-thumbnails", "jpg",
		"--embed-thumbnail",
		"--no-progress",
		"--no-simulate",
		// One final path per line on stdout, in download order.
		"--print", "after_move:filepath",
	}

	if isPlaylist {
		// Skip unavailable entries instead of aborting the whole playlist.
		args = append(args, "--yes-playlist", "--ignore-errors")
		if ref.IsMix() {
			args = append(args, "--playlist-end", strconv.Itoa(ingest.MixPlaylistLimit))
		}
	} else {
		args = append(args, "--no-playlist")
	}

	// "--" ends option parsing, so the URL can never be read as a flag.
	args = append(args, "--output", outputTemplate, "--", safeURL)

	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, "nice", args...)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()

	result := &ports.DownloadResult{
		Items:       d.collectItems(ctx, stdout.String(), targetDir),
		IsPlaylist:  isPlaylist,
		FailedItems: countErrorLines(stderr.String()),
	}

	if runErr != nil {
		// With --ignore-errors yt-dlp exits non-zero when any entry failed; partial playlists still count.
		if !isPlaylist || len(result.Items) == 0 {
			slog.ErrorContext(ctx, "falha ao executar yt-dlp", "stderr", stderr.String(), "err", runErr)
			return nil, fmt.Errorf("erro no download com yt-dlp: %w (%s)", runErr, lastErrorLine(stderr.String()))
		}
		slog.WarnContext(ctx, "playlist baixada parcialmente", "baixadas", len(result.Items), "falhas", result.FailedItems, "stderr", stderr.String())
	}

	if len(result.Items) == 0 {
		return nil, fmt.Errorf("nenhum arquivo de áudio foi gerado pelo download")
	}

	slog.InfoContext(ctx, "download concluído com sucesso", "arquivos", len(result.Items), "falhas", result.FailedItems, "isPlaylist", isPlaylist)
	return result, nil
}

func (d *Downloader) collectItems(ctx context.Context, stdout string, targetDir string) []ports.DownloadedItem {
	var items []ports.DownloadedItem
	seen := make(map[string]bool)

	scanner := bufio.NewScanner(strings.NewReader(stdout))
	for scanner.Scan() {
		audioPath := filepath.Clean(strings.TrimSpace(scanner.Text()))
		if audioPath == "." || seen[audioPath] {
			continue
		}
		// Guardrail 5: only accept files that really live inside the download directory.
		if !filepath.IsAbs(audioPath) || !isWithin(targetDir, audioPath) {
			slog.WarnContext(ctx, "yt-dlp reportou caminho fora da pasta de downloads, ignorando", "path", audioPath)
			continue
		}
		if _, err := os.Stat(audioPath); err != nil {
			slog.WarnContext(ctx, "arquivo reportado pelo yt-dlp não existe", "path", audioPath, "err", err)
			continue
		}
		seen[audioPath] = true

		item := ports.DownloadedItem{AudioPath: audioPath}
		coverPath := strings.TrimSuffix(audioPath, filepath.Ext(audioPath)) + ".jpg"
		if _, err := os.Stat(coverPath); err == nil {
			item.CoverPath = coverPath
		}
		items = append(items, item)
	}
	return items
}

func isWithin(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func countErrorLines(stderr string) int {
	count := 0
	for _, line := range strings.Split(stderr, "\n") {
		if strings.HasPrefix(line, "ERROR:") {
			count++
		}
	}
	return count
}

func lastErrorLine(stderr string) string {
	lines := strings.Split(strings.TrimSpace(stderr), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.HasPrefix(lines[i], "ERROR:") {
			return lines[i]
		}
	}
	if len(lines) > 0 {
		return lines[len(lines)-1]
	}
	return "sem detalhes"
}
