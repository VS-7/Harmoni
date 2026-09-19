package rest

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/ports"
)

// stubIngest implements ports.IngestUseCase with canned answers.
type stubIngest struct {
	inspection *ports.Inspection
	err        error
	canceled   []string
}

func (s *stubIngest) SubmitDownload(ctx context.Context, url string, mode ingest.DownloadMode) (*ingest.DownloadJob, error) {
	if s.err != nil {
		return nil, s.err
	}
	return &ingest.DownloadJob{ID: "job-1", SourceURL: url, Kind: ingest.KindTrack, Status: ingest.StatusQueued}, nil
}

func (s *stubIngest) SubmitFromSource(ctx context.Context, provider, kind, id string) (*ingest.DownloadJob, error) {
	if s.err != nil {
		return nil, s.err
	}
	return &ingest.DownloadJob{ID: "job-2", Kind: ingest.SourceKind(kind), SourceID: id, Status: ingest.StatusQueued}, nil
}

func (s *stubIngest) SubmitBatch(ctx context.Context, sources []ports.SourceInput) ([]ingest.DownloadJob, error) {
	if s.err != nil {
		return nil, s.err
	}
	jobs := make([]ingest.DownloadJob, 0, len(sources))
	for _, src := range sources {
		jobs = append(jobs, ingest.DownloadJob{ID: "job-" + src.ID, SourceID: src.ID, Status: ingest.StatusQueued})
	}
	return jobs, nil
}

func (s *stubIngest) Inspect(ctx context.Context, url string) (*ports.Inspection, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.inspection, nil
}

func (s *stubIngest) GetJobStatus(ctx context.Context, id string) (*ingest.DownloadJob, error) {
	return &ingest.DownloadJob{ID: id, Status: ingest.StatusQueued}, nil
}

func (s *stubIngest) ListJobs(ctx context.Context, limit int) ([]ports.JobView, error) {
	return []ports.JobView{{
		Job:      ingest.DownloadJob{ID: "job-1", Kind: ingest.KindPlaylist, Title: "Rock Nacional", Status: ingest.StatusProcessing},
		Progress: ingest.JobProgress{Total: 12, Done: 3, Failed: 1},
	}}, nil
}

func (s *stubIngest) GetJobItems(ctx context.Context, id string) ([]ingest.JobItem, error) {
	return []ingest.JobItem{{ID: "item-1", JobID: id, SourceID: "lBDDMrUCz1A", Status: ingest.ItemCompleted}}, nil
}

func (s *stubIngest) EnsureJobItems(ctx context.Context, job *ingest.DownloadJob) ([]ingest.JobItem, error) {
	return nil, nil
}

func (s *stubIngest) CancelJob(ctx context.Context, id string) error {
	if s.err != nil {
		return s.err
	}
	s.canceled = append(s.canceled, id)
	return nil
}

func (s *stubIngest) RetryJob(ctx context.Context, id string) (*ingest.DownloadJob, error) {
	if s.err != nil {
		return nil, s.err
	}
	return &ingest.DownloadJob{ID: id, Status: ingest.StatusQueued}, nil
}

func (s *stubIngest) DeleteJob(ctx context.Context, id string) error { return s.err }

func decode(t *testing.T, body string) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatalf("resposta não é json válido: %v (%s)", err, body)
	}
	return payload
}

func TestInspectReturnsAmbiguityAndCount(t *testing.T) {
	uc := &stubIngest{inspection: &ports.Inspection{
		Provider:   ingest.ProviderYouTube,
		Kind:       ingest.KindTrackInPlaylist,
		VideoID:    "lBDDMrUCz1A",
		PlaylistID: "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6",
		Title:      "Tempo Perdido",
		ItemCount:  12,
		Ambiguous:  true,
	}}
	h := NewDownloadHandler(uc, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/downloads/inspect",
		strings.NewReader(`{"url":"https://www.youtube.com/watch?v=lBDDMrUCz1A&list=PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6"}`))
	rec := httptest.NewRecorder()
	h.Inspect(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status inesperado: %d", rec.Code)
	}
	payload := decode(t, rec.Body.String())
	if payload["ambiguous"] != true || payload["item_count"].(float64) != 12 {
		t.Errorf("prévia inesperada: %+v", payload)
	}
	if payload["kind"] != "track_in_playlist" {
		t.Errorf("kind inesperado: %v", payload["kind"])
	}
}

