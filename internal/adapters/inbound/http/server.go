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
	PlaylistUC ports.PlaylistUseCase
	IngestUC   ports.IngestUseCase
	SubsonicUC ports.SubsonicUseCase
	// DiscoveryUC and JobEvents power the search tab and the live download queue (v2).
	DiscoveryUC ports.DiscoveryUseCase
	JobEvents   ports.JobEventSubscriber
}

func NewServer(port string, cfg HandlersConfig) *Server {
	mux := http.NewServeMux()

	// REST Handlers
	trackH := rest.NewTrackHandler(cfg.TrackUC)
	streamH := rest.NewStreamHandler(cfg.TrackUC)
	coverH := rest.NewCoverHandler(cfg.TrackUC, cfg.AlbumUC)
	albumH := rest.NewAlbumHandler(cfg.AlbumUC)
	artistH := rest.NewArtistHandler(cfg.ArtistUC)
	radioH := rest.NewRadioHandler(cfg.RadioUC)
	playlistH := rest.NewPlaylistHandler(cfg.PlaylistUC)
	downloadH := rest.NewDownloadHandler(cfg.IngestUC, cfg.JobEvents)
	discoverH := rest.NewDiscoverHandler(cfg.DiscoveryUC)
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
	mux.HandleFunc("GET /api/v1/playlists", playlistH.ListPlaylists)
	mux.HandleFunc("POST /api/v1/playlists", playlistH.CreatePlaylist)
	mux.HandleFunc("POST /api/v1/playlists/smart", playlistH.CreateSmartPlaylist)
	mux.HandleFunc("GET /api/v1/playlists/{id}", playlistH.GetPlaylist)
	mux.HandleFunc("DELETE /api/v1/playlists/{id}", playlistH.DeletePlaylist)
	mux.HandleFunc("POST /api/v1/playlists/{id}/tracks", playlistH.AddTrack)
	mux.HandleFunc("DELETE /api/v1/playlists/{id}/tracks/{trackId}", playlistH.RemoveTrack)
	mux.HandleFunc("POST /api/v1/downloads", downloadH.SubmitDownload)
	mux.HandleFunc("POST /api/v1/downloads/batch", downloadH.SubmitBatch)
	mux.HandleFunc("POST /api/v1/downloads/inspect", downloadH.Inspect)
	mux.HandleFunc("GET /api/v1/downloads", downloadH.ListJobs)
	// Literal segments win over {id} in the Go 1.22+ mux, so /events is never read as an id.
	mux.HandleFunc("GET /api/v1/downloads/events", downloadH.Events)
	mux.HandleFunc("GET /api/v1/downloads/{id}", downloadH.GetStatus)
	mux.HandleFunc("GET /api/v1/downloads/{id}/items", downloadH.ListItems)
	mux.HandleFunc("POST /api/v1/downloads/{id}/cancel", downloadH.CancelJob)
	mux.HandleFunc("POST /api/v1/downloads/{id}/retry", downloadH.RetryJob)
	mux.HandleFunc("DELETE /api/v1/downloads/{id}", downloadH.DeleteJob)

	// Remote catalog discovery (Module 7)
	mux.HandleFunc("GET /api/v1/discover/search", discoverH.Search)
	mux.HandleFunc("GET /api/v1/discover/playlists/{id}", discoverH.GetPlaylist)
	mux.HandleFunc("GET /api/v1/discover/artists/{id}", discoverH.GetArtist)
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
