package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"harmoni/internal/core/domain/discovery"
	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/ports"
)

// IngestService orchestrates the download queue: it validates links, expands playlists
// into per-video items and exposes the queue actions of RF8.3.
type IngestService struct {
	jobRepo   ports.DownloadJobRepository
	itemRepo  ports.DownloadJobItemRepository
	discovery ports.DiscoveryUseCase
	events    ports.JobEventPublisher
	jobQueue  chan<- string
}

func NewIngestService(
	jobRepo ports.DownloadJobRepository,
	itemRepo ports.DownloadJobItemRepository,
	discoveryUC ports.DiscoveryUseCase,
	events ports.JobEventPublisher,
	jobQueue chan<- string,
) *IngestService {
	return &IngestService{
		jobRepo:   jobRepo,
		itemRepo:  itemRepo,
		discovery: discoveryUC,
		events:    events,
		jobQueue:  jobQueue,
	}
}

// SubmitDownload accepts a raw user link (legacy payload {url, mode}).
func (s *IngestService) SubmitDownload(ctx context.Context, sourceURL string, mode ingest.DownloadMode) (*ingest.DownloadJob, error) {
	ref, err := ingest.ParseSourceURL(sourceURL)
	if err != nil {
		return nil, fmt.Errorf("url inválida: %w", err)
	}
	resolved, err := ref.ResolveDownload(mode)
	if err != nil {
		return nil, fmt.Errorf("modo de download inválido para este link: %w", err)
	}
	return s.submit(ctx, resolved)
}

// SubmitFromSource accepts the structured payload sent by the discovery UI (RF8.1).
func (s *IngestService) SubmitFromSource(ctx context.Context, provider, kind, sourceID string) (*ingest.DownloadJob, error) {
	ref, err := ingest.NewSourceRef(provider, kind, sourceID)
	if err != nil {
		return nil, fmt.Errorf("fonte inválida: %w", err)
	}
	return s.submit(ctx, ref)
}

