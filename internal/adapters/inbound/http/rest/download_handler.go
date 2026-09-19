package rest

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/ports"
	"harmoni/internal/core/usecase"
)

// sseHeartbeat keeps proxies from closing an idle event stream.
const sseHeartbeat = 25 * time.Second

type DownloadHandler struct {
	ingestUC ports.IngestUseCase
	events   ports.JobEventSubscriber
}

func NewDownloadHandler(ingestUC ports.IngestUseCase, events ports.JobEventSubscriber) *DownloadHandler {
	return &DownloadHandler{ingestUC: ingestUC, events: events}
}

// sourcePayload is the structured reference sent by the discovery UI (RF8.1).
type sourcePayload struct {
	Provider string `json:"provider"`
	Kind     string `json:"kind"`
	ID       string `json:"id"`
}

type submitDownloadRequest struct {
	// Legacy payload: a link pasted by the user.
	URL  string              `json:"url"`
	Mode ingest.DownloadMode `json:"mode"`
	// New payload: an item chosen in the search screen.
	Source *sourcePayload `json:"source"`
}

type batchDownloadRequest struct {
	Items []sourcePayload `json:"items"`
}

type inspectRequest struct {
	URL string `json:"url"`
}

// jobResponse is the wire shape of a job, in snake_case like the rest of the API.
type jobResponse struct {
	ID           string  `json:"id"`
	SourceURL    string  `json:"source_url"`
	Kind         string  `json:"kind"`
	Provider     string  `json:"provider"`
	SourceID     string  `json:"source_id"`
	Title        string  `json:"title"`
	ThumbnailURL string  `json:"thumbnail_url"`
	PlaylistID   *string `json:"playlist_id,omitempty"`
	Status       string  `json:"status"`
	ErrorMessage *string `json:"error_message,omitempty"`
	TotalItems   int     `json:"total_items"`
	DoneItems    int     `json:"done_items"`
	FailedItems  int     `json:"failed_items"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
}

type jobItemResponse struct {
	ID           string  `json:"id"`
	Position     int     `json:"position"`
	SourceID     string  `json:"source_id"`
	Title        string  `json:"title"`
	Status       string  `json:"status"`
	TrackID      *string `json:"track_id,omitempty"`
	ErrorMessage *string `json:"error_message,omitempty"`
	UpdatedAt    string  `json:"updated_at"`
}

type inspectResponse struct {
	Provider     string `json:"provider"`
	Kind         string `json:"kind"`
	VideoID      string `json:"video_id,omitempty"`
	PlaylistID   string `json:"playlist_id,omitempty"`
	ChannelID    string `json:"channel_id,omitempty"`
	Title        string `json:"title"`
	Artist       string `json:"artist"`
	ThumbnailURL string `json:"thumbnail_url"`
	ItemCount    int    `json:"item_count"`
	IsMix        bool   `json:"is_mix"`
	Ambiguous    bool   `json:"ambiguous"`
	InLibrary    bool   `json:"in_library"`
}

func toJobResponse(job ingest.DownloadJob, progress ingest.JobProgress) jobResponse {
	return jobResponse{
		ID:           job.ID,
		SourceURL:    job.SourceURL,
		Kind:         string(job.Kind),
		Provider:     string(job.Provider),
		SourceID:     job.SourceID,
		Title:        job.Title,
		ThumbnailURL: job.ThumbnailURL,
		PlaylistID:   job.PlaylistID,
		Status:       job.Status.String(),
		ErrorMessage: job.ErrorMessage,
		TotalItems:   progress.Total,
		DoneItems:    progress.Done,
		FailedItems:  progress.Failed,
		CreatedAt:    job.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    job.UpdatedAt.Format(time.RFC3339),
	}
}

func toJobItemResponse(item ingest.JobItem) jobItemResponse {
	return jobItemResponse{
		ID:           item.ID,
		Position:     item.Position,
		SourceID:     item.SourceID,
		Title:        item.Title,
		Status:       string(item.Status),
		TrackID:      item.TrackID,
		ErrorMessage: item.ErrorMessage,
		UpdatedAt:    item.UpdatedAt.Format(time.RFC3339),
	}
}

// SubmitDownload accepts both the legacy {url, mode} body and the new {source} body.
func (h *DownloadHandler) SubmitDownload(w http.ResponseWriter, r *http.Request) {
	var req submitDownloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeDownloadError(w, http.StatusBadRequest, "corpo da requisição inválido")
		return
	}
	if req.URL == "" && req.Source == nil {
		writeDownloadError(w, http.StatusBadRequest, "informe uma url ou uma fonte (source)")
		return
	}

	var (
		job *ingest.DownloadJob
		err error
	)
	if req.Source != nil {
		job, err = h.ingestUC.SubmitFromSource(r.Context(), req.Source.Provider, req.Source.Kind, req.Source.ID)
	} else {
		job, err = h.ingestUC.SubmitDownload(r.Context(), req.URL, req.Mode)
	}
	if err != nil {
		h.writeIngestError(w, r, err, "falha ao enfileirar download")
		return
	}

	writeJSON(w, http.StatusAccepted, toJobResponse(*job, ingest.JobProgress{}))
}

// SubmitBatch enqueues the multi-selection of the search screen (RF8.1).
func (h *DownloadHandler) SubmitBatch(w http.ResponseWriter, r *http.Request) {
	var req batchDownloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeDownloadError(w, http.StatusBadRequest, "corpo da requisição inválido")
		return
	}

	sources := make([]ports.SourceInput, 0, len(req.Items))
	for _, item := range req.Items {
		sources = append(sources, ports.SourceInput{Provider: item.Provider, Kind: item.Kind, ID: item.ID})
	}

	jobs, err := h.ingestUC.SubmitBatch(r.Context(), sources)
	if err != nil {
		h.writeIngestError(w, r, err, "falha ao enfileirar downloads em lote")
		return
	}

	responses := make([]jobResponse, 0, len(jobs))
	for _, job := range jobs {
		responses = append(responses, toJobResponse(job, ingest.JobProgress{}))
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"data": responses, "count": len(responses)})
}

// Inspect previews a link so the UI can ask "just this track or the whole playlist?" (RF6.2).
func (h *DownloadHandler) Inspect(w http.ResponseWriter, r *http.Request) {
	var req inspectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		writeDownloadError(w, http.StatusBadRequest, "url é obrigatória no corpo da requisição")
		return
	}

	inspection, err := h.ingestUC.Inspect(r.Context(), req.URL)
	if err != nil {
		h.writeIngestError(w, r, err, "falha ao analisar o link")
		return
	}

	writeJSON(w, http.StatusOK, inspectResponse{
		Provider:     string(inspection.Provider),
		Kind:         string(inspection.Kind),
		VideoID:      inspection.VideoID,
		PlaylistID:   inspection.PlaylistID,
		ChannelID:    inspection.ChannelID,
		Title:        inspection.Title,
		Artist:       inspection.Artist,
		ThumbnailURL: inspection.ThumbnailURL,
		ItemCount:    inspection.ItemCount,
		IsMix:        inspection.IsMix,
		Ambiguous:    inspection.Ambiguous,
		InLibrary:    inspection.InLibrary,
	})
}

func (h *DownloadHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("id")
	if jobID == "" {
		writeDownloadError(w, http.StatusBadRequest, "id é obrigatório")
		return
	}

	job, err := h.ingestUC.GetJobStatus(r.Context(), jobID)
	if err != nil {
		writeDownloadError(w, http.StatusNotFound, "job não encontrado")
		return
	}

	progress := ingest.JobProgress{}
	if items, err := h.ingestUC.GetJobItems(r.Context(), jobID); err == nil {
		progress = ingest.NewJobProgress(items)
	}
	writeJSON(w, http.StatusOK, toJobResponse(*job, progress))
}

func (h *DownloadHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}

	views, err := h.ingestUC.ListJobs(r.Context(), limit)
	if err != nil {
		slog.ErrorContext(r.Context(), "falha ao listar jobs", "err", err)
		writeDownloadError(w, http.StatusInternalServerError, "falha ao listar downloads")
		return
	}

	jobs := make([]jobResponse, 0, len(views))
	for _, view := range views {
		jobs = append(jobs, toJobResponse(view.Job, view.Progress))
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": jobs, "count": len(jobs)})
}

// ListItems returns the per-track breakdown of a job (RF8.2).
func (h *DownloadHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("id")
	if jobID == "" {
		writeDownloadError(w, http.StatusBadRequest, "id é obrigatório")
		return
	}

	items, err := h.ingestUC.GetJobItems(r.Context(), jobID)
	if err != nil {
		slog.ErrorContext(r.Context(), "falha ao listar itens do job", "job_id", jobID, "err", err)
		writeDownloadError(w, http.StatusInternalServerError, "falha ao listar itens do download")
		return
	}

	responses := make([]jobItemResponse, 0, len(items))
	for _, item := range items {
		responses = append(responses, toJobItemResponse(item))
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": responses, "count": len(responses)})
}

func (h *DownloadHandler) CancelJob(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("id")
	if err := h.ingestUC.CancelJob(r.Context(), jobID); err != nil {
		if errors.Is(err, ingest.ErrJobNotFound) {
			writeDownloadError(w, http.StatusNotFound, "job não encontrado")
			return
		}
		if errors.Is(err, ingest.ErrInvalidStatusOrder) {
			writeDownloadError(w, http.StatusConflict, "job já foi finalizado")
			return
		}
		slog.ErrorContext(r.Context(), "falha ao cancelar job", "job_id", jobID, "err", err)
		writeDownloadError(w, http.StatusInternalServerError, "falha ao cancelar download")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DownloadHandler) RetryJob(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("id")

	job, err := h.ingestUC.RetryJob(r.Context(), jobID)
	if err != nil {
		if errors.Is(err, ingest.ErrJobNotFound) {
			writeDownloadError(w, http.StatusNotFound, "job não encontrado")
			return
		}
		if errors.Is(err, ingest.ErrInvalidStatusOrder) {
			writeDownloadError(w, http.StatusConflict, "job não pode ser reenviado neste estado")
			return
		}
		slog.ErrorContext(r.Context(), "falha ao reenviar job", "job_id", jobID, "err", err)
		writeDownloadError(w, http.StatusInternalServerError, "falha ao reenviar download")
		return
	}
	writeJSON(w, http.StatusAccepted, toJobResponse(*job, ingest.JobProgress{}))
}

func (h *DownloadHandler) DeleteJob(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("id")
	if err := h.ingestUC.DeleteJob(r.Context(), jobID); err != nil {
		if errors.Is(err, ingest.ErrJobNotFound) {
			writeDownloadError(w, http.StatusNotFound, "job não encontrado")
			return
		}
		slog.ErrorContext(r.Context(), "falha ao remover job", "job_id", jobID, "err", err)
		writeDownloadError(w, http.StatusInternalServerError, "falha ao remover download do histórico")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Events streams queue changes with Server-Sent Events, replacing the 3 s polling (RF8.5).
func (h *DownloadHandler) Events(w http.ResponseWriter, r *http.Request) {
	if h.events == nil {
		writeDownloadError(w, http.StatusServiceUnavailable, "stream de eventos indisponível")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeDownloadError(w, http.StatusInternalServerError, "stream não suportado por este servidor")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Disables buffering on nginx, which would otherwise hold the events back.
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	stream, unsubscribe := h.events.SubscribeJobEvents()
	defer unsubscribe()

	// Tells the browser how long to wait before reconnecting after a drop.
	_, _ = w.Write([]byte("retry: 3000\n\n"))
	flusher.Flush()

	heartbeat := time.NewTicker(sseHeartbeat)
	defer heartbeat.Stop()

	encoder := json.NewEncoder(w)
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			if _, err := w.Write([]byte(": ping\n\n")); err != nil {
				return
			}
			flusher.Flush()
		case event, ok := <-stream:
			if !ok {
				return
			}
			payload := map[string]any{
				"type":         event.Type,
				"job_id":       event.JobID,
				"total_items":  event.Progress.Total,
				"done_items":   event.Progress.Done,
				"failed_items": event.Progress.Failed,
			}
			if event.Job != nil {
				payload["job"] = toJobResponse(*event.Job, event.Progress)
			}
			if event.Item != nil {
				payload["item"] = toJobItemResponse(*event.Item)
			}

			if _, err := w.Write([]byte("event: " + event.Type + "\ndata: ")); err != nil {
				return
			}
			if err := encoder.Encode(payload); err != nil {
				return
			}
			if _, err := w.Write([]byte("\n")); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// writeIngestError shows domain validation messages as-is and hides everything else,
// so the raw yt-dlp output never reaches the client (RNF8).
func (h *DownloadHandler) writeIngestError(w http.ResponseWriter, r *http.Request, err error, fallback string) {
	if usecase.IsIngestValidationError(err) {
		writeDownloadError(w, http.StatusBadRequest, err.Error())
		return
	}
	slog.ErrorContext(r.Context(), fallback, "err", err)
	writeDownloadError(w, http.StatusInternalServerError, fallback)
}

func writeDownloadError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
