package filesystem

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime"
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
	if err != nil || strings.HasPrefix(rel, "..") || rel == "." && s.rootDir != absPath {
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

// ExtractCover tries embedded metadata picture first, then adjacent folder images.
func (s *AudioStorage) ExtractCover(filePath string) (io.ReadCloser, string, error) {
	safePath, err := s.CleanPath(filePath)
	if err != nil {
		return nil, "", err
	}

	// 1. Try embedded cover
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

	// 2. Try directory cover files
	dir := filepath.Dir(safePath)
	candidateNames := []string{"cover.jpg", "cover.png", "folder.jpg", "folder.png", "front.jpg", "front.png"}
	for _, name := range candidateNames {
		coverPath := filepath.Join(dir, name)
		if info, err := os.Stat(coverPath); err == nil && !info.IsDir() {
			cFile, err := os.Open(coverPath)
			if err == nil {
				ext := strings.ToLower(filepath.Ext(coverPath))
				mimeType := mime.TypeByExtension(ext)
				if mimeType == "" {
					mimeType = "image/jpeg"
				}
				return cFile, mimeType, nil
			}
		}
	}

	return nil, "", ErrCoverNotFound
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