// SubmitBatch enqueues the multi-selection of the search screen (RF8.1). One invalid
// entry does not discard the valid ones; the error is only returned if nothing was enqueued.
func (s *IngestService) SubmitBatch(ctx context.Context, sources []ports.SourceInput) ([]ingest.DownloadJob, error) {
	if len(sources) == 0 {
		return nil, ingest.ErrEmptyBatch
	}
	if len(sources) > ingest.MaxBatchItems {
		return nil, ingest.ErrBatchTooLarge
	}

	jobs := make([]ingest.DownloadJob, 0, len(sources))
	var firstErr error
	for _, src := range sources {
		job, err := s.SubmitFromSource(ctx, src.Provider, src.Kind, src.ID)
		if err != nil {
			slog.WarnContext(ctx, "item do lote ignorado", "id", src.ID, "err", err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		jobs = append(jobs, *job)
	}

	if len(jobs) == 0 {
		return nil, firstErr
	}
	slog.InfoContext(ctx, "lote de downloads enfileirado", "solicitados", len(sources), "aceitos", len(jobs))
	return jobs, nil
}

// submit persists the job, expands it into items and hands it to the single worker.
func (s *IngestService) submit(ctx context.Context, ref ingest.SourceRef) (*ingest.DownloadJob, error) {
	job, err := ingest.NewDownloadJobFromRef(newUUID(), ref)
	if err != nil {
		return nil, fmt.Errorf("job inválido: %w", err)
	}

	// Re-use the Harmoni playlist a previous job already created for this remote
	// playlist, so re-downloading updates it instead of duplicating it (RF8.4).
	if job.Kind == ingest.KindPlaylist {
		if existing, err := s.jobRepo.FindPlaylistIDBySource(ctx, string(job.Provider), job.SourceID); err == nil && existing != "" {
			job.LinkPlaylist(existing)
		}
	}

	s.fillPreview(ctx, job)

	if err := s.jobRepo.Save(ctx, job); err != nil {
		return nil, fmt.Errorf("falha ao salvar job de download: %w", err)
	}

	if _, err := s.expandItems(ctx, job); err != nil {
		// The worker expands lazily as a fallback, so this is not fatal.
		slog.WarnContext(ctx, "não foi possível expandir os itens do job no envio", "job_id", job.ID, "err", err)
	}

	s.enqueue(ctx, job)
	s.publish(ctx, job)
	return job, nil
}

// enqueue hands the job to the throttled worker (Guardrail 4). A full buffer is not an
// error: the job stays queued in the database for a later run.
func (s *IngestService) enqueue(ctx context.Context, job *ingest.DownloadJob) {
	select {
	case s.jobQueue <- job.ID:
		slog.InfoContext(ctx, "job de download enfileirado", "job_id", job.ID, "kind", string(job.Kind), "url", job.SourceURL)
	default:
		slog.WarnContext(ctx, "fila de download cheia, job aguardando execução posterior", "job_id", job.ID)
	}
}

// fillPreview asks the remote catalog for the title and cover shown in the queue (RF8.2).
// Failure is tolerated: the queue simply falls back to the canonical URL.
func (s *IngestService) fillPreview(ctx context.Context, job *ingest.DownloadJob) {
	if s.discovery == nil {
		return
	}

	switch job.Kind {
	case ingest.KindTrack:
		if item, err := s.discovery.GetTrack(ctx, job.SourceID); err == nil && item != nil {
			job.SetPreview(ingest.CleanTitle(item.Title), item.ThumbnailURL)
		}
	case ingest.KindPlaylist:
		if pl, err := s.discovery.GetPlaylist(ctx, job.SourceID); err == nil && pl != nil {
			job.SetPreview(pl.Title, pl.ThumbnailURL)
		}
	}
}

// expandItems writes one row per video (RF8.2). For a single track the job still gets
// one item, so progress and retry behave the same for both kinds.
func (s *IngestService) expandItems(ctx context.Context, job *ingest.DownloadJob) ([]ingest.JobItem, error) {
	if s.itemRepo == nil {
		return nil, nil
	}

	if existing, err := s.itemRepo.ListByJob(ctx, job.ID); err == nil && len(existing) > 0 {
		return existing, nil
	}

	var items []ingest.JobItem

	if job.Kind == ingest.KindTrack {
		item, err := ingest.NewJobItem(newUUID(), job.ID, 0, job.SourceID, job.Title)
		if err != nil {
			return nil, fmt.Errorf("falha ao criar item do job: %w", err)
		}
		items = append(items, *item)
	} else {
		if s.discovery == nil {
			return nil, discovery.ErrRemoteUnavailable
		}
		pl, err := s.discovery.GetPlaylist(ctx, job.SourceID)
		if err != nil {
			return nil, fmt.Errorf("falha ao listar faixas da playlist remota: %w", err)
		}

		position := 0
		for _, track := range pl.Tracks {
			item, err := ingest.NewJobItem(newUUID(), job.ID, position, track.ID, ingest.CleanTitle(track.Title))
			if err != nil {
				slog.WarnContext(ctx, "entrada da playlist remota ignorada", "job_id", job.ID, "source_id", track.ID, "err", err)
				continue
			}
			items = append(items, *item)
			position++
		}
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("nenhum item válido para o job %s", job.ID)
	}
	if err := s.itemRepo.SaveAll(ctx, items); err != nil {
		return nil, fmt.Errorf("falha ao salvar itens do job: %w", err)
	}

	slog.InfoContext(ctx, "job expandido em itens", "job_id", job.ID, "itens", len(items))
	return items, nil
}

// Inspect answers "what is behind this link?" without enqueuing anything (RF6.2).
func (s *IngestService) Inspect(ctx context.Context, sourceURL string) (*ports.Inspection, error) {
	ref, err := ingest.ParseSourceURL(sourceURL)
	if err != nil {
		return nil, fmt.Errorf("url inválida: %w", err)
	}

	inspection := &ports.Inspection{
		Provider:   ref.Provider,
		Kind:       ref.Kind,
		VideoID:    ref.VideoID,
		PlaylistID: ref.PlaylistID,
		ChannelID:  ref.ChannelID,
		IsMix:      ref.IsMix(),
		// A mix is near-infinite, so it is offered as a single track and never asks (RF6.2).
		Ambiguous: ref.Kind == ingest.KindTrackInPlaylist && !ref.IsMix(),
	}

	if s.discovery == nil {
		return inspection, nil
	}

	// Track metadata: available for both track and ambiguous links.
	if ref.VideoID != "" {
		if item, err := s.discovery.GetTrack(ctx, ref.VideoID); err == nil && item != nil {
			inspection.Title = ingest.CleanTitle(item.Title)
			inspection.Artist = item.Artist
			inspection.ThumbnailURL = item.ThumbnailURL
			inspection.InLibrary = item.InLibrary
		}
	}

	// Playlist metadata: the item count drives the "download all (N)" button.
	if ref.PlaylistID != "" && !ref.IsMix() {
		if pl, err := s.discovery.GetPlaylist(ctx, ref.PlaylistID); err == nil && pl != nil {
			inspection.ItemCount = pl.ItemCount
			if inspection.ItemCount == 0 {
				inspection.ItemCount = len(pl.Tracks)
			}
			if ref.Kind == ingest.KindPlaylist {
				inspection.Title = pl.Title
				inspection.Artist = pl.Artist
				inspection.ThumbnailURL = pl.ThumbnailURL
			}
		}
	}

	if ref.Kind == ingest.KindChannel {
		if artist, err := s.discovery.GetArtist(ctx, ref.ChannelID); err == nil && artist != nil {
			inspection.Title = artist.Name
			inspection.ThumbnailURL = artist.ThumbnailURL
			inspection.ItemCount = len(artist.TopTracks)
		}
	}

	return inspection, nil
}

func (s *IngestService) GetJobStatus(ctx context.Context, jobID string) (*ingest.DownloadJob, error) {
	job, err := s.jobRepo.FindByID(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("falha ao consultar status do job %s: %w", jobID, err)
	}
	return job, nil
}

// ListJobs returns the queue with the progress of each job aggregated in a single
// extra query, so the number of round trips does not grow with the queue (RF8.2).
func (s *IngestService) ListJobs(ctx context.Context, limit int) ([]ports.JobView, error) {
	jobs, err := s.jobRepo.ListRecent(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar jobs de download: %w", err)
	}
	if len(jobs) == 0 {
		return []ports.JobView{}, nil
	}

	progress := map[string]ingest.JobProgress{}
	if s.itemRepo != nil {
		ids := make([]string, 0, len(jobs))
		for _, job := range jobs {
			ids = append(ids, job.ID)
		}
		if found, err := s.itemRepo.ProgressByJobs(ctx, ids); err != nil {
			slog.WarnContext(ctx, "falha ao agregar progresso dos jobs", "err", err)
		} else {
			progress = found
		}
	}

	views := make([]ports.JobView, 0, len(jobs))
	for _, job := range jobs {
		views = append(views, ports.JobView{Job: job, Progress: progress[job.ID]})
	}
	return views, nil
}

func (s *IngestService) GetJobItems(ctx context.Context, jobID string) ([]ingest.JobItem, error) {
	if s.itemRepo == nil {
		return []ingest.JobItem{}, nil
	}
	items, err := s.itemRepo.ListByJob(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar itens do job %s: %w", jobID, err)
	}
	return items, nil
}

// CancelJob marks the job and its pending items as canceled. The worker checks the
// status between items, so an in-flight playlist stops after the current file (RF8.3).
func (s *IngestService) CancelJob(ctx context.Context, jobID string) error {
	job, err := s.jobRepo.FindByID(ctx, jobID)
	if err != nil {
		return fmt.Errorf("falha ao consultar job %s: %w", jobID, err)
	}
	if err := job.Cancel(); err != nil {
		return fmt.Errorf("job não pode ser cancelado: %w", err)
	}
	if err := s.jobRepo.Update(ctx, job); err != nil {
		return fmt.Errorf("falha ao cancelar job: %w", err)
	}

	s.updateItems(ctx, jobID, func(item *ingest.JobItem) bool {
		return item.Cancel() == nil
	})

	slog.InfoContext(ctx, "job de download cancelado", "job_id", jobID)
	s.publish(ctx, job)
	return nil
}

// RetryJob re-queues only the items that failed (RF8.3).
func (s *IngestService) RetryJob(ctx context.Context, jobID string) (*ingest.DownloadJob, error) {
	job, err := s.jobRepo.FindByID(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("falha ao consultar job %s: %w", jobID, err)
	}

	if err := job.Requeue(); err != nil {
		// A completed playlist can still hold failed items worth retrying.
		if job.Status != ingest.StatusCompleted {
			return nil, fmt.Errorf("job não pode ser reenfileirado: %w", err)
		}
		job.Status = ingest.StatusQueued
	}

	if err := s.jobRepo.Update(ctx, job); err != nil {
		return nil, fmt.Errorf("falha ao reenfileirar job: %w", err)
	}

	s.updateItems(ctx, jobID, func(item *ingest.JobItem) bool {
		return item.Requeue() == nil
	})

	s.enqueue(ctx, job)
	s.publish(ctx, job)
	return job, nil
}

// DeleteJob removes the job from the history. Files already downloaded stay on disk.
func (s *IngestService) DeleteJob(ctx context.Context, jobID string) error {
	if err := s.jobRepo.Delete(ctx, jobID); err != nil {
		return fmt.Errorf("falha ao remover job do histórico: %w", err)
	}
	slog.InfoContext(ctx, "job removido do histórico", "job_id", jobID)
	if s.events != nil {
		s.events.PublishJobEvent(ctx, ports.JobEvent{Type: ports.JobEventDeleted, JobID: jobID})
	}
	return nil
}

// updateItems applies a transition to every item of a job, skipping the ones where the
// transition is not legal (already completed, for instance).
func (s *IngestService) updateItems(ctx context.Context, jobID string, apply func(*ingest.JobItem) bool) {
	if s.itemRepo == nil {
		return
	}
	items, err := s.itemRepo.ListByJob(ctx, jobID)
	if err != nil {
		slog.WarnContext(ctx, "falha ao listar itens do job", "job_id", jobID, "err", err)
		return
	}
	for i := range items {
		if !apply(&items[i]) {
			continue
		}
		if err := s.itemRepo.Update(ctx, &items[i]); err != nil {
			slog.WarnContext(ctx, "falha ao atualizar item do job", "job_id", jobID, "item_id", items[i].ID, "err", err)
		}
	}
}

// publish notifies the SSE stream (RF8.5), including the freshly aggregated progress.
func (s *IngestService) publish(ctx context.Context, job *ingest.DownloadJob) {
	if s.events == nil {
		return
	}

	event := ports.JobEvent{Type: ports.JobEventUpdated, JobID: job.ID, Job: job}
	if s.itemRepo != nil {
		if progress, err := s.itemRepo.ProgressByJobs(ctx, []string{job.ID}); err == nil {
			event.Progress = progress[job.ID]
		}
	}
	s.events.PublishJobEvent(ctx, event)
}

// Errors from the ingest flow that are safe to show to the user as-is.
func IsIngestValidationError(err error) bool {
	for _, sentinel := range []error{
		ingest.ErrInvalidURL,
		ingest.ErrUnsafeURL,
		ingest.ErrUnsupportedSource,
		ingest.ErrInvalidSourceID,
		ingest.ErrInvalidDownloadMode,
		ingest.ErrInvalidProvider,
		ingest.ErrInvalidSourceKind,
		ingest.ErrEmptyBatch,
		ingest.ErrBatchTooLarge,
		discovery.ErrEmptyQuery,
		discovery.ErrInvalidKind,
		discovery.ErrInvalidPlaylistID,
		discovery.ErrInvalidArtistID,
	} {
		if errors.Is(err, sentinel) {
			return true
		}
	}
	return false
}

// EnsureJobItems lets the worker expand a job that could not be expanded at submit time,
// for instance because the remote catalog was briefly unavailable (RF8.2).
func (s *IngestService) EnsureJobItems(ctx context.Context, job *ingest.DownloadJob) ([]ingest.JobItem, error) {
	return s.expandItems(ctx, job)
}

// PublishItemEvent forwards a per-item change from the worker to the SSE stream (RF8.5).
func (s *IngestService) PublishItemEvent(ctx context.Context, jobID string, item *ingest.JobItem, progress ingest.JobProgress) {
	if s.events == nil {
		return
	}
	s.events.PublishJobEvent(ctx, ports.JobEvent{
		Type:     ports.JobEventItem,
		JobID:    jobID,
		Item:     item,
		Progress: progress,
	})
}
