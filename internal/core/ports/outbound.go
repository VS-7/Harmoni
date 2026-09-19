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

type ExtractedMetadata struct {
	Title       string
	Artist      string
	Album       string
	Year        int
	TrackNumber int
	Genre       string
	Duration    time.Duration
	Format      library.AudioFormat
	Bitrate     int
	HasPicture  bool
	PictureData []byte
	PictureMIME string
}

// Track Interfaces (ISP)
type TrackReader interface {
	FindByID(ctx context.Context, id library.TrackID) (*library.Track, error)
	FindByFilePath(ctx context.Context, filePath string) (*library.Track, error)
	List(ctx context.Context, offset, limit int, query string) ([]library.Track, int, error)
	ListByAlbumID(ctx context.Context, albumID library.AlbumID) ([]library.Track, error)
	ListByArtistID(ctx context.Context, artistID library.ArtistID) ([]library.Track, error)
	// FindTrackIDsBySource maps remote source ids already in the library, for the
	// "in_library" flag of discovery results (RF7.1).
	FindTrackIDsBySource(ctx context.Context, provider string, sourceIDs []string) (map[string]library.TrackID, error)
}

type TrackWriter interface {
	Save(ctx context.Context, track *library.Track) error
	Update(ctx context.Context, track *library.Track) error
	Delete(ctx context.Context, id library.TrackID) error
}

type TrackRepository interface {
	TrackReader
	TrackWriter
}

// Album Interfaces (ISP)
type AlbumReader interface {
	FindByID(ctx context.Context, id library.AlbumID) (*library.Album, error)
	FindByTitleAndArtist(ctx context.Context, title string, artistID library.ArtistID) (*library.Album, error)
	List(ctx context.Context, offset, limit int) ([]library.Album, int, error)
	ListByArtistID(ctx context.Context, artistID library.ArtistID) ([]library.Album, error)
}

type AlbumWriter interface {
	Save(ctx context.Context, album *library.Album) error
	Update(ctx context.Context, album *library.Album) error
}

type AlbumRepository interface {
	AlbumReader
	AlbumWriter
}

// Artist Interfaces (ISP)
type ArtistReader interface {
	FindByID(ctx context.Context, id library.ArtistID) (*library.Artist, error)
	FindByName(ctx context.Context, name string) (*library.Artist, error)
	List(ctx context.Context, offset, limit int) ([]library.Artist, int, error)
}

type ArtistWriter interface {
	Save(ctx context.Context, artist *library.Artist) error
}

type ArtistRepository interface {
	ArtistReader
	ArtistWriter
}

// Radio Repository for pgvector cosine queries
type RadioRepository interface {
	FindSimilarByVector(ctx context.Context, vector []float32, limit int) ([]library.Track, []float32, error)
}

// Download Job Repository
type DownloadJobRepository interface {
	Save(ctx context.Context, job *ingest.DownloadJob) error
	FindByID(ctx context.Context, id string) (*ingest.DownloadJob, error)
	Update(ctx context.Context, job *ingest.DownloadJob) error
	ListRecent(ctx context.Context, limit int) ([]ingest.DownloadJob, error)
	Delete(ctx context.Context, id string) error
	// FindPlaylistIDBySource returns the Harmoni playlist a previous job created for the
	// same remote playlist, so re-downloads update it instead of duplicating it (RF8.4).
	FindPlaylistIDBySource(ctx context.Context, provider, sourceID string) (string, error)
}

// DownloadJobItemRepository persists the per-video breakdown of a job (RF8.2).
type DownloadJobItemRepository interface {
	SaveAll(ctx context.Context, items []ingest.JobItem) error
	Update(ctx context.Context, item *ingest.JobItem) error
	ListByJob(ctx context.Context, jobID string) ([]ingest.JobItem, error)
	// ProgressByJobs aggregates counters for several jobs in one query, so listing the
	// queue stays a constant number of round trips.
	ProgressByJobs(ctx context.Context, jobIDs []string) (map[string]ingest.JobProgress, error)
}

// Remote Catalog Interfaces (RF7.5) - implemented by yt-dlp today, by the
// YouTube Data API tomorrow, without touching the use case.
type RemoteSearcher interface {
	Search(ctx context.Context, query discovery.Query) ([]discovery.RemoteItem, error)
}

type RemotePlaylistReader interface {
	GetPlaylist(ctx context.Context, playlistID string) (*discovery.RemotePlaylist, error)
}

type RemoteArtistReader interface {
	GetArtist(ctx context.Context, channelID string) (*discovery.RemoteArtist, error)
}

type RemoteTrackReader interface {
	GetTrack(ctx context.Context, videoID string) (*discovery.RemoteItem, error)
}

// Storage Interfaces
type AudioFileStorage interface {
	OpenAudio(filePath string) (io.ReadSeekCloser, int64, error)
	ExtractCover(filePath string) (io.ReadCloser, string, error)
	Stat(filePath string) (int64, time.Time, error)
	CleanPath(path string) (string, error)
}

type TagExtractor interface {
	ExtractMetadata(filePath string) (*ExtractedMetadata, error)
}

// DownloadedItem is one audio file produced by a download, in source order.
type DownloadedItem struct {
	// SourceID is the remote id recovered from the generated filename, which links the
	// file back to the catalog item and fills tracks.source_id (RF7.1).
	SourceID  string
	AudioPath string
	CoverPath string
}

// DownloadRequest describes one throttled yt-dlp invocation.
type DownloadRequest struct {
	// Ref is always a validated reference; the adapter rebuilds the URL from it.
	Ref ingest.SourceRef
	// SubDir is an optional folder under the media root, used to group a playlist.
	SubDir string
	// Position, when above zero, prefixes the filename so playlist order survives on disk.
	Position int
}

type DownloadResult struct {
	Items      []DownloadedItem
	IsPlaylist bool
	// FailedItems counts playlist entries that could not be downloaded (unavailable, private...).
	FailedItems int
	// SkippedByArchive marks a run where yt-dlp produced nothing because every entry was
	// already in the download archive. That is a success, not a failure (RF6.3).
	SkippedByArchive bool
}

type DownloaderClient interface {
	Download(ctx context.Context, req DownloadRequest) (*DownloadResult, error)
}

type EmbeddingService interface {
	GenerateEmbedding(ctx context.Context, text string) ([]float32, error)
}

// Playlist Repository Interface
type PlaylistRepository interface {
	Save(ctx context.Context, pl *playlist.Playlist) error
	FindByID(ctx context.Context, id playlist.PlaylistID) (*playlist.Playlist, error)
	FindByName(ctx context.Context, name string) (*playlist.Playlist, error)
	ListAll(ctx context.Context) ([]*playlist.Playlist, error)
	Delete(ctx context.Context, id playlist.PlaylistID) error
	AddTrack(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID, position int) error
	RemoveTrack(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID) error
	GetTracks(ctx context.Context, playlistID playlist.PlaylistID) ([]library.Track, error)
}
