package worker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/playlist"
	"harmoni/internal/core/ports"
)

// DownloadWorker drains the download queue with exactly one goroutine (Guardrail 4).
type DownloadWorker struct {
	jobRepo    ports.DownloadJobRepository
	itemRepo   ports.DownloadJobItemRepository
	ingestUC   ports.IngestUseCase
	events     ports.JobEventPublisher
	jobQueue   <-chan string
	client     ports.DownloaderClient
	scanner    ports.LibraryScanUseCase
	playlistUC ports.PlaylistUseCase
	trackRepo  ports.TrackRepository
	outputDir  string
	wg         sync.WaitGroup
	ctx        context.Context
	cancel     context.CancelFunc
}

func NewDownloadWorker(
	jobRepo ports.DownloadJobRepository,
	itemRepo ports.DownloadJobItemRepository,
	ingestUC ports.IngestUseCase,
	events ports.JobEventPublisher,
	jobQueue <-chan string,
	client ports.DownloaderClient,
	scanner ports.LibraryScanUseCase,
	playlistUC ports.PlaylistUseCase,
	trackRepo ports.TrackRepository,
	outputDir string,
) *DownloadWorker {
	return &DownloadWorker{
		jobRepo:    jobRepo,
		itemRepo:   itemRepo,
		ingestUC:   ingestUC,
		events:     events,
		jobQueue:   jobQueue,
		client:     client,
		scanner:    scanner,
		playlistUC: playlistUC,
		trackRepo:  trackRepo,
		outputDir:  filepath.Clean(outputDir),
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

// processJob downloads a job item by item, so progress is real, an isolated failure does
// not sink the whole playlist and a cancel takes effect between items (RF8.2, RF8.3).
func (w *DownloadWorker) processJob(ctx context.Context, jobID string) {
	slog.InfoContext(ctx, "iniciando processamento do job de download", "job_id", jobID)

	job, err := w.jobRepo.FindByID(ctx, jobID)
	if err != nil {
		slog.ErrorContext(ctx, "job de download não encontrado no banco", "job_id", jobID, "err", err)
		return
	}

	if err := job.StartProcessing(); err != nil {
		slog.WarnContext(ctx, "job ignorado: não está mais na fila", "job_id", jobID, "status", job.Status.String())
		return
	}
	_ = w.jobRepo.Update(ctx, job)
	w.publishJob(ctx, job, ingest.JobProgress{})

	items, err := w.loadItems(ctx, job)
	if err != nil {
		w.failJob(ctx, job, fmt.Sprintf("não foi possível preparar o download: %v", err))
		return
	}

	downloaded := w.downloadItems(ctx, job, items)

	// A single library scan after the whole job costs far less than one per file.
	if downloaded > 0 && w.scanner != nil {
		if err := w.scanner.Scan(ctx); err != nil {
			slog.WarnContext(ctx, "aviso na varredura pós-download", "job_id", jobID, "err", err)
		}
		w.linkTracks(ctx, job, items)
	}

	if job.Kind == ingest.KindPlaylist && w.playlistUC != nil && w.trackRepo != nil {
		w.syncPlaylist(ctx, job, items)
	}

	w.finishJob(ctx, job, items)
}

// loadItems reads the expansion of the job, expanding it now if the submit could not.
func (w *DownloadWorker) loadItems(ctx context.Context, job *ingest.DownloadJob) ([]ingest.JobItem, error) {
	if w.itemRepo == nil {
		return nil, errors.New("repositório de itens indisponível")
	}

	items, err := w.itemRepo.ListByJob(ctx, job.ID)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar itens do job: %w", err)
	}
	if len(items) > 0 {
		return items, nil
	}

	if w.ingestUC == nil {
		return nil, errors.New("job sem itens para baixar")
	}
	return w.ingestUC.EnsureJobItems(ctx, job)
}

// downloadItems runs the queue of a job and returns how many files were produced.
func (w *DownloadWorker) downloadItems(ctx context.Context, job *ingest.DownloadJob, items []ingest.JobItem) int {
	subDir := w.subDirFor(job)
	downloaded := 0

	for i := range items {
		item := &items[i]
		if item.Status.IsTerminal() {
			continue
		}

		// Cancellation is checked between items: the current file always finishes.
		if w.isCanceled(ctx, job.ID) {
			slog.InfoContext(ctx, "job cancelado, interrompendo fila de itens", "job_id", job.ID)
			_ = item.Cancel()
			w.saveItem(ctx, job, item, items)
			return downloaded
		}
		if ctx.Err() != nil {
			return downloaded
		}

		if err := item.StartProcessing(); err != nil {
			continue
		}
		w.saveItem(ctx, job, item, items)

		req := ports.DownloadRequest{Ref: item.Ref(), SubDir: subDir}
		if job.Kind == ingest.KindPlaylist {
			req.Position = item.Position + 1
		}

		result, err := w.client.Download(ctx, req)
		switch {
		case err != nil:
			slog.WarnContext(ctx, "falha no download de um item", "job_id", job.ID, "source_id", item.SourceID, "err", err)
			_ = item.Fail(shortError(err))
		case result.SkippedByArchive:
			// Already downloaded in a previous run: nothing to do, and not a failure.
			_ = item.Skip("")
		case len(result.Items) > 0:
			item.Title = firstNonEmpty(item.Title, titleFromPath(result.Items[0].AudioPath))
			_ = item.Complete("")
			downloaded++
		default:
			_ = item.Fail("nenhum arquivo de áudio foi gerado")
		}

		w.saveItem(ctx, job, item, items)
	}

	return downloaded
}

// linkTracks connects each finished item to the indexed track and stamps the remote
// source on it, which is what feeds the "already in library" flag of discovery (RF7.1).
func (w *DownloadWorker) linkTracks(ctx context.Context, job *ingest.DownloadJob, items []ingest.JobItem) {
	if w.trackRepo == nil {
		return
	}

	known, err := w.trackRepo.FindTrackIDsBySource(ctx, string(ingest.ProviderYouTube), sourceIDsOf(items))
	if err != nil {
		slog.WarnContext(ctx, "falha ao mapear faixas baixadas por origem", "job_id", job.ID, "err", err)
		known = map[string]library.TrackID{}
	}

	for i := range items {
		item := &items[i]
		if item.Status != ingest.ItemCompleted || item.TrackID != nil {
			continue
		}

		trackID, ok := known[item.SourceID]
		if !ok {
			// The scan indexes by filename, which carries the id: "Título [<id>].mp3".
			continue
		}
		id := string(trackID)
		item.TrackID = &id
		if err := w.itemRepo.Update(ctx, item); err != nil {
			slog.WarnContext(ctx, "falha ao vincular item à faixa indexada", "item_id", item.ID, "err", err)
		}
	}
}

// syncPlaylist creates or updates the Harmoni playlist of a playlist job, keyed by the
// remote playlist id instead of the folder name (RF8.4).
func (w *DownloadWorker) syncPlaylist(ctx context.Context, job *ingest.DownloadJob, items []ingest.JobItem) {
	target, err := w.resolvePlaylist(ctx, job)
	if err != nil || target == nil {
		slog.WarnContext(ctx, "não foi possível preparar a playlist do download", "job_id", job.ID, "err", err)
		return
	}

	existing := make(map[string]bool, len(target.Tracks))
	for _, t := range target.Tracks {
		existing[string(t.ID)] = true
	}

	added := 0
	// items are ordered by position, so the playlist keeps the remote order.
	for i := range items {
		item := &items[i]
		if item.TrackID == nil || existing[*item.TrackID] {
			continue
		}
		if err := w.playlistUC.AddTrackToPlaylist(ctx, target.ID, library.TrackID(*item.TrackID)); err != nil {
			slog.WarnContext(ctx, "falha ao adicionar faixa à playlist importada", "track_id", *item.TrackID, "err", err)
			continue
		}
		existing[*item.TrackID] = true
		added++
	}

	if job.PlaylistID == nil {
		job.LinkPlaylist(string(target.ID))
		_ = w.jobRepo.Update(ctx, job)
	}
	slog.InfoContext(ctx, "playlist sincronizada com o download", "playlist", target.Name, "adicionadas", added)
}

// resolvePlaylist reuses the playlist already linked to this remote source before
// falling back to creating a new one.
func (w *DownloadWorker) resolvePlaylist(ctx context.Context, job *ingest.DownloadJob) (*playlist.Playlist, error) {
	if job.PlaylistID != nil {
		if pl, err := w.playlistUC.GetPlaylist(ctx, playlist.PlaylistID(*job.PlaylistID)); err == nil {
			return pl, nil
		}
		// The playlist was deleted by the user: fall through and create a new one.
	}

	if existingID, err := w.jobRepo.FindPlaylistIDBySource(ctx, string(job.Provider), job.SourceID); err == nil && existingID != "" {
		if pl, err := w.playlistUC.GetPlaylist(ctx, playlist.PlaylistID(existingID)); err == nil {
			job.LinkPlaylist(existingID)
			return pl, nil
		}
	}

	name := strings.TrimSpace(job.Title)
	if name == "" {
		name = "Playlist " + job.SourceID
	}
	return w.playlistUC.CreatePlaylist(ctx, name, "Playlist importada automaticamente do YouTube")
}

// finishJob closes the job according to what its items achieved.
func (w *DownloadWorker) finishJob(ctx context.Context, job *ingest.DownloadJob, items []ingest.JobItem) {
	progress := ingest.NewJobProgress(items)

	if w.isCanceled(ctx, job.ID) {
		slog.InfoContext(ctx, "job de download cancelado", "job_id", job.ID)
		return
	}

	switch {
	case progress.Done == 0 && progress.Failed > 0:
		w.failJob(ctx, job, fmt.Sprintf("nenhum item pôde ser baixado (%d falhas)", progress.Failed))
		return
	case progress.Done == 0:
		w.failJob(ctx, job, "nenhum item foi processado")
		return
	}

	if err := job.Complete(); err != nil {
		slog.ErrorContext(ctx, "falha ao marcar job como concluído", "job_id", job.ID, "err", err)
		return
	}
	_ = w.jobRepo.Update(ctx, job)
	w.publishJob(ctx, job, progress)

	slog.InfoContext(ctx, "job de download concluído",
		"job_id", job.ID, "baixados", progress.Done, "falhas", progress.Failed, "total", progress.Total)
}

func (w *DownloadWorker) failJob(ctx context.Context, job *ingest.DownloadJob, msg string) {
	slog.ErrorContext(ctx, "job de download falhou", "job_id", job.ID, "motivo", msg)
	if err := job.Fail(msg); err != nil {
		return
	}
	_ = w.jobRepo.Update(ctx, job)
	w.publishJob(ctx, job, ingest.JobProgress{})
}

// isCanceled re-reads the status, which is how a cancel issued through the API reaches
// a job that is already running (RF8.3).
func (w *DownloadWorker) isCanceled(ctx context.Context, jobID string) bool {
	current, err := w.jobRepo.FindByID(ctx, jobID)
	if err != nil {
		return false
	}
	return current.Status == ingest.StatusCanceled
}

// subDirFor groups the files of a playlist in their own folder under the media root.
func (w *DownloadWorker) subDirFor(job *ingest.DownloadJob) string {
	if job.Kind != ingest.KindPlaylist {
		return ""
	}
	if title := strings.TrimSpace(job.Title); title != "" {
		return title
	}
	return "Playlist " + job.SourceID
}

func (w *DownloadWorker) saveItem(ctx context.Context, job *ingest.DownloadJob, item *ingest.JobItem, items []ingest.JobItem) {
	if w.itemRepo != nil {
		if err := w.itemRepo.Update(ctx, item); err != nil {
			slog.WarnContext(ctx, "falha ao atualizar item do job", "item_id", item.ID, "err", err)
		}
	}
	if w.events != nil {
		w.events.PublishJobEvent(ctx, ports.JobEvent{
			Type:     ports.JobEventItem,
			JobID:    job.ID,
			Item:     item,
			Progress: ingest.NewJobProgress(items),
		})
	}
}

func (w *DownloadWorker) publishJob(ctx context.Context, job *ingest.DownloadJob, progress ingest.JobProgress) {
	if w.events == nil {
		return
	}
	w.events.PublishJobEvent(ctx, ports.JobEvent{
		Type:     ports.JobEventUpdated,
		JobID:    job.ID,
		Job:      job,
		Progress: progress,
	})
}

func sourceIDsOf(items []ingest.JobItem) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.SourceID)
	}
	return ids
}

// titleFromPath recovers a readable title from the generated filename, used when the
// remote catalog gave no title for the item.
func titleFromPath(path string) string {
	base := filepath.Base(path)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if idx := strings.LastIndex(base, " ["); idx > 0 {
		base = base[:idx]
	}
	return strings.TrimSpace(base)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

// shortError keeps the raw yt-dlp output out of the stored message (RNF8).
func shortError(err error) string {
	msg := err.Error()
	if len(msg) > 300 {
		msg = msg[:300] + "…"
	}
	return msg
}
