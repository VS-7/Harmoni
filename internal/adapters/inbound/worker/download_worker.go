package worker

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"harmoni/internal/core/domain/playlist"
	"harmoni/internal/core/ports"
)

type DownloadWorker struct {
	jobRepo    ports.DownloadJobRepository
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
	jobQueue <-chan string,
	client ports.DownloaderClient,
	scanner ports.LibraryScanUseCase,
	playlistUC ports.PlaylistUseCase,
	trackRepo ports.TrackRepository,
	outputDir string,
) *DownloadWorker {
	return &DownloadWorker{
		jobRepo:    jobRepo,
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

	// Automatic playlist creation if downloaded URL was a playlist or created a subfolder
	audioDir := filepath.Dir(audioPath)
	if w.playlistUC != nil && w.trackRepo != nil && audioDir != w.outputDir {
		folderName := filepath.Base(audioDir)
		w.createPlaylistFromFolder(ctx, folderName, audioDir)
	}

	if err := job.Complete(); err != nil {
		slog.ErrorContext(ctx, "falha ao marcar job como concluído", "job_id", jobID, "err", err)
		return
	}
	_ = w.jobRepo.Update(ctx, job)
	slog.InfoContext(ctx, "job de download concluído com sucesso", "job_id", jobID)
}

func (w *DownloadWorker) createPlaylistFromFolder(ctx context.Context, name, folderPath string) {
	slog.InfoContext(ctx, "criando ou atualizando playlist a partir de download de playlist", "nome", name, "pasta", folderPath)

	playlists, err := w.playlistUC.ListPlaylists(ctx)
	if err != nil {
		slog.WarnContext(ctx, "falha ao listar playlists para verificar existência", "err", err)
		return
	}

	var targetPL *playlist.Playlist
	for _, p := range playlists {
		if strings.EqualFold(p.Name, name) {
			targetPL = p
			break
		}
	}

	if targetPL == nil {
		newPL, err := w.playlistUC.CreatePlaylist(ctx, name, "Playlist importada automaticamente do YouTube")
		if err != nil {
			slog.WarnContext(ctx, "falha ao criar playlist para pasta", "pasta", name, "err", err)
			return
		}
		targetPL = newPL
	}

	// Collect audio files in folder in sorted order
	var audioFiles []string
	_ = filepath.WalkDir(folderPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if ext == ".mp3" || ext == ".flac" || ext == ".m4a" || ext == ".opus" {
			audioFiles = append(audioFiles, path)
		}
		return nil
	})
	sort.Strings(audioFiles)

	for _, fPath := range audioFiles {
		cleanFPath := filepath.Clean(fPath)
		tr, err := w.trackRepo.FindByFilePath(ctx, cleanFPath)
		if err == nil && tr != nil {
			_ = w.playlistUC.AddTrackToPlaylist(ctx, targetPL.ID, tr.ID)
		}
	}

	slog.InfoContext(ctx, "playlist populada automaticamente com faixas baixadas", "playlist", name, "faixas_processadas", len(audioFiles))
}