func TestInspectRejectsEmptyBody(t *testing.T) {
	h := NewDownloadHandler(&stubIngest{}, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/downloads/inspect", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	h.Inspect(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("url ausente deveria dar 400, veio %d", rec.Code)
	}
}

// RNF8: a failure must answer valid JSON and never leak the raw yt-dlp output.
func TestInspectHidesInternalErrors(t *testing.T) {
	uc := &stubIngest{err: errors.New("ERROR: [youtube] xyz: Sign in to confirm your age\nTraceback...")}
	h := NewDownloadHandler(uc, nil)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/downloads/inspect", strings.NewReader(`{"url":"https://youtu.be/lBDDMrUCz1A"}`))
	rec := httptest.NewRecorder()
	h.Inspect(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status inesperado: %d", rec.Code)
	}
	payload := decode(t, rec.Body.String())
	if msg, _ := payload["error"].(string); strings.Contains(msg, "Traceback") || strings.Contains(msg, "youtube") {
		t.Errorf("a saída bruta do yt-dlp vazou para o cliente: %q", msg)
	}
}

func TestListJobsExposesProgress(t *testing.T) {
	h := NewDownloadHandler(&stubIngest{}, nil)

	rec := httptest.NewRecorder()
	h.ListJobs(rec, httptest.NewRequest(http.MethodGet, "/api/v1/downloads", nil))

	payload := decode(t, rec.Body.String())
	data := payload["data"].([]any)
	job := data[0].(map[string]any)
	if job["total_items"].(float64) != 12 || job["done_items"].(float64) != 3 || job["failed_items"].(float64) != 1 {
		t.Errorf("progresso não exposto na listagem: %+v", job)
	}
	if job["title"] != "Rock Nacional" {
		t.Errorf("título legível ausente: %+v", job)
	}
}

func TestSubmitAcceptsStructuredSource(t *testing.T) {
	h := NewDownloadHandler(&stubIngest{}, nil)

	body := `{"source":{"provider":"youtube","kind":"playlist","id":"PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/downloads", strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.SubmitDownload(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status inesperado: %d (%s)", rec.Code, rec.Body.String())
	}
	payload := decode(t, rec.Body.String())
	if payload["kind"] != "playlist" || payload["source_id"] != "PLaf863IOhXhx6dfO2s9Foqn01LjrEnBH6" {
		t.Errorf("job inesperado: %+v", payload)
	}
}

// RF8.5: the stream must emit named events the browser can listen to.
func TestEventsStreamsJobUpdates(t *testing.T) {
	broker := &testBroker{ch: make(chan ports.JobEvent, 1)}
	h := NewDownloadHandler(&stubIngest{}, broker)

	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/downloads/events", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	broker.ch <- ports.JobEvent{
		Type:     ports.JobEventUpdated,
		JobID:    "job-1",
		Job:      &ingest.DownloadJob{ID: "job-1", Status: ingest.StatusProcessing},
		Progress: ingest.JobProgress{Total: 3, Done: 1},
	}

	done := make(chan struct{})
	go func() {
		h.Events(rec, req)
		close(done)
	}()

	// Give the handler a moment to write the event, then close the connection.
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("handler não encerrou ao fechar a conexão")
	}

	body := rec.Body.String()
	if !strings.Contains(body, "event: job_updated") {
		t.Errorf("evento nomeado ausente: %q", body)
	}
	if !strings.Contains(body, `"done_items":1`) {
		t.Errorf("progresso ausente no evento: %q", body)
	}
	if got := rec.Header().Get("Content-Type"); got != "text/event-stream" {
		t.Errorf("content-type inesperado: %q", got)
	}
}

type testBroker struct {
	ch chan ports.JobEvent
}

func (b *testBroker) SubscribeJobEvents() (<-chan ports.JobEvent, func()) {
	return b.ch, func() {}
}
