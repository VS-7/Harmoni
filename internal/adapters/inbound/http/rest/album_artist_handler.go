package rest

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

// albumResponse is the JSON shape of an album. The domain entity has no json tags, and
// its cover path is a server filesystem path that the client has no use for.
type albumResponse struct {
	ID         string `json:"id"`
	ArtistID   string `json:"artist_id"`
	ArtistName string `json:"artist_name,omitempty"`
	Title      string `json:"title"`
	Year       int    `json:"year,omitempty"`
}

func toAlbumResponse(a library.Album) albumResponse {
	return albumResponse{
		ID:         string(a.ID),
		ArtistID:   string(a.ArtistID),
		ArtistName: a.ArtistName,
		Title:      a.Title,
		Year:       a.Year,
	}
}

func toAlbumResponses(albums []library.Album) []albumResponse {
	items := make([]albumResponse, len(albums))
	for i, a := range albums {
		items[i] = toAlbumResponse(a)
	}
	return items
}

type artistResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func toArtistResponse(a library.Artist) artistResponse {
	return artistResponse{ID: string(a.ID), Name: a.Name}
}

type AlbumHandler struct {
	albumUC ports.AlbumUseCase
}

func NewAlbumHandler(albumUC ports.AlbumUseCase) *AlbumHandler {
	return &AlbumHandler{albumUC: albumUC}
}

func (h *AlbumHandler) ListAlbums(w http.ResponseWriter, r *http.Request) {
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}

	albums, total, err := h.albumUC.ListAlbums(r.Context(), offset, limit)
	if err != nil {
		http.Error(w, `{"error": "falha ao listar álbuns"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":   toAlbumResponses(albums),
		"total":  total,
		"offset": offset,
		"limit":  limit,
	})
}

func (h *AlbumHandler) GetAlbum(w http.ResponseWriter, r *http.Request) {
	albumID := r.PathValue("id")
	if albumID == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	album, tracks, err := h.albumUC.GetAlbum(r.Context(), library.AlbumID(albumID))
	if err != nil {
		http.Error(w, `{"error": "álbum não encontrado"}`, http.StatusNotFound)
		return
	}

	items := make([]trackResponse, len(tracks))
	for i, tr := range tracks {
		items[i] = toTrackResponse(tr)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"album":  toAlbumResponse(*album),
		"tracks": items,
	})
}

func (h *AlbumHandler) GetCover(w http.ResponseWriter, r *http.Request) {
	albumID := r.PathValue("id")
	if albumID == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	res, err := h.albumUC.GetAlbumCover(r.Context(), library.AlbumID(albumID))
	if err != nil {
		http.Error(w, `{"error": "capa não encontrada"}`, http.StatusNotFound)
		return
	}
	defer res.Content.Close()

	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", res.ETag)
	w.Header().Set("Content-Type", res.MIMEType)

	if match := r.Header.Get("If-None-Match"); match != "" && match == res.ETag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	_, _ = io.Copy(w, res.Content)
}

type ArtistHandler struct {
	artistUC ports.ArtistUseCase
}

func NewArtistHandler(artistUC ports.ArtistUseCase) *ArtistHandler {
	return &ArtistHandler{artistUC: artistUC}
}

func (h *ArtistHandler) ListArtists(w http.ResponseWriter, r *http.Request) {
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}

	artists, total, err := h.artistUC.ListArtists(r.Context(), offset, limit)
	if err != nil {
		http.Error(w, `{"error": "falha ao listar artistas"}`, http.StatusInternalServerError)
		return
	}
	items := make([]artistResponse, len(artists))
	for i, a := range artists {
		items[i] = toArtistResponse(a)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":   items,
		"total":  total,
		"offset": offset,
		"limit":  limit,
	})
}

func (h *ArtistHandler) GetArtist(w http.ResponseWriter, r *http.Request) {
	artistID := r.PathValue("id")
	if artistID == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	artist, albums, err := h.artistUC.GetArtist(r.Context(), library.ArtistID(artistID))
	if err != nil {
		http.Error(w, `{"error": "artista não encontrado"}`, http.StatusNotFound)
		return
	}

	tracks, err := h.artistUC.ListArtistTracks(r.Context(), library.ArtistID(artistID))
	if err != nil {
		http.Error(w, `{"error": "falha ao listar faixas do artista"}`, http.StatusInternalServerError)
		return
	}
	trackItems := make([]trackResponse, len(tracks))
	for i, tr := range tracks {
		trackItems[i] = toTrackResponse(tr)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"artist": toArtistResponse(*artist),
		"albums": toAlbumResponses(albums),
		"tracks": trackItems,
	})
}

func (h *ArtistHandler) GetCover(w http.ResponseWriter, r *http.Request) {
	artistID := r.PathValue("id")
	if artistID == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	res, err := h.artistUC.GetArtistCover(r.Context(), library.ArtistID(artistID))
	if err != nil {
		http.Error(w, `{"error": "capa não encontrada"}`, http.StatusNotFound)
		return
	}
	defer res.Content.Close()

	// Unlike an album cover, the art chosen for an artist changes as the library grows,
	// so it is revalidated through the ETag instead of being cached as immutable.
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("ETag", res.ETag)
	w.Header().Set("Content-Type", res.MIMEType)

	if match := r.Header.Get("If-None-Match"); match != "" && match == res.ETag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	_, _ = io.Copy(w, res.Content)
}
