package usecase_test

import (
	"bytes"
	"context"
	"io"
	"testing"
	"time"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/usecase"
)

type mockReadSeekCloser struct {
	*bytes.Reader
}

func (m *mockReadSeekCloser) Close() error {
	return nil
}

type mockTrackReader struct {
	tracks map[library.TrackID]*library.Track
}

func (m *mockTrackReader) FindByID(ctx context.Context, id library.TrackID) (*library.Track, error) {
	if tr, ok := m.tracks[id]; ok {
		return tr, nil
	}
	return nil, library.ErrTrackNotFound
}

func (m *mockTrackReader) FindByFilePath(ctx context.Context, filePath string) (*library.Track, error) {
	for _, tr := range m.tracks {
		if tr.FilePath == filePath {
			return tr, nil
		}
	}
	return nil, library.ErrTrackNotFound
}

func (m *mockTrackReader) List(ctx context.Context, offset, limit int, query string) ([]library.Track, int, error) {
	var list []library.Track
	for _, tr := range m.tracks {
		list = append(list, *tr)
	}
	return list, len(list), nil
}

func (m *mockTrackReader) ListByAlbumID(ctx context.Context, albumID library.AlbumID) ([]library.Track, error) {
	var list []library.Track
	for _, tr := range m.tracks {
		if tr.AlbumID != nil && *tr.AlbumID == albumID {
			list = append(list, *tr)
		}
	}
	return list, nil
}

func (m *mockTrackReader) ListByArtistID(ctx context.Context, artistID library.ArtistID) ([]library.Track, error) {
	var list []library.Track
	for _, tr := range m.tracks {
		if tr.ArtistID == artistID {
			list = append(list, *tr)
		}
	}
	return list, nil
}

type mockAudioStorage struct{}

func (m *mockAudioStorage) OpenAudio(filePath string) (io.ReadSeekCloser, int64, error) {
	data := []byte("audio-data-stream-test")
	return &mockReadSeekCloser{Reader: bytes.NewReader(data)}, int64(len(data)), nil
}

func (m *mockAudioStorage) ExtractCover(filePath string) (io.ReadCloser, string, error) {
	data := []byte("fake-image-png")
	return io.NopCloser(bytes.NewReader(data)), "image/png", nil
}

func (m *mockAudioStorage) Stat(filePath string) (int64, time.Time, error) {
	return 100, time.Now().UTC(), nil
}

func (m *mockAudioStorage) CleanPath(path string) (string, error) {
	return path, nil
}

func TestStreamTrack(t *testing.T) {
	ctx := context.Background()
	tr, _ := library.NewTrack("t1", "Bohemian Rhapsody", "a1", 354*time.Second, "/music/queen/bohemian.mp3", 1024, library.FormatMP3)
	reader := &mockTrackReader{
		tracks: map[library.TrackID]*library.Track{
			"t1": tr,
		},
	}
	storage := &mockAudioStorage{}

	svc := usecase.NewTrackService(reader, storage)

	res, err := svc.StreamTrack(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer res.Content.Close()

	if res.FileFormat != library.FormatMP3 {
		t.Errorf("expected MP3 format, got %s", res.FileFormat)
	}
	if res.MIMEType != "audio/mpeg" {
		t.Errorf("expected audio/mpeg MIME, got %s", res.MIMEType)
	}
	if res.ETag == "" {
		t.Errorf("expected non-empty ETag")
	}

	buf := make([]byte, 5)
	n, err := res.Content.Read(buf)
	if err != nil || n != 5 {
		t.Errorf("failed to read from stream: %v", err)
	}
}

func TestGetCoverArt(t *testing.T) {
	ctx := context.Background()
	tr, _ := library.NewTrack("t1", "Bohemian Rhapsody", "a1", 354*time.Second, "/music/queen/bohemian.mp3", 1024, library.FormatMP3)
	reader := &mockTrackReader{
		tracks: map[library.TrackID]*library.Track{
			"t1": tr,
		},
	}
	storage := &mockAudioStorage{}

	svc := usecase.NewTrackService(reader, storage)
	res, err := svc.GetCoverArt(ctx, "t1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer res.Content.Close()

	if res.MIMEType != "image/png" {
		t.Errorf("expected image/png, got %s", res.MIMEType)
	}
}
