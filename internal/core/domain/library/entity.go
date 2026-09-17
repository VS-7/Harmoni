package library

import (
	"strings"
	"time"
)

type Artist struct {
	ID        ArtistID
	Name      string
	CreatedAt time.Time
}

func NewArtist(id ArtistID, name string) (*Artist, error) {
	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		return nil, ErrEmptyArtistName
	}
	return &Artist{
		ID:        id,
		Name:      cleanName,
		CreatedAt: time.Now().UTC(),
	}, nil
}

type Album struct {
	ID        AlbumID
	ArtistID  ArtistID
	Title     string
	Year      int
	CoverPath string
	CreatedAt time.Time
}

func NewAlbum(id AlbumID, artistID ArtistID, title string, year int, coverPath string) (*Album, error) {
	cleanTitle := strings.TrimSpace(title)
	if cleanTitle == "" {
		return nil, ErrEmptyAlbumTitle
	}
	return &Album{
		ID:        id,
		ArtistID:  artistID,
		Title:     cleanTitle,
		Year:      year,
		CoverPath: coverPath,
		CreatedAt: time.Now().UTC(),
	}, nil
}

type Track struct {
	ID          TrackID
	AlbumID     *AlbumID
	ArtistID    ArtistID
	ArtistName  string
	AlbumTitle  string
	Title       string
	TrackNumber int
	Duration    time.Duration
	FilePath    string
	FileFormat  AudioFormat
	FileSize    int64
	Bitrate     int
	Genre       string
	Embedding   []float32
	CreatedAt   time.Time
}

func NewTrack(id TrackID, title string, artistID ArtistID, duration time.Duration, path string, size int64, format AudioFormat) (*Track, error) {
	if strings.TrimSpace(string(id)) == "" {
		return nil, ErrEmptyTrackID
	}
	cleanTitle := strings.TrimSpace(title)
	if cleanTitle == "" {
		return nil, ErrEmptyTitle
	}
	if duration <= 0 {
		return nil, ErrInvalidTrackDuration
	}
	cleanPath := strings.TrimSpace(path)
	if cleanPath == "" {
		return nil, ErrEmptyFilePath
	}

	return &Track{
		ID:         id,
		ArtistID:   artistID,
		Title:      cleanTitle,
		Duration:   duration,
		FilePath:   cleanPath,
		FileSize:   size,
		FileFormat: format,
		CreatedAt:  time.Now().UTC(),
	}, nil
}

func (t *Track) SetAlbum(albumID AlbumID, trackNumber int) {
	t.AlbumID = &albumID
	t.TrackNumber = trackNumber
}

func (t *Track) SetMetadata(bitrate int, genre string) {
	t.Bitrate = bitrate
	t.Genre = strings.TrimSpace(genre)
}

func (t *Track) SetEmbedding(embedding []float32) {
	t.Embedding = embedding
}
