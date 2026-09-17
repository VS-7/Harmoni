package rest

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"harmoni/internal/core/ports"
)

type ScanHandler struct {
	scanUC ports.LibraryScanUseCase
}

func NewScanHandler(scanUC ports.LibraryScanUseCase) *ScanHandler {
	return &ScanHandler{scanUC: scanUC}
}

func (h *ScanHandler) TriggerScan(w http.ResponseWriter, r *http.Request) {
	go func() {
		ctx := context.Background()
		if err := h.scanUC.Scan(ctx); err != nil {
			slog.ErrorContext(ctx, "falha na varredura assíncrona da biblioteca", "err", err)
		}
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"message": "varredura da biblioteca iniciada em background",
		"status":  "processing",
	})
}

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "harmoni",
	})
}
