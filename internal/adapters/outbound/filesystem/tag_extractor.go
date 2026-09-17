package filesystem

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dhowden/tag"
	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

type FileTagExtractor struct{}

func NewTagExtractor() *FileTagExtractor {
	return &FileTagExtractor{}
}

func (e *FileTagExtractor) ExtractMetadata(filePath string) (*ports.ExtractedMetadata, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("falha ao abrir arquivo para leitura de tags: %w", err)
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(filePath))
	format, _ := library.ParseAudioFormat(ext)

	m, err := tag.ReadFrom(file)
	if err != nil {
		// Even if metadata parsing fails, provide basic fallback from filename
		base := strings.TrimSuffix(filepath.Base(filePath), ext)
		return &ports.ExtractedMetadata{
			Title:    base,
			Artist:   "Unknown Artist",
			Album:    "Unknown Album",
			Duration: 180 * time.Second,
			Format:   format,
		}, nil
	}

	trackNum, _ := m.Track()
	year := m.Year()

	var picData []byte
	var picMIME string
	hasPic := false
	if pic := m.Picture(); pic != nil {
		picData = pic.Data
		picMIME = pic.MIMEType
		hasPic = true
	}

	title := strings.TrimSpace(m.Title())
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(filePath), ext)
	}

	artist := strings.TrimSpace(m.Artist())
	if artist == "" {
		artist = "Unknown Artist"
	}

	album := strings.TrimSpace(m.Album())
	if album == "" {
		album = "Unknown Album"
	}

	return &ports.ExtractedMetadata{
		Title:       title,
		Artist:      artist,
		Album:       album,
		Year:        year,
		TrackNumber: trackNum,
		Genre:       m.Genre(),
		Duration:    180 * time.Second, // Default estimation if header doesn't specify duration
		Format:      format,
		HasPicture:  hasPic,
		PictureData: picData,
		PictureMIME: picMIME,
	}, nil
}
