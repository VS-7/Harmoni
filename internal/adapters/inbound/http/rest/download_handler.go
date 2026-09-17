package rest

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/ports"
)

type DownloadHandler struct {
	ingestUC ports.IngestUseCase
}

func NewDownloadHandler(ingestUC ports.IngestUseCase) *DownloadHandler {
	return &DownloadHandler{ingestUC: ingestUC}
}

type submitDownloadRequest struct {
	URL  string              `json:"url"`
	Mode ingest.DownloadMode `json:"mode"`
}

// Domain validation errors are safe to show to the user as-is.
var downloadValidationErrors = []error{
	ingest.ErrInvalidURL,
	ingest.ErrUnsafeURL,
	ingest.ErrUnsupportedSource,
	ingest.ErrInvalidSourceID,
	ingest.ErrInvalidDownloadMode,
}

func (h *DownloadHandler) SubmitDownload(w http.ResponseWriter, r *http.Request) {
	var req submitDownloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		http.Error(w, `{"error": "url é obrigatória no corpo da requisição"}`, http.StatusBadRequest)
		return
	}

	job, err := h.ingestUC.SubmitDownload(r.Context(), req.URL, req.Mode)
	if err != nil {
		for _, domainErr := range downloadValidationErrors {
			if errors.Is(err, domainErr) {
				writeDownloadError(w, http.StatusBadRequest, domainErr.Error())
				return
			}
		}
		slog.ErrorContext(r.Context(), "falha ao enfileirar download", "err", err)
		writeDownloadError(w, http.StatusInternalServerError, "falha ao enfileirar download")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(job)
}

func (h *DownloadHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("id")
	if jobID == "" {
		http.Error(w, `{"error": "id é obrigatório"}`, http.StatusBadRequest)
		return
	}

	job, err := h.ingestUC.GetJobStatus(r.Context(), jobID)
	if err != nil {
		http.Error(w, `{"error": "job não encontrado"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(job)
}

func (h *DownloadHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}

	jobs, err := h.ingestUC.ListJobs(r.Context(), limit)
	if err != nil {
		http.Error(w, `{"error": "falha ao listar jobs"}`, http.StatusInternalServerError)
		return
	}
	if jobs == nil {
		jobs = []ingest.DownloadJob{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"data":  jobs,
		"count": len(jobs),
	})
}

func writeDownloadError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
