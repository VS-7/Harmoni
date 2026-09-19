package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"harmoni/internal/core/domain/discovery"
	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/ports"
)

const (
	// discoveryCacheTTL and discoveryCacheSize implement RF7.4 within the memory budget.
	discoveryCacheTTL  = 10 * time.Minute
	discoveryCacheSize = 200
	// discoveryTimeout bounds every remote lookup (RF7.1).
	discoveryTimeout = 15 * time.Second
)

// DiscoveryService browses the remote catalog.
//
// Guardrail 4 exception, approved in Q1 of the PRD v2: remote lookups do not share the
// single download worker. They run behind their own capacity-1 semaphore, so a 1-3 s
// search never waits behind a 10 min download, and only one lookup is ever in flight.
// A single lookup may still fan out inside the adapter (a combined search queries tracks,
// playlists and channels at once) to stay within the 2.5 s target of RNF6. The adapter
// keeps nice -n 19, downloads nothing and never invokes ffmpeg.
type DiscoveryService struct {
	searcher       ports.RemoteSearcher
	playlistReader ports.RemotePlaylistReader
	artistReader   ports.RemoteArtistReader
	remoteTracks   ports.RemoteTrackReader
	trackReader    ports.TrackReader

	semaphore chan struct{}
	cache     *ttlCache
	timeout   time.Duration
}

func NewDiscoveryService(
	searcher ports.RemoteSearcher,
	playlistReader ports.RemotePlaylistReader,
	artistReader ports.RemoteArtistReader,
	remoteTracks ports.RemoteTrackReader,
	trackReader ports.TrackReader,
) *DiscoveryService {
	return &DiscoveryService{
		searcher:       searcher,
		playlistReader: playlistReader,
		artistReader:   artistReader,
		remoteTracks:   remoteTracks,
		trackReader:    trackReader,
		semaphore:      make(chan struct{}, 1),
		cache:          newTTLCache(discoveryCacheSize, discoveryCacheTTL),
		timeout:        discoveryTimeout,
	}
}

func (s *DiscoveryService) Search(ctx context.Context, rawQuery, rawKind string, limit int) ([]discovery.RemoteItem, error) {
	query, err := discovery.NewQuery(rawQuery, rawKind, limit)
	if err != nil {
		return nil, err
	}
	if s.searcher == nil {
		return nil, discovery.ErrRemoteUnavailable
	}

	items, cached, err := s.cachedLookup(ctx, query.CacheKey(), func(ctx context.Context) (any, error) {
		return s.searcher.Search(ctx, query)
	})
	if err != nil {
		return nil, err
	}

	results, _ := items.([]discovery.RemoteItem)
	slog.InfoContext(ctx, "busca no catálogo remoto concluída",
		"q", query.Text, "kind", string(query.Kind), "resultados", len(results), "cache", cached)

	// in_library is resolved on every call: the cache holds only the remote payload,
	// so a track downloaded meanwhile is reflected immediately (RF7.1).
	return s.markInLibrary(ctx, results), nil
}

// GetTrack fetches metadata for a single remote video, used by the link inspector (RF6.2).
func (s *DiscoveryService) GetTrack(ctx context.Context, videoID string) (*discovery.RemoteItem, error) {
	ref, err := ingest.NewSourceRef(string(ingest.ProviderYouTube), string(ingest.KindTrack), videoID)
	if err != nil {
		return nil, discovery.ErrRemoteNotFound
	}
	if s.remoteTracks == nil {
		return nil, discovery.ErrRemoteUnavailable
	}

	value, _, err := s.cachedLookup(ctx, "track:"+ref.VideoID, func(ctx context.Context) (any, error) {
		return s.remoteTracks.GetTrack(ctx, ref.VideoID)
	})
	if err != nil {
		return nil, err
	}

	item, ok := value.(*discovery.RemoteItem)
	if !ok || item == nil {
		return nil, discovery.ErrRemoteNotFound
	}

	withFlag := *item
	if flagged := s.markInLibrary(ctx, []discovery.RemoteItem{withFlag}); len(flagged) == 1 {
		withFlag = flagged[0]
	}
	return &withFlag, nil
}

