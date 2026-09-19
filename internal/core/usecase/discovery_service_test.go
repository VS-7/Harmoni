package usecase_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"harmoni/internal/core/domain/discovery"
	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/usecase"
)

// fakeCatalog implements the four remote ports and counts how often it was reached.
type fakeCatalog struct {
	mu          sync.Mutex
	calls       atomic.Int32
	inFlight    atomic.Int32
	maxParallel atomic.Int32
	items       []discovery.RemoteItem
	playlist    *discovery.RemotePlaylist
	artist      *discovery.RemoteArtist
	err         error
}

func (f *fakeCatalog) enter() {
	f.calls.Add(1)
	current := f.inFlight.Add(1)
	for {
		max := f.maxParallel.Load()
		if current <= max || f.maxParallel.CompareAndSwap(max, current) {
			break
		}
	}
}

func (f *fakeCatalog) leave() { f.inFlight.Add(-1) }

func (f *fakeCatalog) Search(ctx context.Context, q discovery.Query) ([]discovery.RemoteItem, error) {
	f.enter()
	defer f.leave()
	if f.err != nil {
		return nil, f.err
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.items, nil
}

func (f *fakeCatalog) GetTrack(ctx context.Context, videoID string) (*discovery.RemoteItem, error) {
	f.enter()
	defer f.leave()
	if f.err != nil {
		return nil, f.err
	}
	return &discovery.RemoteItem{ID: videoID, Kind: discovery.KindTrack, Title: "Faixa"}, nil
}

func (f *fakeCatalog) GetPlaylist(ctx context.Context, playlistID string) (*discovery.RemotePlaylist, error) {
	f.enter()
	defer f.leave()
	if f.err != nil {
		return nil, f.err
	}
	return f.playlist, nil
}

func (f *fakeCatalog) GetArtist(ctx context.Context, channelID string) (*discovery.RemoteArtist, error) {
	f.enter()
	defer f.leave()
	if f.err != nil {
		return nil, f.err
	}
	return f.artist, nil
}

// libraryStub reports which remote ids are already indexed locally.
type libraryStub struct {
	known map[string]library.TrackID
}

func (l *libraryStub) FindByID(ctx context.Context, id library.TrackID) (*library.Track, error) {
	return nil, library.ErrTrackNotFound
}
func (l *libraryStub) FindByFilePath(ctx context.Context, path string) (*library.Track, error) {
	return nil, library.ErrTrackNotFound
}
func (l *libraryStub) List(ctx context.Context, offset, limit int, query string) ([]library.Track, int, error) {
	return nil, 0, nil
}
func (l *libraryStub) ListByAlbumID(ctx context.Context, id library.AlbumID) ([]library.Track, error) {
	return nil, nil
}
func (l *libraryStub) ListByArtistID(ctx context.Context, id library.ArtistID) ([]library.Track, error) {
	return nil, nil
}
func (l *libraryStub) FindTrackIDsBySource(ctx context.Context, provider string, sourceIDs []string) (map[string]library.TrackID, error) {
	found := make(map[string]library.TrackID)
	for _, id := range sourceIDs {
		if trackID, ok := l.known[id]; ok {
			found[id] = trackID
		}
	}
	return found, nil
}

func newDiscoveryService(catalog *fakeCatalog, lib *libraryStub) *usecase.DiscoveryService {
	return usecase.NewDiscoveryService(catalog, catalog, catalog, catalog, lib)
}

func TestSearchValidatesQuery(t *testing.T) {
	svc := newDiscoveryService(&fakeCatalog{}, &libraryStub{})

	if _, err := svc.Search(context.Background(), "   ", "all", 10); !errors.Is(err, discovery.ErrEmptyQuery) {
		t.Errorf("busca vazia deveria falhar, veio: %v", err)
	}
	if _, err := svc.Search(context.Background(), "queen", "álbum", 10); !errors.Is(err, discovery.ErrInvalidKind) {
		t.Errorf("tipo inválido deveria falhar, veio: %v", err)
	}
}

func TestSearchUsesCacheAndFlagsLibrary(t *testing.T) {
	ctx := context.Background()
	catalog := &fakeCatalog{items: []discovery.RemoteItem{
		{ID: "lBDDMrUCz1A", Kind: discovery.KindTrack, Title: "Tempo Perdido"},
		{ID: "aBcDeFgHiJk", Kind: discovery.KindTrack, Title: "Eduardo e Mônica"},
	}}
	lib := &libraryStub{known: map[string]library.TrackID{"lBDDMrUCz1A": "track-1"}}
	svc := newDiscoveryService(catalog, lib)

	first, err := svc.Search(ctx, "legião urbana", "track", 10)
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if !first[0].InLibrary || first[1].InLibrary {
		t.Errorf("marcação in_library incorreta: %+v", first)
	}

	// The same query must be served from the cache (RF7.4).
	if _, err := svc.Search(ctx, "  LEGIÃO   urbana ", "track", 10); err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if got := catalog.calls.Load(); got != 1 {
		t.Errorf("esperava 1 chamada ao catálogo remoto, veio %d", got)
	}

	// A track downloaded meanwhile is reflected right away, even from the cache.
	lib.known["aBcDeFgHiJk"] = "track-2"
	again, _ := svc.Search(ctx, "legião urbana", "track", 10)
	if !again[1].InLibrary {
		t.Error("faixa baixada depois deveria aparecer como já na biblioteca")
	}
}

// Q1: remote lookups are serialized by their own capacity-1 semaphore.
func TestConcurrentSearchesAreSerialized(t *testing.T) {
	catalog := &fakeCatalog{items: []discovery.RemoteItem{{ID: "lBDDMrUCz1A", Kind: discovery.KindTrack}}}
	svc := newDiscoveryService(catalog, &libraryStub{})

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			// Distinct queries, so nothing is served from the cache.
			_, _ = svc.Search(context.Background(), string(rune('a'+i))+" banda", "track", 10)
		}(i)
	}
	wg.Wait()

	if max := catalog.maxParallel.Load(); max > 1 {
		t.Errorf("esperava no máximo 1 consulta remota simultânea, veio %d", max)
	}
	if calls := catalog.calls.Load(); calls != 8 {
		t.Errorf("esperava 8 consultas distintas, veio %d", calls)
	}
}

