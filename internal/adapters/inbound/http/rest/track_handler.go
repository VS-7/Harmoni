package rest

import (
	"encoding/json"
	"net/http"
	"strconv"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

type TrackHandler struct {
	useCase ports.TrackUseCase
}

func NewTrackHandler(useCase ports.TrackUseCase) *TrackHandler {
	return &TrackHandler{useCase: useCase}
}

type trackResponse struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	ArtistID    string  `json:"artist_id"`
	ArtistName  string  `json:"artist_name"`
	AlbumID     *string `json:"album_id,omitempty"`
	AlbumTitle  string  `json:"album_title,omitempty"`
	TrackNumber int     `json:"track_number"`
	DurationSec int     `json:"duration_sec"`
	Format      string  `json:"format"`
	FileSize    int64   `json:"file_size"`
	Bitrate     int     `json:"bitrate"`
	Genre       string  `json:"genre"`
}

func toTrackResponse(t library.Track) trackResponse {
	var albumIDStr *string
	if t.AlbumID != nil {
		s := string(*t.AlbumID)
		albumIDStr = &s
	}
	return trackResponse{
		ID:          string(t.ID),
		Title:       t.Title,
		ArtistID:    string(t.ArtistID),
		ArtistName:  t.ArtistName,
		AlbumID:     albumIDStr,
		AlbumTitle:  t.AlbumTitle,
		TrackNumber: t.TrackNumber,
		DurationSec: int(t.Duration.Seconds()),
		Format:      string(t.FileFormat),
		FileSize:    t.FileSize,
		Bitrate:     t.Bitrate,
		Genre:       t.Genre,
	}
}

func (h *TrackHandler) ListTracks(w http.ResponseWriter, r *http.Request) {
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	query := r.URL.Query().Get("q")

	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	tracks, total, err := h.useCase.ListTracks(r.Context(), offset, limit, query)
	if err != nil {
		http.Error(w, `{"error": "falha ao listar faixas"}`, http.StatusInternalServerError)
		return
	}

	items := make([]trackResponse, len(tracks))
	for i, tr := range tracks {
		items[i] = toTrackResponse(tr)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":   items,
		"total":  total,
		"offset": offset,
		"limit":  limit,
	})
}

func (h *TrackHandler) GetTrack(w http.ResponseWriter, r *http.Request) {
	trackID := r.PathValue("id")
	if trackID == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	track, err := h.useCase.GetTrack(r.Context(), library.TrackID(trackID))
	if err != nil {
		http.Error(w, `{"error": "faixa não encontrada"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(toTrackResponse(*track))
}
