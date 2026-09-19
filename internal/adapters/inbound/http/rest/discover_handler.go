package rest

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"harmoni/internal/core/domain/discovery"
	"harmoni/internal/core/ports"
)

// searchRateWindow is the minimum gap between two searches from the same client (RF7.4).
// The frontend also debounces at 400 ms; this is the server-side guard.
const searchRateWindow = time.Second

type DiscoverHandler struct {
	discoveryUC ports.DiscoveryUseCase
	limiter     *rateLimiter
}

func NewDiscoverHandler(discoveryUC ports.DiscoveryUseCase) *DiscoverHandler {
	return &DiscoverHandler{discoveryUC: discoveryUC, limiter: newRateLimiter(searchRateWindow)}
}

type remoteItemResponse struct {
	ID           string `json:"id"`
	Kind         string `json:"kind"`
	Title        string `json:"title"`
	Artist       string `json:"artist"`
	DurationSec  int    `json:"duration_sec"`
	ThumbnailURL string `json:"thumbnail_url"`
	ItemCount    int    `json:"item_count"`
	InLibrary    bool   `json:"in_library"`
}

func toRemoteItemResponse(item discovery.RemoteItem) remoteItemResponse {
	return remoteItemResponse{
		ID:           item.ID,
		Kind:         string(item.Kind),
		Title:        item.Title,
		Artist:       item.Artist,
		DurationSec:  item.DurationSec,
		ThumbnailURL: item.ThumbnailURL,
		ItemCount:    item.ItemCount,
		InLibrary:    item.InLibrary,
	}
}

func toRemoteItemResponses(items []discovery.RemoteItem) []remoteItemResponse {
	responses := make([]remoteItemResponse, 0, len(items))
	for _, item := range items {
		responses = append(responses, toRemoteItemResponse(item))
	}
	return responses
}

// Search answers GET /api/v1/discover/search?q=&type=&limit= (RF7.1).
func (h *DiscoverHandler) Search(w http.ResponseWriter, r *http.Request) {
	if h.discoveryUC == nil {
		writeDownloadError(w, http.StatusServiceUnavailable, "busca remota indisponível")
		return
	}
	if !h.limiter.allow(clientKey(r)) {
		writeDownloadError(w, http.StatusTooManyRequests, "muitas buscas seguidas, tente novamente em instantes")
		return
	}

	query := r.URL.Query()
	limit, _ := strconv.Atoi(query.Get("limit"))

	items, err := h.discoveryUC.Search(r.Context(), query.Get("q"), query.Get("type"), limit)
	if err != nil {
		h.writeDiscoveryError(w, r, err, "falha ao buscar no catálogo remoto")
		return
	}

	results := toRemoteItemResponses(items)
	writeJSON(w, http.StatusOK, map[string]any{"data": results, "count": len(results)})
}

// GetPlaylist answers GET /api/v1/discover/playlists/{id} (RF7.2).
func (h *DiscoverHandler) GetPlaylist(w http.ResponseWriter, r *http.Request) {
	if h.discoveryUC == nil {
		writeDownloadError(w, http.StatusServiceUnavailable, "busca remota indisponível")
		return
	}

	pl, err := h.discoveryUC.GetPlaylist(r.Context(), r.PathValue("id"))
	if err != nil {
		h.writeDiscoveryError(w, r, err, "falha ao carregar playlist remota")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":            pl.ID,
		"title":         pl.Title,
		"artist":        pl.Artist,
		"thumbnail_url": pl.ThumbnailURL,
		"item_count":    pl.ItemCount,
		"tracks":        toRemoteItemResponses(pl.Tracks),
	})
}

// GetArtist answers GET /api/v1/discover/artists/{id} (RF7.3).
func (h *DiscoverHandler) GetArtist(w http.ResponseWriter, r *http.Request) {
	if h.discoveryUC == nil {
		writeDownloadError(w, http.StatusServiceUnavailable, "busca remota indisponível")
		return
	}

	artist, err := h.discoveryUC.GetArtist(r.Context(), r.PathValue("id"))
	if err != nil {
		h.writeDiscoveryError(w, r, err, "falha ao carregar artista remoto")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":            artist.ID,
		"name":          artist.Name,
		"thumbnail_url": artist.ThumbnailURL,
		"top_tracks":    toRemoteItemResponses(artist.TopTracks),
		"playlists":     toRemoteItemResponses(artist.Playlists),
	})
}

// writeDiscoveryError maps the domain errors to status codes without leaking the raw
// output of the external process (RNF8).
func (h *DiscoverHandler) writeDiscoveryError(w http.ResponseWriter, r *http.Request, err error, fallback string) {
	switch {
	case errors.Is(err, discovery.ErrEmptyQuery),
		errors.Is(err, discovery.ErrInvalidKind),
		errors.Is(err, discovery.ErrInvalidPlaylistID),
		errors.Is(err, discovery.ErrInvalidArtistID):
		writeDownloadError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, discovery.ErrRemoteNotFound):
		writeDownloadError(w, http.StatusNotFound, discovery.ErrRemoteNotFound.Error())
	case errors.Is(err, discovery.ErrRemoteUnavailable):
		slog.WarnContext(r.Context(), fallback, "err", err)
		writeDownloadError(w, http.StatusBadGateway, discovery.ErrRemoteUnavailable.Error())
	default:
		slog.ErrorContext(r.Context(), fallback, "err", err)
		writeDownloadError(w, http.StatusInternalServerError, fallback)
	}
}

// rateLimiter allows one request per window per client. It is deliberately tiny: the
// map is pruned on write, so it cannot grow unbounded and threaten the memory budget.
type rateLimiter struct {
	mu     sync.Mutex
	window time.Duration
	last   map[string]time.Time
}

func newRateLimiter(window time.Duration) *rateLimiter {
	return &rateLimiter{window: window, last: make(map[string]time.Time)}
}

// maxRateLimiterEntries bounds the table before a full prune is forced.
const maxRateLimiterEntries = 1024

func (l *rateLimiter) allow(key string) bool {
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	if last, ok := l.last[key]; ok && now.Sub(last) < l.window {
		return false
	}

	if len(l.last) >= maxRateLimiterEntries {
		for k, seen := range l.last {
			if now.Sub(seen) > l.window {
				delete(l.last, k)
			}
		}
	}

	l.last[key] = now
	return true
}

// clientKey identifies the caller by address. Harmoni is single-user and self-hosted,
// so the remote address is enough and no header can be spoofed into a new bucket.
func clientKey(r *http.Request) string {
	if host, _, err := splitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func splitHostPort(addr string) (string, string, error) {
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i], addr[i+1:], nil
		}
	}
	return addr, "", errors.New("endereço sem porta")
}
