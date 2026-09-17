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
	albumUseCase ports.AlbumUseCase
}

func NewCoverHandler(trackUseCase ports.TrackUseCase, albumUseCase ports.AlbumUseCase) *CoverHandler {
	return &CoverHandler{
		trackUseCase: trackUseCase,
		albumUseCase: albumUseCase,
	}
}

func (h *CoverHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	res, err := h.trackUseCase.GetCoverArt(r.Context(), library.TrackID(id))
	if err != nil && h.albumUseCase != nil {
		res, err = h.albumUseCase.GetAlbumCover(r.Context(), library.AlbumID(id))
	}

	if err != nil || res == nil {
		// Dynamic SVG cover fallback (Never broken image)
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="150" cy="140" r="60" fill="#000" fill-opacity="0.2"/><path d="M135 115v50l40-25z" fill="#fff"/><text x="150" y="240" font-family="sans-serif" font-size="16" font-weight="bold" fill="#fff" text-anchor="middle">Harmoni</text></svg>`))
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
