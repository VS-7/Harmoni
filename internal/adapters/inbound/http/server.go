package http

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"harmoni/internal/adapters/inbound/http/middleware"
	"harmoni/internal/adapters/inbound/http/rest"
	"harmoni/internal/adapters/inbound/http/subsonic"
	"harmoni/internal/adapters/inbound/http/web"
	"harmoni/internal/core/ports"
)

type Server struct {
	httpServer *http.Server
	port       string
}

type HandlersConfig struct {
	TrackUC    ports.TrackUseCase
	AlbumUC    ports.AlbumUseCase
	ArtistUC   ports.ArtistUseCase
	ScanUC     ports.LibraryScanUseCase
	RadioUC    ports.RadioUseCase
	IngestUC   ports.IngestUseCase
	SubsonicUC ports.SubsonicUseCase
}

func NewServer(port string, cfg HandlersConfig) *Server {
	mux := http.NewServeMux()

	// REST Handlers
	trackH := rest.NewTrackHandler(cfg.TrackUC)
	streamH := rest.NewStreamHandler(cfg.TrackUC)
	coverH := rest.NewCoverHandler(cfg.TrackUC)
	albumH := rest.NewAlbumHandler(cfg.AlbumUC)
	artistH := rest.NewArtistHandler(cfg.ArtistUC)
	radioH := rest.NewRadioHandler(cfg.RadioUC)
	downloadH := rest.NewDownloadHandler(cfg.IngestUC)
	scanH := rest.NewScanHandler(cfg.ScanUC)

	// Register REST routes (Go 1.26+ syntax)
	mux.HandleFunc("GET /api/v1/health", rest.HealthHandler)
	mux.HandleFunc("GET /api/v1/library/tracks", trackH.ListTracks)
	mux.HandleFunc("GET /api/v1/library/tracks/{id}", trackH.GetTrack)
	mux.HandleFunc("GET /api/v1/library/albums", albumH.ListAlbums)
	mux.HandleFunc("GET /api/v1/library/albums/{id}", albumH.GetAlbum)
	mux.HandleFunc("GET /api/v1/library/albums/{id}/cover", albumH.GetCover)
	mux.HandleFunc("GET /api/v1/library/artists", artistH.ListArtists)
	mux.HandleFunc("GET /api/v1/library/artists/{id}", artistH.GetArtist)
	mux.HandleFunc("GET /api/v1/stream/{id}", streamH.ServeHTTP)
	mux.HandleFunc("GET /api/v1/covers/{id}", coverH.ServeHTTP)
	mux.HandleFunc("GET /api/v1/radio", radioH.ServeHTTP)
	mux.HandleFunc("POST /api/v1/downloads", downloadH.SubmitDownload)
	mux.HandleFunc("GET /api/v1/downloads/{id}", downloadH.GetStatus)
	mux.HandleFunc("GET /api/v1/downloads", downloadH.ListJobs)
	mux.HandleFunc("POST /api/v1/library/scan", scanH.TriggerScan)

	// Subsonic Handlers
	subsonicH := subsonic.NewHandler(cfg.SubsonicUC, cfg.TrackUC)
	mux.HandleFunc("GET /rest/ping.view", subsonicH.Ping)
	mux.HandleFunc("POST /rest/ping.view", subsonicH.Ping)
	mux.HandleFunc("GET /rest/getArtists.view", subsonicH.GetArtists)
	mux.HandleFunc("GET /rest/getArtist.view", subsonicH.GetArtist)
	mux.HandleFunc("GET /rest/getAlbum.view", subsonicH.GetAlbum)
	mux.HandleFunc("GET /rest/getSong.view", subsonicH.GetSong)
	mux.HandleFunc("GET /rest/getSimilarSongs.view", subsonicH.GetSimilarSongs)
	mux.HandleFunc("GET /rest/stream.view", subsonicH.Stream)
	mux.HandleFunc("GET /rest/download.view", subsonicH.Stream)

	// Web UI SPA (go:embed)
	embedH := web.NewEmbedHandler()
	mux.Handle("/", embedH)

	// Wrap middleware pipeline
	handler := middleware.Recovery(middleware.Logger(middleware.CORS(mux)))

	server := &http.Server{
		Addr:        ":" + port,
		Handler:     handler,
		ReadTimeout: 30 * time.Second,
		IdleTimeout: 120 * time.Second,
		// No WriteTimeout to allow long-running audio streams
	}

	return &Server{
		httpServer: server,
		port:       port,
	}
}

func (s *Server) Start() error {
	slog.Info("iniciando servidor http harmoni", "porta", s.port)
	if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("falha ao executar servidor http: %w", err)
	}
	return nil
}

func (s *Server) Shutdown(ctx context.Context) error {
	slog.InfoContext(ctx, "encerrando servidor http graciosamente")
	return s.httpServer.Shutdown(ctx)
}