func TestGetPlaylistValidatesAndFlagsTracks(t *testing.T) {
	ctx := context.Background()
	catalog := &fakeCatalog{playlist: &discovery.RemotePlaylist{
		ID:    "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
		Title: "Rock Nacional",
		Tracks: []discovery.RemoteItem{
			{ID: "lBDDMrUCz1A", Kind: discovery.KindTrack},
			{ID: "aBcDeFgHiJk", Kind: discovery.KindTrack},
		},
	}}
	svc := newDiscoveryService(catalog, &libraryStub{known: map[string]library.TrackID{"aBcDeFgHiJk": "track-2"}})

	if _, err := svc.GetPlaylist(ctx, "nao!valida"); !errors.Is(err, discovery.ErrInvalidPlaylistID) {
		t.Errorf("id inválido deveria falhar, veio: %v", err)
	}

	pl, err := svc.GetPlaylist(ctx, "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if pl.Tracks[0].InLibrary || !pl.Tracks[1].InLibrary {
		t.Errorf("marcação in_library incorreta: %+v", pl.Tracks)
	}

	// The cached payload must never be mutated by the flags of a previous caller.
	svc2 := newDiscoveryService(catalog, &libraryStub{})
	fresh, _ := svc2.GetPlaylist(ctx, "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6")
	if fresh.Tracks[1].InLibrary {
		t.Error("o payload em cache foi mutado entre chamadas")
	}
}

func TestGetArtistValidatesChannel(t *testing.T) {
	catalog := &fakeCatalog{artist: &discovery.RemoteArtist{ID: "UCabcdefghijklmnopqrstuv", Name: "Legião Urbana"}}
	svc := newDiscoveryService(catalog, &libraryStub{})

	if _, err := svc.GetArtist(context.Background(), "canal-invalido"); !errors.Is(err, discovery.ErrInvalidArtistID) {
		t.Errorf("canal inválido deveria falhar, veio: %v", err)
	}
	if _, err := svc.GetArtist(context.Background(), "UCabcdefghijklmnopqrstuv"); err != nil {
		t.Errorf("canal válido deveria passar: %v", err)
	}
	if _, err := svc.GetArtist(context.Background(), "@legiaourbana"); err != nil {
		t.Errorf("handle válido deveria passar: %v", err)
	}
}

func TestRemoteFailureIsWrapped(t *testing.T) {
	catalog := &fakeCatalog{err: discovery.ErrRemoteUnavailable}
	svc := newDiscoveryService(catalog, &libraryStub{})

	_, err := svc.Search(context.Background(), "queen", "track", 10)
	if !errors.Is(err, discovery.ErrRemoteUnavailable) {
		t.Errorf("falha remota deveria ser propagada, veio: %v", err)
	}
}
