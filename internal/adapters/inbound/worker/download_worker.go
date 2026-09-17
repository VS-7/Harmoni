package worker

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"harmoni/internal/core/ports"
)

type DownloadWorker struct {
	jobRepo   ports.DownloadJobRepository
	jobQueue  <-chan string
	client    ports.DownloaderClient
	scanner   ports.LibraryScanUseCase
	outputDir string
	wg        sync.WaitGroup
	ctx       context.Context
	cancel    context.CancelFunc
}

func NewDownloadWorker(
	jobRepo ports.DownloadJobRepository,
	jobQueue <-chan string,
	client ports.DownloaderClient,
	scanner ports.LibraryScanUseCase,
	outputDir string,
) *DownloadWorker {
	return &DownloadWorker{
		jobRepo:   jobRepo,
		jobQueue:  jobQueue,
		client:    client,
		scanner:   scanner,
		outputDir: outputDir,
	}
}

// Start launches exactly 1 worker goroutine (Guardrail 4: Single-Worker Concurrency).
func (w *DownloadWorker) Start(parentCtx context.Context) {
	w.ctx, w.cancel = context.WithCancel(parentCtx)
	w.wg.Add(1)

	go func() {
		defer w.wg.Done()
		slog.InfoContext(w.ctx, "worker de download iniciado com sucesso (concorrência: 1)")

		for {
			select {
			case <-w.ctx.Done():
				slog.InfoContext(w.ctx, "worker de download encerrando")
				return
			case jobID, ok := <-w.jobQueue:
				if !ok {
					return
				}
				w.processJob(w.ctx, jobID)
			}
		}
	}()
}

func (w *DownloadWorker) Stop() {
	if w.cancel != nil {
		w.cancel()
	}
	w.wg.Wait()
}

func (w *DownloadWorker) processJob(ctx context.Context, jobID string) {
	slog.InfoContext(ctx, "iniciando processamento do job de download", "job_id", jobID)

	job, err := w.jobRepo.FindByID(ctx, jobID)
	if err != nil {
		slog.ErrorContext(ctx, "job de download não encontrado no banco", "job_id", jobID, "err", err)
		return
	}

	if err := job.StartProcessing(); err != nil {
		slog.ErrorContext(ctx, "falha ao transicionar status para processing", "job_id", jobID, "err", err)
		return
	}
	_ = w.jobRepo.Update(ctx, job)

	// Execute download
	audioPath, _, err := w.client.Download(ctx, job.SourceURL, "")
	if err != nil {
		slog.ErrorContext(ctx, "falha no download do áudio", "job_id", jobID, "err", err)
		_ = job.Fail(fmt.Sprintf("erro no download: %v", err))
		_ = w.jobRepo.Update(ctx, job)
		return
	}

	slog.InfoContext(ctx, "áudio baixado com sucesso, disparando varredura da biblioteca", "job_id", jobID, "path", audioPath)

	// Scan library to index new track and calculate embedding
	if w.scanner != nil {
		if err := w.scanner.Scan(ctx); err != nil {
			slog.WarnContext(ctx, "aviso na varredura pós-download", "job_id", jobID, "err", err)
		}
	}

	if err := job.Complete(); err != nil {
		slog.ErrorContext(ctx, "falha ao marcar job como concluído", "job_id", jobID, "err", err)
		return
	}
	_ = w.jobRepo.Update(ctx, job)
	slog.InfoContext(ctx, "job de download concluído com sucesso", "job_id", jobID)
}
