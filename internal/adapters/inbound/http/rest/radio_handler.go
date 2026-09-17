package rest

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

type RadioHandler struct {
	radioUC ports.RadioUseCase
}

func NewRadioHandler(radioUC ports.RadioUseCase) *RadioHandler {
	return &RadioHandler{radioUC: radioUC}
}

func (h *RadioHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	seedTrackID := r.URL.Query().Get("seed_track_id")
	if seedTrackID == "" {
		http.Error(w, `{"error": "seed_track_id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}

	var recentArtists []library.ArtistID
	if artistsStr := r.URL.Query().Get("recent_artist_ids"); artistsStr != "" {
		for _, a := range strings.Split(artistsStr, ",") {
			if a = strings.TrimSpace(a); a != "" {
				recentArtists = append(recentArtists, library.ArtistID(a))
			}
		}
	}

	var recentTracks []library.TrackID
	if tracksStr := r.URL.Query().Get("recent_track_ids"); tracksStr != "" {
		for _, t := range strings.Split(tracksStr, ",") {
			if t = strings.TrimSpace(t); t != "" {
				recentTracks = append(recentTracks, library.TrackID(t))
			}
		}
	}

	tracks, err := h.radioUC.GenerateSongRadio(r.Context(), library.TrackID(seedTrackID), limit, recentArtists, recentTracks)
	if err != nil {
		http.Error(w, `{"error": "falha ao gerar rádio da música"}`, http.StatusInternalServerError)
		return
	}

	items := make([]trackResponse, len(tracks))
	for i, tr := range tracks {
		items[i] = toTrackResponse(tr)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":  items,
		"count": len(items),
	})
}
