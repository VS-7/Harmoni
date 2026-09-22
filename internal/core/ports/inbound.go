package ports

import (
	"context"
	"io"
	"time"

	"harmoni/internal/core/domain/discovery"
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
	// ListArtistTracks feeds the artist page ("Populares") and the artist radio seed.
	ListArtistTracks(ctx context.Context, id library.ArtistID) ([]library.Track, error)
	// GetArtistCover borrows the art of one of the artist's albums or tracks, since
	// artists have no picture of their own.
	GetArtistCover(ctx context.Context, id library.ArtistID) (*CoverResult, error)
}

type LibraryScanUseCase interface {
	Scan(ctx context.Context) error
}

type RadioUseCase interface {
	GenerateSongRadio(ctx context.Context, seedID library.TrackID, limit int, recentArtistIDs []library.ArtistID, recentTrackIDs []library.TrackID) ([]library.Track, error)
}

// JobView is a download job plus the progress derived from its items (RF8.2).
type JobView struct {
	Job      ingest.DownloadJob
	Progress ingest.JobProgress
}

// Inspection answers "what is behind this link?" before anything is enqueued (RF6.2).
type Inspection struct {
	Provider SourceProvider
	// Kind is the raw kind of the link, including the ambiguous track_in_playlist.
	Kind         ingest.SourceKind
	VideoID      string
	PlaylistID   string
	ChannelID    string
	Title        string
	Artist       string
	ThumbnailURL string
	// ItemCount is the playlist length, when the link points at one.
	ItemCount int
	// IsMix marks auto-generated playlists, which default to a single track.
	IsMix bool
	// Ambiguous tells the UI to ask "just this track" or "the whole playlist".
	Ambiguous bool
	InLibrary bool
}

// SourceProvider mirrors the domain provider so handlers do not import the domain twice.
type SourceProvider = ingest.SourceProvider

type IngestUseCase interface {
	SubmitDownload(ctx context.Context, sourceURL string, mode ingest.DownloadMode) (*ingest.DownloadJob, error)
	SubmitFromSource(ctx context.Context, provider, kind, sourceID string) (*ingest.DownloadJob, error)
	SubmitBatch(ctx context.Context, sources []SourceInput) ([]ingest.DownloadJob, error)
	Inspect(ctx context.Context, sourceURL string) (*Inspection, error)
	GetJobStatus(ctx context.Context, jobID string) (*ingest.DownloadJob, error)
	ListJobs(ctx context.Context, limit int) ([]JobView, error)
	GetJobItems(ctx context.Context, jobID string) ([]ingest.JobItem, error)
	// EnsureJobItems expands a job into one item per video, returning the items already
	// stored when the expansion happened at submit time (RF8.2).
	EnsureJobItems(ctx context.Context, job *ingest.DownloadJob) ([]ingest.JobItem, error)
	CancelJob(ctx context.Context, jobID string) error
	RetryJob(ctx context.Context, jobID string) (*ingest.DownloadJob, error)
	DeleteJob(ctx context.Context, jobID string) error
}

// SourceInput is one entry of a batch download request (RF8.1).
type SourceInput struct {
	Provider string
	Kind     string
	ID       string
}

// Job event types streamed to the downloads screen over SSE (RF8.5).
const (
	JobEventUpdated = "job_updated"
	JobEventItem    = "item_updated"
	JobEventDeleted = "job_deleted"
)

// JobEvent is a single change in the download queue.
type JobEvent struct {
	Type     string              `json:"type"`
	JobID    string              `json:"job_id"`
	Job      *ingest.DownloadJob `json:"job,omitempty"`
	Item     *ingest.JobItem     `json:"item,omitempty"`
	Progress ingest.JobProgress  `json:"progress"`
}

// JobEventPublisher is written to by the use case and the worker.
type JobEventPublisher interface {
	PublishJobEvent(ctx context.Context, event JobEvent)
}

// JobEventSubscriber is read by the SSE handler. Unsubscribe must always be called.
type JobEventSubscriber interface {
	SubscribeJobEvents() (events <-chan JobEvent, unsubscribe func())
}

// DiscoveryUseCase browses the remote catalog (Module 7).
type DiscoveryUseCase interface {
	Search(ctx context.Context, rawQuery, rawKind string, limit int) ([]discovery.RemoteItem, error)
	GetTrack(ctx context.Context, videoID string) (*discovery.RemoteItem, error)
	GetPlaylist(ctx context.Context, playlistID string) (*discovery.RemotePlaylist, error)
	GetArtist(ctx context.Context, channelID string) (*discovery.RemoteArtist, error)
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
	UpdatePlaylist(ctx context.Context, id playlist.PlaylistID, name, description string) (*playlist.Playlist, error)
}

// PlaylistFolderUseCase organizes playlists into folders in the library sidebar.
type PlaylistFolderUseCase interface {
	CreateFolder(ctx context.Context, name string) (*playlist.Folder, error)
	ListFolders(ctx context.Context) ([]*playlist.Folder, error)
	RenameFolder(ctx context.Context, id playlist.FolderID, name string) (*playlist.Folder, error)
	// DeleteFolder removes only the folder; its playlists go back to the library root.
	DeleteFolder(ctx context.Context, id playlist.FolderID) error
	// MovePlaylist puts a playlist inside a folder, or back at the root when folderID is nil.
	MovePlaylist(ctx context.Context, playlistID playlist.PlaylistID, folderID *playlist.FolderID) error
}
