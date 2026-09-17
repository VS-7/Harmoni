package rest

import (
	"encoding/json"
	"errors"
	"net/http"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/playlist"
	"harmoni/internal/core/ports"
)

type PlaylistHandler struct {
	playlistUC ports.PlaylistUseCase
}

func NewPlaylistHandler(playlistUC ports.PlaylistUseCase) *PlaylistHandler {
	return &PlaylistHandler{playlistUC: playlistUC}
}

func (h *PlaylistHandler) ListPlaylists(w http.ResponseWriter, r *http.Request) {
	playlists, err := h.playlistUC.ListPlaylists(r.Context())
	if err != nil {
		http.Error(w, `{"error": "falha ao listar playlists"}`, http.StatusInternalServerError)
		return
	}
	if playlists == nil {
		playlists = []*playlist.Playlist{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":  playlists,
		"total": len(playlists),
	})
}

type createPlaylistRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (h *PlaylistHandler) CreatePlaylist(w http.ResponseWriter, r *http.Request) {
	var req createPlaylistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "corpo de requisição inválido"}`, http.StatusBadRequest)
		return
	}

	pl, err := h.playlistUC.CreatePlaylist(r.Context(), req.Name, req.Description)
	if err != nil {
		if errors.Is(err, playlist.ErrInvalidPlaylistName) {
			http.Error(w, `{"error": "o nome da playlist é obrigatório"}`, http.StatusBadRequest)
			return
		}
		http.Error(w, `{"error": "falha ao criar playlist"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(pl)
}

type createSmartPlaylistRequest struct {
	SeedTrackID string `json:"seedTrackId"`
	Name        string `json:"name"`
	Limit       int    `json:"limit"`
}

func (h *PlaylistHandler) CreateSmartPlaylist(w http.ResponseWriter, r *http.Request) {
	var req createSmartPlaylistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "corpo de requisição inválido"}`, http.StatusBadRequest)
		return
	}

	if req.SeedTrackID == "" {
		http.Error(w, `{"error": "seedTrackId é obrigatório"}`, http.StatusBadRequest)
		return
	}

	pl, err := h.playlistUC.CreateSmartPlaylist(r.Context(), library.TrackID(req.SeedTrackID), req.Name, req.Limit)
	if err != nil {
		http.Error(w, `{"error": "falha ao criar playlist inteligente"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(pl)
}

func (h *PlaylistHandler) GetPlaylist(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	pl, err := h.playlistUC.GetPlaylist(r.Context(), playlist.PlaylistID(id))
	if err != nil {
		if errors.Is(err, playlist.ErrPlaylistNotFound) {
			http.Error(w, `{"error": "playlist não encontrada"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error": "falha ao buscar playlist"}`, http.StatusInternalServerError)
		return
	}

	items := make([]trackResponse, len(pl.Tracks))
	for i, tr := range pl.Tracks {
		items[i] = toTrackResponse(tr)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"id":          pl.ID,
		"name":        pl.Name,
		"description": pl.Description,
		"coverPath":   pl.CoverPath,
		"isSmart":     pl.IsSmart,
		"trackCount":  pl.TrackCount,
		"duration":    pl.Duration,
		"tracks":      items,
		"createdAt":   pl.CreatedAt,
		"updatedAt":   pl.UpdatedAt,
	})
}

func (h *PlaylistHandler) DeletePlaylist(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	if err := h.playlistUC.DeletePlaylist(r.Context(), playlist.PlaylistID(id)); err != nil {
		if errors.Is(err, playlist.ErrPlaylistNotFound) {
			http.Error(w, `{"error": "playlist não encontrada"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error": "falha ao remover playlist"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type addTrackRequest struct {
	TrackID string `json:"trackId"`
}

func (h *PlaylistHandler) AddTrack(w http.ResponseWriter, r *http.Request) {
	playlistID := r.PathValue("id")
	if playlistID == "" {
		http.Error(w, `{"error": "id da playlist é obrigatório"}`, http.StatusBadRequest)
		return
	}

	var req addTrackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "corpo de requisição inválido"}`, http.StatusBadRequest)
		return
	}

	if req.TrackID == "" {
		http.Error(w, `{"error": "trackId é obrigatório"}`, http.StatusBadRequest)
		return
	}

	err := h.playlistUC.AddTrackToPlaylist(r.Context(), playlist.PlaylistID(playlistID), library.TrackID(req.TrackID))
	if err != nil {
		http.Error(w, `{"error": "falha ao adicionar música na playlist"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (h *PlaylistHandler) RemoveTrack(w http.ResponseWriter, r *http.Request) {
	playlistID := r.PathValue("id")
	trackID := r.PathValue("trackId")
	if playlistID == "" || trackID == "" {
		http.Error(w, `{"error": "playlist id e track id são obrigatórios"}`, http.StatusBadRequest)
		return
	}

	err := h.playlistUC.RemoveTrackFromPlaylist(r.Context(), playlist.PlaylistID(playlistID), library.TrackID(trackID))
	if err != nil {
		if errors.Is(err, playlist.ErrTrackNotInPlaylist) {
			http.Error(w, `{"error": "faixa não está na playlist"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error": "falha ao remover música da playlist"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
