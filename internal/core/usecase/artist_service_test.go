package usecase_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/usecase"
)

type mockArtistRepo struct {
	artists map[library.ArtistID]*library.Artist
}

func (m *mockArtistRepo) FindByID(ctx context.Context, id library.ArtistID) (*library.Artist, error) {
	if a, ok := m.artists[id]; ok {
		return a, nil
	}
	return nil, library.ErrArtistNotFound
}

func (m *mockArtistRepo) FindByName(ctx context.Context, name string) (*library.Artist, error) {
	return nil, library.ErrArtistNotFound
}

func (m *mockArtistRepo) List(ctx context.Context, offset, limit int) ([]library.Artist, int, error) {
	return nil, 0, nil
}

func (m *mockArtistRepo) Save(ctx context.Context, artist *library.Artist) error { return nil }

type mockAlbumRepo struct {
	albums []library.Album
}

func (m *mockAlbumRepo) FindByID(ctx context.Context, id library.AlbumID) (*library.Album, error) {
	for i := range m.albums {
		if m.albums[i].ID == id {
			return &m.albums[i], nil
		}
	}
	return nil, library.ErrAlbumNotFound
}

func (m *mockAlbumRepo) FindByTitleAndArtist(ctx context.Context, title string, artistID library.ArtistID) (*library.Album, error) {
	return nil, library.ErrAlbumNotFound
}

func (m *mockAlbumRepo) List(ctx context.Context, offset, limit int) ([]library.Album, int, error) {
	return m.albums, len(m.albums), nil
}

func (m *mockAlbumRepo) ListByArtistID(ctx context.Context, artistID library.ArtistID) ([]library.Album, error) {
	var list []library.Album
	for _, a := range m.albums {
		if a.ArtistID == artistID {
			list = append(list, a)
		}
	}
	return list, nil
}

func (m *mockAlbumRepo) Save(ctx context.Context, album *library.Album) error   { return nil }
func (m *mockAlbumRepo) Update(ctx context.Context, album *library.Album) error { return nil }

// pickyCoverStorage only finds pictures in the paths it was given, and counts attempts.
type pickyCoverStorage struct {
	mockAudioStorage
	withCover map[string]bool
	attempts  []string
}

func (s *pickyCoverStorage) ExtractCover(filePath string) (io.ReadCloser, string, error) {
	s.attempts = append(s.attempts, filePath)
	if !s.withCover[filePath] {
		return nil, "", errors.New("sem capa")
	}
	return io.NopCloser(bytes.NewReader([]byte("img:" + filePath))), "image/jpeg", nil
}

func newArtistFixture(t *testing.T) (*mockTrackReader, *mockAlbumRepo) {
	t.Helper()
	tracks := map[library.TrackID]*library.Track{}
	for _, spec := range []struct {
		id, artist, path string
	}{
		{"t1", "a1", "/music/a1/01.mp3"},
		{"t2", "a1", "/music/a1/02.mp3"},
		{"t3", "a2", "/music/a2/01.mp3"},
	} {
		tr, err := library.NewTrack(library.TrackID(spec.id), "Faixa "+spec.id, library.ArtistID(spec.artist), 180*time.Second, spec.path, 1, library.FormatMP3)
		if err != nil {
			t.Fatalf("fixture inválida: %v", err)
		}
		tracks[tr.ID] = tr
	}
	albums := &mockAlbumRepo{albums: []library.Album{
		{ID: "al-sem-capa", ArtistID: "a1", Title: "Sem capa"},
		{ID: "al-capa", ArtistID: "a1", Title: "Com capa", CoverPath: "/music/a1/cover.jpg"},
	}}
	return &mockTrackReader{tracks: tracks}, albums
}

func TestArtistService_ListArtistTracks(t *testing.T) {
	tracks, albums := newArtistFixture(t)
	svc := usecase.NewArtistService(&mockArtistRepo{}, albums, tracks, &mockAudioStorage{})

	got, err := svc.ListArtistTracks(context.Background(), "a1")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("esperava 2 faixas do artista a1, obteve %d", len(got))
	}
	for _, tr := range got {
		if tr.ArtistID != "a1" {
			t.Errorf("faixa de outro artista na lista: %s", tr.ID)
		}
	}
}

func TestArtistService_GetArtistCover_PrefersAlbumArt(t *testing.T) {
	tracks, albums := newArtistFixture(t)
	storage := &pickyCoverStorage{withCover: map[string]bool{"/music/a1/cover.jpg": true, "/music/a1/01.mp3": true}}
	svc := usecase.NewArtistService(&mockArtistRepo{}, albums, tracks, storage)

	cover, err := svc.GetArtistCover(context.Background(), "a1")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	defer cover.Content.Close()

	body, _ := io.ReadAll(cover.Content)
	if string(body) != "img:/music/a1/cover.jpg" {
		t.Fatalf("esperava a capa do álbum, obteve %q", body)
	}
	if cover.MIMEType != "image/jpeg" || cover.ETag == "" {
		t.Errorf("metadados da capa incompletos: %+v", cover)
	}
}

func TestArtistService_GetArtistCover_FallsBackToTracks(t *testing.T) {
	tracks, albums := newArtistFixture(t)
	albums.albums[1].CoverPath = "/music/a1/sumiu.jpg"
	storage := &pickyCoverStorage{withCover: map[string]bool{"/music/a1/02.mp3": true}}
	svc := usecase.NewArtistService(&mockArtistRepo{}, albums, tracks, storage)

	cover, err := svc.GetArtistCover(context.Background(), "a1")
	if err != nil {
		t.Fatalf("esperava capa vinda de uma faixa: %v", err)
	}
	defer cover.Content.Close()
	body, _ := io.ReadAll(cover.Content)
	if string(body) != "img:/music/a1/02.mp3" {
		t.Fatalf("esperava a capa embutida na faixa 02, obteve %q", body)
	}
}

func TestArtistService_GetArtistCover_NotFound(t *testing.T) {
	tracks, albums := newArtistFixture(t)
	storage := &pickyCoverStorage{withCover: map[string]bool{}}
	svc := usecase.NewArtistService(&mockArtistRepo{}, albums, tracks, storage)

	if _, err := svc.GetArtistCover(context.Background(), "a2"); err == nil {
		t.Fatal("esperava erro para artista sem nenhuma capa")
	}
	// a2 has no albums and a single track: exactly one file may be opened.
	if len(storage.attempts) != 1 {
		t.Fatalf("esperava 1 tentativa de leitura, obteve %d: %v", len(storage.attempts), storage.attempts)
	}
}
