package rest

import (
	"io"
	"net/http"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

type StreamHandler struct {
	trackUseCase ports.TrackUseCase
}

func NewStreamHandler(trackUseCase ports.TrackUseCase) *StreamHandler {
	return &StreamHandler{trackUseCase: trackUseCase}
}

// ServeHTTP streams audio natively via http.ServeContent without transcoding (Guardrail 3).
func (h *StreamHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	trackID := r.PathValue("id")
	if trackID == "" {
		http.Error(w, `{"error": "id da faixa é obrigatório"}`, http.StatusBadRequest)
		return
	}

	res, err := h.trackUseCase.StreamTrack(r.Context(), library.TrackID(trackID))
	if err != nil {
		http.Error(w, `{"error": "áudio não encontrado"}`, http.StatusNotFound)
		return
	}
	defer res.Content.Close()

	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("ETag", res.ETag)
	w.Header().Set("Content-Type", res.MIMEType)

	// http.ServeContent natively responds with HTTP 206 Partial Content for Range requests
	http.ServeContent(w, r, string(trackID), res.LastModified, res.Content)
}

type CoverHandler struct {
	trackUseCase ports.TrackUseCase
}

func NewCoverHandler(trackUseCase ports.TrackUseCase) *CoverHandler {
	return &CoverHandler{trackUseCase: trackUseCase}
}

func (h *CoverHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	trackID := r.PathValue("id")
	if trackID == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	res, err := h.trackUseCase.GetCoverArt(r.Context(), library.TrackID(trackID))
	if err != nil {
		http.Error(w, `{"error": "capa não encontrada"}`, http.StatusNotFound)
		return
	}
	defer res.Content.Close()

	// Aggressive caching for cover art (RF1.3)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", res.ETag)
	w.Header().Set("Content-Type", res.MIMEType)

	if match := r.Header.Get("If-None-Match"); match != "" && match == res.ETag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	_, _ = io.Copy(w, res.Content)
}
