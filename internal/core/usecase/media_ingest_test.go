package usecase_test

import (
	"context"
	"testing"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/usecase"
)

type mockDownloadJobRepository struct {
	jobs map[string]*ingest.DownloadJob
}

func (m *mockDownloadJobRepository) Save(ctx context.Context, job *ingest.DownloadJob) error {
	m.jobs[job.ID] = job
	return nil
}

func (m *mockDownloadJobRepository) FindByID(ctx context.Context, id string) (*ingest.DownloadJob, error) {
	if j, ok := m.jobs[id]; ok {
		return j, nil
	}
	return nil, ingest.ErrJobNotFound
}

func (m *mockDownloadJobRepository) Update(ctx context.Context, job *ingest.DownloadJob) error {
	m.jobs[job.ID] = job
	return nil
}

func (m *mockDownloadJobRepository) ListRecent(ctx context.Context, limit int) ([]ingest.DownloadJob, error) {
	var list []ingest.DownloadJob
	for _, j := range m.jobs {
		list = append(list, *j)
	}
	return list, nil
}

func TestSubmitDownloadAndQueuing(t *testing.T) {
	ctx := context.Background()
	repo := &mockDownloadJobRepository{
		jobs: make(map[string]*ingest.DownloadJob),
	}
	queue := make(chan string, 10)

	svc := usecase.NewIngestService(repo, queue)

	job, err := svc.SubmitDownload(ctx, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", ingest.ModeDefault)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if job.Status != ingest.StatusQueued {
		t.Errorf("expected status queued, got %s", job.Status)
	}

	select {
	case id := <-queue:
		if id != job.ID {
			t.Errorf("expected job ID %s in queue, got %s", job.ID, id)
		}
	default:
		t.Errorf("job was not queued into channel")
	}

	status, err := svc.GetJobStatus(ctx, job.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status.ID != job.ID {
		t.Errorf("expected job id %s, got %s", job.ID, status.ID)
	}
}
