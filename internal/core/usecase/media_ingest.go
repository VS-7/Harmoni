package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/ports"
)

type IngestService struct {
	jobRepo  ports.DownloadJobRepository
	jobQueue chan<- string
}

func NewIngestService(jobRepo ports.DownloadJobRepository, jobQueue chan<- string) *IngestService {
	return &IngestService{
		jobRepo:  jobRepo,
		jobQueue: jobQueue,
	}
}

func (s *IngestService) SubmitDownload(ctx context.Context, sourceURL string) (*ingest.DownloadJob, error) {
	jobID := newUUID()
	job, err := ingest.NewDownloadJob(jobID, sourceURL)
	if err != nil {
		return nil, fmt.Errorf("url ou job inválido: %w", err)
	}

	if err := s.jobRepo.Save(ctx, job); err != nil {
		return nil, fmt.Errorf("falha ao salvar job de download: %w", err)
	}

	// Dispatch to throttled worker channel
	select {
	case s.jobQueue <- job.ID:
		slog.InfoContext(ctx, "job de download enfileirado com sucesso", "job_id", job.ID, "url", job.SourceURL)
	default:
		slog.WarnContext(ctx, "fila de download cheia, job registrado no banco para execução posterior", "job_id", job.ID)
	}

	return job, nil
}

func (s *IngestService) GetJobStatus(ctx context.Context, jobID string) (*ingest.DownloadJob, error) {
	job, err := s.jobRepo.FindByID(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("falha ao consultar status do job %s: %w", jobID, err)
	}
	return job, nil
}

func (s *IngestService) ListJobs(ctx context.Context, limit int) ([]ingest.DownloadJob, error) {
	jobs, err := s.jobRepo.ListRecent(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar jobs de download: %w", err)
	}
	return jobs, nil
}