func (s *DiscoveryService) GetPlaylist(ctx context.Context, playlistID string) (*discovery.RemotePlaylist, error) {
	ref, err := ingest.NewSourceRef(string(ingest.ProviderYouTube), string(ingest.KindPlaylist), playlistID)
	if err != nil {
		return nil, discovery.ErrInvalidPlaylistID
	}
	if s.playlistReader == nil {
		return nil, discovery.ErrRemoteUnavailable
	}

	value, cached, err := s.cachedLookup(ctx, "playlist:"+ref.PlaylistID, func(ctx context.Context) (any, error) {
		return s.playlistReader.GetPlaylist(ctx, ref.PlaylistID)
	})
	if err != nil {
		return nil, err
	}

	pl, ok := value.(*discovery.RemotePlaylist)
	if !ok || pl == nil {
		return nil, discovery.ErrRemoteNotFound
	}
	slog.InfoContext(ctx, "playlist remota carregada", "playlist_id", ref.PlaylistID, "faixas", len(pl.Tracks), "cache", cached)

	// Copy before mutating, since the cached value is shared between callers.
	withFlags := *pl
	withFlags.Tracks = s.markInLibrary(ctx, pl.Tracks)
	return &withFlags, nil
}

func (s *DiscoveryService) GetArtist(ctx context.Context, channelID string) (*discovery.RemoteArtist, error) {
	ref, err := ingest.ParseSourceURL("https://www.youtube.com/" + artistPathFor(channelID))
	if err != nil || ref.Kind != ingest.KindChannel {
		return nil, discovery.ErrInvalidArtistID
	}
	if s.artistReader == nil {
		return nil, discovery.ErrRemoteUnavailable
	}

	value, cached, err := s.cachedLookup(ctx, "artist:"+ref.ChannelID, func(ctx context.Context) (any, error) {
		return s.artistReader.GetArtist(ctx, ref.ChannelID)
	})
	if err != nil {
		return nil, err
	}

	artist, ok := value.(*discovery.RemoteArtist)
	if !ok || artist == nil {
		return nil, discovery.ErrRemoteNotFound
	}
	slog.InfoContext(ctx, "artista remoto carregado", "channel_id", ref.ChannelID, "faixas", len(artist.TopTracks), "cache", cached)

	withFlags := *artist
	withFlags.TopTracks = s.markInLibrary(ctx, artist.TopTracks)
	return &withFlags, nil
}

// cachedLookup serves from cache or runs the remote call behind the discovery semaphore.
func (s *DiscoveryService) cachedLookup(ctx context.Context, key string, fetch func(context.Context) (any, error)) (any, bool, error) {
	if value, ok := s.cache.Get(key); ok {
		return value, true, nil
	}

	// Capacity-1 semaphore: at most one remote query process at a time (Q1).
	select {
	case s.semaphore <- struct{}{}:
		defer func() { <-s.semaphore }()
	case <-ctx.Done():
		return nil, false, ctx.Err()
	}

	// Re-check: a concurrent caller may have filled the cache while we waited.
	if value, ok := s.cache.Get(key); ok {
		return value, true, nil
	}

	callCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	value, err := fetch(callCtx)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			slog.WarnContext(ctx, "consulta ao catálogo remoto excedeu o tempo limite", "key", key, "timeout", s.timeout)
		}
		return nil, false, fmt.Errorf("falha ao consultar catálogo remoto: %w", err)
	}

	s.cache.Put(key, value)
	return value, false, nil
}

// markInLibrary flags results whose source id is already indexed locally (RF7.1).
func (s *DiscoveryService) markInLibrary(ctx context.Context, items []discovery.RemoteItem) []discovery.RemoteItem {
	if len(items) == 0 || s.trackReader == nil {
		return items
	}

	ids := make([]string, 0, len(items))
	for _, item := range items {
		if item.Kind == discovery.KindTrack && item.ID != "" {
			ids = append(ids, item.ID)
		}
	}
	if len(ids) == 0 {
		return items
	}

	known, err := s.trackReader.FindTrackIDsBySource(ctx, string(ingest.ProviderYouTube), ids)
	if err != nil {
		slog.WarnContext(ctx, "falha ao verificar quais faixas já estão na biblioteca", "err", err)
		return items
	}

	// Copy so a cached slice is never mutated in place.
	flagged := make([]discovery.RemoteItem, len(items))
	copy(flagged, items)
	for i := range flagged {
		if _, ok := known[flagged[i].ID]; ok {
			flagged[i].InLibrary = true
		}
	}
	return flagged
}

// artistPathFor accepts both "UC..." ids and "@handle" forms, which ParseSourceURL validates.
func artistPathFor(channelID string) string {
	if len(channelID) > 0 && channelID[0] == '@' {
		return channelID
	}
	return "channel/" + channelID
}
