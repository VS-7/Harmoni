package rest

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

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
		"data":   albums,
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
		"album":  album,
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

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":   artists,
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

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"artist": artist,
		"albums": albums,
	})
}
