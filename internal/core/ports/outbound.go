package ports

import (
	"context"
	"io"
	"time"

	"harmoni/internal/core/domain/ingest"
	"harmoni/internal/core/domain/library"
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

type DownloaderClient interface {
	Download(ctx context.Context, url string, outputDir string) (downloadedAudioPath string, coverArtPath string, err error)
}

type EmbeddingService interface {
	GenerateEmbedding(ctx context.Context, text string) ([]float32, error)
}
