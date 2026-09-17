package filesystem

import (
	"os"
	"path/filepath"
	"regexp"
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

var (
	ytNoiseRegex   = regexp.MustCompile(`(?i)\s*(\(|\[)(official\s*(music\s*)?(video|audio)|clip\s*oficial|v[ií]deo\s*oficial|visualizer|lyric\s*video|audio|4k|hd|remaster(ed)?|ao\s*vivo|live)(\)|\])`)
	ytIDRegex      = regexp.MustCompile(`\s*\[[a-zA-Z0-9_-]{11}\]`)
	trackNumPrefix = regexp.MustCompile(`^\s*\d{1,3}\s*[-._]\s*`)
)

func cleanTrackTitle(raw string) string {
	cleaned := ytNoiseRegex.ReplaceAllString(raw, "")
	cleaned = ytIDRegex.ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(cleaned)
	return cleaned
}

func (e *FileTagExtractor) ExtractMetadata(filePath string) (*ports.ExtractedMetadata, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	format, _ := library.ParseAudioFormat(ext)
	base := strings.TrimSuffix(filepath.Base(filePath), ext)

	title := base
	artist := "Unknown Artist"
	album := "Unknown Album"
	var trackNum int
	var year int
	var genre string
	var duration = 180 * time.Second
	var hasPic bool
	var picData []byte
	var picMIME string

	// 1. Try reading native ID3/Vorbis/MP4 tags
	file, err := os.Open(filePath)
	if err == nil {
		defer file.Close()
		if m, err := tag.ReadFrom(file); err == nil {
			if t := strings.TrimSpace(m.Title()); t != "" {
				title = t
			}
			if a := strings.TrimSpace(m.Artist()); a != "" {
				artist = a
			}
			if al := strings.TrimSpace(m.Album()); al != "" {
				album = al
			}
			if y := m.Year(); y > 0 {
				year = y
			}
			if tn, _ := m.Track(); tn > 0 {
				trackNum = tn
			}
			if g := strings.TrimSpace(m.Genre()); g != "" {
				genre = g
			}
			if pic := m.Picture(); pic != nil && len(pic.Data) > 0 {
				hasPic = true
				picData = pic.Data
				picMIME = pic.MIMEType
			}
		}
	}

	// 2. Clean YouTube & file naming noise
	title = cleanTrackTitle(title)

	// 3. Fallback: Parse "Artist - Title" if artist is unknown or in title
	if (artist == "Unknown Artist" || artist == "") && strings.Contains(title, " - ") {
		parts := strings.SplitN(title, " - ", 2)
		if len(parts) == 2 {
			candArtist := strings.TrimSpace(parts[0])
			candTitle := strings.TrimSpace(parts[1])
			if candArtist != "" && candTitle != "" {
				artist = candArtist
				title = candTitle
			}
		}
	}

	// Remove leading track number e.g. "01 - Bohemian Rhapsody" -> "Bohemian Rhapsody"
	title = trackNumPrefix.ReplaceAllString(title, "")
	title = strings.TrimSpace(title)
	if title == "" {
		title = base
	}

	// 4. Fallback from directory structure: /music/Artist/Album/Song.ext
	dir := filepath.Dir(filePath)
	parentFolder := filepath.Base(dir)
	grandParentFolder := filepath.Base(filepath.Dir(dir))

	if album == "Unknown Album" || album == "" {
		if parentFolder != "." && parentFolder != "/" && !strings.EqualFold(parentFolder, "music") {
			album = parentFolder
		}
	}

	if (artist == "Unknown Artist" || artist == "") {
		if grandParentFolder != "." && grandParentFolder != "/" && !strings.EqualFold(grandParentFolder, "music") {
			artist = grandParentFolder
		} else if parentFolder != "." && parentFolder != "/" && !strings.EqualFold(parentFolder, "music") {
			artist = parentFolder
		}
	}

	// 5. Check if same-base or directory cover exists
	if !hasPic {
		candidateImages := []string{
			filepath.Join(dir, base+".jpg"),
			filepath.Join(dir, base+".png"),
			filepath.Join(dir, "cover.jpg"),
			filepath.Join(dir, "folder.jpg"),
		}
		for _, imgPath := range candidateImages {
			if data, err := os.ReadFile(imgPath); err == nil && len(data) > 0 {
				hasPic = true
				picData = data
				picMIME = "image/jpeg"
				if strings.HasSuffix(imgPath, ".png") {
					picMIME = "image/png"
				}
				break
			}
		}
	}

	return &ports.ExtractedMetadata{
		Title:       title,
		Artist:      artist,
		Album:       album,
		Year:        year,
		TrackNumber: trackNum,
		Genre:       genre,
		Duration:    duration,
		Format:      format,
		HasPicture:  hasPic,
		PictureData: picData,
		PictureMIME: picMIME,
	}, nil
}
