package ports

import (
	"context"
	"io"
	"time"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/playlist"
)

type StreamResult struct {
	Content      io.ReadSeekCloser
	FileSize     int64
	FileFormat   library.AudioFormat
	MIMEType     string
	ETag         string
	LastModified time.Time
}

type CoverResult struct {
	Content      io.ReadCloser
	MIMEType     string
	ETag         string
	LastModified time.Time
}

type TrackUseCase interface {
	GetTrack(ctx context.Context, id library.TrackID) (*library.Track, error)
	ListTracks(ctx context.Context, offset, limit int, query string) ([]library.Track, int, error)
	StreamTrack(ctx context.Context, id library.TrackID) (*StreamResult, error)
	GetCoverArt(ctx context.Context, id library.TrackID) (*CoverResult, error)
}

type AlbumUseCase interface {
	GetAlbum(ctx context.Context, id library.AlbumID) (*library.Album, []library.Track, error)
	ListAlbums(ctx context.Context, offset, limit int) ([]library.Album, int, error)
	GetAlbumCover(ctx context.Context, id library.AlbumID) (*CoverResult, error)
}

type ArtistUseCase interface {
	GetArtist(ctx context.Context, id library.ArtistID) (*library.Artist, []library.Album, error)
	ListArtists(ctx context.Context, offset, limit int) ([]library.Artist, int, error)
}

type LibraryScanUseCase interface {
	Scan(ctx context.Context) error
}

type RadioUseCase interface {
	GenerateSongRadio(ctx context.Context, seedID library.TrackID, limit int, recentArtistIDs []library.ArtistID, recentTrackIDs []library.TrackID) ([]library.Track, error)
}

type IngestUseCase interface {
	SubmitDownload(ctx context.Context, sourceURL string, mode ingest.DownloadMode) (*ingest.DownloadJob, error)
	GetJobStatus(ctx context.Context, jobID string) (*ingest.DownloadJob, error)
	ListJobs(ctx context.Context, limit int) ([]ingest.DownloadJob, error)
}

type SubsonicUseCase interface {
	Authenticate(ctx context.Context, username, token, salt string) (bool, error)
	GetSubsonicArtists(ctx context.Context) ([]library.Artist, error)
	GetSubsonicArtist(ctx context.Context, id library.ArtistID) (*library.Artist, []library.Album, error)
	GetSubsonicAlbum(ctx context.Context, id library.AlbumID) (*library.Album, []library.Track, error)
	GetSubsonicSong(ctx context.Context, id library.TrackID) (*library.Track, error)
	GetSimilarSongs(ctx context.Context, seedID library.TrackID, count int) ([]library.Track, error)
}

type PlaylistUseCase interface {
	CreatePlaylist(ctx context.Context, name, description string) (*playlist.Playlist, error)
	GetPlaylist(ctx context.Context, id playlist.PlaylistID) (*playlist.Playlist, error)
	ListPlaylists(ctx context.Context) ([]*playlist.Playlist, error)
	DeletePlaylist(ctx context.Context, id playlist.PlaylistID) error
	AddTrackToPlaylist(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID) error
	RemoveTrackFromPlaylist(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID) error
	CreateSmartPlaylist(ctx context.Context, seedTrackID library.TrackID, name string, limit int) (*playlist.Playlist, error)
}

