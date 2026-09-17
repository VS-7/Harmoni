package filesystem

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dhowden/tag"
)

var (
	ErrDirectoryTraversal = errors.New("acesso negado: tentativa de traversal de diretório")
	ErrFileNotFound       = errors.New("arquivo não encontrado")
	ErrCoverNotFound      = errors.New("capa não encontrada")
)

type AudioStorage struct {
	rootDir string
}

func NewAudioStorage(rootDir string) (*AudioStorage, error) {
	absRoot, err := filepath.Abs(filepath.Clean(rootDir))
	if err != nil {
		return nil, fmt.Errorf("caminho raiz inválido %s: %w", rootDir, err)
	}
	return &AudioStorage{rootDir: absRoot}, nil
}

// CleanPath validates that the target file path resides strictly inside rootDir (Guardrail 5).
func (s *AudioStorage) CleanPath(path string) (string, error) {
	clean := filepath.Clean(path)
	absPath, err := filepath.Abs(clean)
	if err != nil {
		return "", fmt.Errorf("falha ao resolver caminho absoluto: %w", err)
	}

	rel, err := filepath.Rel(s.rootDir, absPath)
	if err != nil || strings.HasPrefix(rel, "..") || (rel == "." && s.rootDir != absPath) {
		return "", ErrDirectoryTraversal
	}

	return absPath, nil
}

// OpenAudio safely opens an audio file for streaming with Range requests.
func (s *AudioStorage) OpenAudio(filePath string) (io.ReadSeekCloser, int64, error) {
	safePath, err := s.CleanPath(filePath)
	if err != nil {
		return nil, 0, err
	}

	file, err := os.Open(safePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, 0, ErrFileNotFound
		}
		return nil, 0, fmt.Errorf("falha ao abrir arquivo: %w", err)
	}

	stat, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, 0, fmt.Errorf("falha ao obter metadados do arquivo: %w", err)
	}

	return file, stat.Size(), nil
}

// ExtractCover tries embedded cover first, then local image files, then generates a dynamic SVG.
func (s *AudioStorage) ExtractCover(filePath string) (io.ReadCloser, string, error) {
	safePath, err := s.CleanPath(filePath)
	if err != nil {
		return s.generateDefaultCover("Harmoni"), "image/svg+xml", nil
	}

	ext := strings.ToLower(filepath.Ext(safePath))

	// 1. If safePath is already an image, serve it directly
	if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" {
		if file, err := os.Open(safePath); err == nil {
			mimeType := mime.TypeByExtension(ext)
			if mimeType == "" {
				mimeType = "image/jpeg"
			}
			return file, mimeType, nil
		}
	}

	// 2. Try embedded cover from audio file
	if file, err := os.Open(safePath); err == nil {
		defer file.Close()
		if m, err := tag.ReadFrom(file); err == nil {
			if pic := m.Picture(); pic != nil && len(pic.Data) > 0 {
				mimeType := pic.MIMEType
				if mimeType == "" {
					mimeType = "image/jpeg"
				}
				return io.NopCloser(bytes.NewReader(pic.Data)), mimeType, nil
			}
		}
	}

	dir := filepath.Dir(safePath)
	baseNoExt := strings.TrimSuffix(filepath.Base(safePath), ext)

	// 3. Try same-basename image (e.g. Track.jpg alongside Track.mp3, common in yt-dlp)
	sameBaseCandidates := []string{
		filepath.Join(dir, baseNoExt+".jpg"),
		filepath.Join(dir, baseNoExt+".jpeg"),
		filepath.Join(dir, baseNoExt+".png"),
		filepath.Join(dir, baseNoExt+".webp"),
	}
	for _, cPath := range sameBaseCandidates {
		if file, err := os.Open(cPath); err == nil {
			mimeType := mime.TypeByExtension(filepath.Ext(cPath))
			if mimeType == "" {
				mimeType = "image/jpeg"
			}
			return file, mimeType, nil
		}
	}

	// 4. Try standard directory cover files
	stdCandidates := []string{"cover.jpg", "cover.png", "folder.jpg", "folder.png", "front.jpg", "front.png", "album.jpg"}
	for _, name := range stdCandidates {
		coverPath := filepath.Join(dir, name)
		if file, err := os.Open(coverPath); err == nil {
			mimeType := mime.TypeByExtension(filepath.Ext(coverPath))
			if mimeType == "" {
				mimeType = "image/jpeg"
			}
			return file, mimeType, nil
		}
	}

	// 5. Look for any image in the directory
	if entries, err := os.ReadDir(dir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			eExt := strings.ToLower(filepath.Ext(entry.Name()))
			if eExt == ".jpg" || eExt == ".jpeg" || eExt == ".png" || eExt == ".webp" {
				if file, err := os.Open(filepath.Join(dir, entry.Name())); err == nil {
					mimeType := mime.TypeByExtension(eExt)
					if mimeType == "" {
						mimeType = "image/jpeg"
					}
					return file, mimeType, nil
				}
			}
		}
	}

	// 6. Dynamic high-quality SVG placeholder with track title (Never 404)
	return s.generateDefaultCover(baseNoExt), "image/svg+xml", nil
}

func (s *AudioStorage) generateDefaultCover(label string) io.ReadCloser {
	safeLabel := url.PathEscape(label)
	if len(label) > 24 {
		safeLabel = label[:24] + "..."
	}

	svg := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <defs>
    <linearGradient id="grad" x1="0%%" y1="0%%" x2="100%%" y2="100%%">
      <stop offset="0%%" stop-color="#10b981"/>
      <stop offset="100%%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="100%%" height="100%%" fill="url(#grad)"/>
  <circle cx="250" cy="220" r="90" fill="#000000" fill-opacity="0.25"/>
  <path d="M220 180v80l60-40z" fill="#f8fafc"/>
  <text x="250" y="380" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="#f8fafc" text-anchor="middle">%s</text>
  <text x="250" y="415" font-family="system-ui, sans-serif" font-size="16" fill="#94a3b8" text-anchor="middle">Harmoni Audio</text>
</svg>`, safeLabel)

	return io.NopCloser(strings.NewReader(svg))
}

// Stat returns file size and modification time.
func (s *AudioStorage) Stat(filePath string) (int64, time.Time, error) {
	safePath, err := s.CleanPath(filePath)
	if err != nil {
		return 0, time.Time{}, err
	}

	stat, err := os.Stat(safePath)
	if err != nil {
		return 0, time.Time{}, err
	}
	return stat.Size(), stat.ModTime().UTC(), nil
}
