package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	httpAdapter "harmoni/internal/adapters/inbound/http"
	"harmoni/internal/adapters/inbound/worker"
	"harmoni/internal/adapters/outbound/embedding"
	"harmoni/internal/adapters/outbound/filesystem"
	"harmoni/internal/adapters/outbound/postgres"
	"harmoni/internal/adapters/outbound/ytdlp"
	"harmoni/internal/core/usecase"
	"harmoni/internal/platform/config"
	"harmoni/internal/platform/database"
	"harmoni/internal/platform/logger"
)

func main() {
	// 1. Load configuration
	cfg, err := config.Load()
	if err != nil {
		slog.Error("falha ao carregar configurações", "err", err)
		os.Exit(1)
	}

	// 2. Initialize structured logger
	l := logger.Init(cfg.Env)
	slog.Info("iniciando harmoni server", "version", "1.0.0", "env", cfg.Env, "port", cfg.Port)

	// Context for graceful shutdown
	rootCtx, rootCancel := context.WithCancel(context.Background())
	defer rootCancel()

	// 3. Connect to PostgreSQL
	dbCtx, dbCancel := context.WithTimeout(rootCtx, 10*time.Second)
	defer dbCancel()

	pool, err := postgres.NewPool(dbCtx, cfg.DatabaseURL)
	if err != nil {
		slog.Warn("aviso: conexão com postgres falhou (verifique se o serviço está ativo)", "err", err)
	} else {
		defer pool.Close()
		// 4. Run database migrations
		if err := database.RunMigrations(rootCtx, pool); err != nil {
			slog.Error("falha ao aplicar migrações do banco de dados", "err", err)
			os.Exit(1)
		}
	}

	// 5. Outbound Adapters
	audioStorage, err := filesystem.NewAudioStorage(cfg.MusicDir)
	if err != nil {
		slog.Error("falha ao inicializar armazenamento de áudio", "err", err)
		os.Exit(1)
	}

	tagExtractor := filesystem.NewTagExtractor()
	embedder := embedding.NewLocalEmbeddingGenerator()

	downloader, err := ytdlp.NewDownloader(cfg.MusicDir)
	if err != nil {
		slog.Error("falha ao inicializar downloader yt-dlp", "err", err)
		os.Exit(1)
	}

	var (
		artistRepo      *postgres.ArtistRepository
		albumRepo       *postgres.AlbumRepository
		trackRepo       *postgres.TrackRepository
		radioRepo       *postgres.RadioRepository
		playlistRepo    *postgres.PlaylistRepository
		downloadJobRepo *postgres.DownloadJobRepository
	)

	if pool != nil {
		artistRepo = postgres.NewArtistRepository(pool)
		albumRepo = postgres.NewAlbumRepository(pool)
		trackRepo = postgres.NewTrackRepository(pool)
		radioRepo = postgres.NewRadioRepository(pool)
		playlistRepo = postgres.NewPlaylistRepository(pool)
		downloadJobRepo = postgres.NewDownloadJobRepository(pool)
	}

	// 6. Queue Channel (Buffer: 100)
	jobQueue := make(chan string, 100)

	// 7. Use Cases
	var (
		trackUC    *usecase.TrackService
		albumUC    *usecase.AlbumService
		artistUC   *usecase.ArtistService
		scanUC     *usecase.LibraryScanService
		radioUC    *usecase.RadioService
		playlistUC *usecase.PlaylistService
		ingestUC   *usecase.IngestService
		subsonicUC *usecase.SubsonicService
	)

	if pool != nil {
		trackUC = usecase.NewTrackService(trackRepo, audioStorage)
		albumUC = usecase.NewAlbumService(albumRepo, trackRepo, audioStorage)
		artistUC = usecase.NewArtistService(artistRepo, albumRepo)
		scanUC = usecase.NewLibraryScanService(cfg.MusicDir, trackRepo, albumRepo, artistRepo, tagExtractor, audioStorage, embedder)
		radioUC = usecase.NewRadioService(trackRepo, radioRepo, embedder)
		playlistUC = usecase.NewPlaylistService(playlistRepo, trackRepo, radioUC)
		ingestUC = usecase.NewIngestService(downloadJobRepo, jobQueue)
		subsonicUC = usecase.NewSubsonicService("admin", "admin", artistRepo, albumRepo, trackRepo, radioUC)

		// 8. Ingest Worker (Single-worker throttled queue)
		downloadWorker := worker.NewDownloadWorker(downloadJobRepo, jobQueue, downloader, scanUC, playlistUC, trackRepo, cfg.MusicDir)
		downloadWorker.Start(rootCtx)
		defer downloadWorker.Stop()

		// Trigger non-blocking initial scan
		go func() {
			scanCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
			defer cancel()
			if err := scanUC.Scan(scanCtx); err != nil {
				slog.Warn("aviso na varredura inicial de mídia", "err", err)
			}
		}()
	}

	// 9. HTTP Server
	serverCfg := httpAdapter.HandlersConfig{
		TrackUC:    trackUC,
		AlbumUC:    albumUC,
		ArtistUC:   artistUC,
		ScanUC:     scanUC,
		RadioUC:    radioUC,
		PlaylistUC: playlistUC,
		IngestUC:   ingestUC,
		SubsonicUC: subsonicUC,
	}

	srv := httpAdapter.NewServer(cfg.Port, serverCfg)

	go func() {
		if err := srv.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("falha no servidor http", "err", err)
			os.Exit(1)
		}
	}()

	// 10. Graceful Shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	sig := <-sigChan
	slog.Info("sinal de término recebido, iniciando encerramento gracioso", "signal", sig.String())

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("erro durante o encerramento do servidor http", "err", err)
	}

	_ = l
	slog.Info("servidor harmoni finalizado com sucesso")
}
