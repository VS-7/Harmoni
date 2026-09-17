package usecase_test

import (
	"context"
	"testing"
	"time"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/playlist"
	"harmoni/internal/core/usecase"
)

type mockPlaylistRepo struct {
	playlists map[playlist.PlaylistID]*playlist.Playlist
	tracks    map[playlist.PlaylistID][]library.Track
}

func newMockPlaylistRepo() *mockPlaylistRepo {
	return &mockPlaylistRepo{
		playlists: make(map[playlist.PlaylistID]*playlist.Playlist),
		tracks:    make(map[playlist.PlaylistID][]library.Track),
	}
}

func (m *mockPlaylistRepo) Save(ctx context.Context, pl *playlist.Playlist) error {
	if pl.ID == "" {
		pl.ID = "generated-pl-id"
	}
	m.playlists[pl.ID] = pl
	return nil
}

func (m *mockPlaylistRepo) FindByID(ctx context.Context, id playlist.PlaylistID) (*playlist.Playlist, error) {
	pl, ok := m.playlists[id]
	if !ok {
		return nil, playlist.ErrPlaylistNotFound
	}
	pl.Tracks = m.tracks[id]
	pl.TrackCount = len(pl.Tracks)
	return pl, nil
}

func (m *mockPlaylistRepo) FindByName(ctx context.Context, name string) (*playlist.Playlist, error) {
	for _, pl := range m.playlists {
		if pl.Name == name {
			return pl, nil
		}
	}
	return nil, playlist.ErrPlaylistNotFound
}

func (m *mockPlaylistRepo) ListAll(ctx context.Context) ([]*playlist.Playlist, error) {
	var list []*playlist.Playlist
	for _, pl := range m.playlists {
		list = append(list, pl)
	}
	return list, nil
}

func (m *mockPlaylistRepo) Delete(ctx context.Context, id playlist.PlaylistID) error {
	delete(m.playlists, id)
	delete(m.tracks, id)
	return nil
}

func (m *mockPlaylistRepo) AddTrack(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID, position int) error {
	m.tracks[playlistID] = append(m.tracks[playlistID], library.Track{ID: trackID})
	return nil
}

func (m *mockPlaylistRepo) RemoveTrack(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID) error {
	var updated []library.Track
	for _, t := range m.tracks[playlistID] {
		if t.ID != trackID {
			updated = append(updated, t)
		}
	}
	m.tracks[playlistID] = updated
	return nil
}

func (m *mockPlaylistRepo) GetTracks(ctx context.Context, playlistID playlist.PlaylistID) ([]library.Track, error) {
	return m.tracks[playlistID], nil
}

type mockTrackRepo struct{}

func (m *mockTrackRepo) FindByID(ctx context.Context, id library.TrackID) (*library.Track, error) {
	return &library.Track{
		ID:         id,
		ArtistID:   "art-1",
		ArtistName: "Test Artist",
		Title:      "Test Song",
		Duration:   200 * time.Second,
	}, nil
}
func (m *mockTrackRepo) FindByFilePath(ctx context.Context, path string) (*library.Track, error) {
	return nil, nil
}
func (m *mockTrackRepo) List(ctx context.Context, offset, limit int, query string) ([]library.Track, int, error) {
	return nil, 0, nil
}
func (m *mockTrackRepo) ListByAlbumID(ctx context.Context, albumID library.AlbumID) ([]library.Track, error) {
	return nil, nil
}
func (m *mockTrackRepo) ListByArtistID(ctx context.Context, artistID library.ArtistID) ([]library.Track, error) {
	return nil, nil
}
func (m *mockTrackRepo) Save(ctx context.Context, t *library.Track) error   { return nil }
func (m *mockTrackRepo) Update(ctx context.Context, t *library.Track) error { return nil }
func (m *mockTrackRepo) Delete(ctx context.Context, id library.TrackID) error {
	return nil
}

func TestPlaylistService_CreateAndManage(t *testing.T) {
	repo := newMockPlaylistRepo()
	trackRepo := &mockTrackRepo{}
	svc := usecase.NewPlaylistService(repo, trackRepo, nil)

	ctx := context.Background()

	// 1. Create Playlist
	pl, err := svc.CreatePlaylist(ctx, "Minha Playlist", "Desc")
	if err != nil {
		t.Fatalf("falha ao criar playlist: %v", err)
	}
	if pl.Name != "Minha Playlist" {
		t.Fatalf("nome incorreto: %v", pl.Name)
	}

	// 2. Add Track
	if err := svc.AddTrackToPlaylist(ctx, pl.ID, "track-1"); err != nil {
		t.Fatalf("falha ao adicionar faixa: %v", err)
	}

	// 3. Get Playlist
	fetched, err := svc.GetPlaylist(ctx, pl.ID)
	if err != nil {
		t.Fatalf("falha ao buscar playlist: %v", err)
	}
	if fetched.TrackCount != 1 {
		t.Fatalf("esperava 1 faixa, obteve %d", fetched.TrackCount)
	}

	// 4. Remove Track
	if err := svc.RemoveTrackFromPlaylist(ctx, pl.ID, "track-1"); err != nil {
		t.Fatalf("falha ao remover faixa: %v", err)
	}

	fetchedAfterRemove, _ := svc.GetPlaylist(ctx, pl.ID)
	if fetchedAfterRemove.TrackCount != 0 {
		t.Fatalf("esperava 0 faixas após remoção, obteve %d", fetchedAfterRemove.TrackCount)
	}
}
