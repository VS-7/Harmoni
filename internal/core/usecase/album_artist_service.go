package usecase

import (
	"context"
	"fmt"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

type AlbumService struct {
	albumRepo   ports.AlbumRepository
	trackReader ports.TrackReader
	storage     ports.AudioFileStorage
}

func NewAlbumService(albumRepo ports.AlbumRepository, trackReader ports.TrackReader, storage ports.AudioFileStorage) *AlbumService {
	return &AlbumService{
		albumRepo:   albumRepo,
		trackReader: trackReader,
		storage:     storage,
	}
}

func (s *AlbumService) GetAlbum(ctx context.Context, id library.AlbumID) (*library.Album, []library.Track, error) {
	album, err := s.albumRepo.FindByID(ctx, id)
	if err != nil {
		return nil, nil, fmt.Errorf("falha ao buscar álbum %s: %w", id, err)
	}

	tracks, err := s.trackReader.ListByAlbumID(ctx, id)
	if err != nil {
		return nil, nil, fmt.Errorf("falha ao buscar faixas do álbum %s: %w", id, err)
	}

	return album, tracks, nil
}

func (s *AlbumService) ListAlbums(ctx context.Context, offset, limit int) ([]library.Album, int, error) {
	albums, total, err := s.albumRepo.List(ctx, offset, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao listar álbuns: %w", err)
	}
	return albums, total, nil
}

func (s *AlbumService) GetAlbumCover(ctx context.Context, id library.AlbumID) (*ports.CoverResult, error) {
	album, err := s.albumRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("álbum não encontrado: %w", err)
	}

	if album.CoverPath != "" {
		reader, mimeType, err := s.storage.ExtractCover(album.CoverPath)
		if err == nil {
			_, modTime, _ := s.storage.Stat(album.CoverPath)
			etag := fmt.Sprintf(`"album-cover-%s-%d"`, album.ID, modTime.Unix())
			return &ports.CoverResult{
				Content:      reader,
				MIMEType:     mimeType,
				ETag:         etag,
				LastModified: modTime,
			}, nil
		}
	}

	// Fallback to first track of the album
	tracks, err := s.trackReader.ListByAlbumID(ctx, id)
	if err == nil && len(tracks) > 0 {
		reader, mimeType, err := s.storage.ExtractCover(tracks[0].FilePath)
		if err == nil {
			_, modTime, _ := s.storage.Stat(tracks[0].FilePath)
			etag := fmt.Sprintf(`"album-track-cover-%s-%d"`, album.ID, modTime.Unix())
			return &ports.CoverResult{
				Content:      reader,
				MIMEType:     mimeType,
				ETag:         etag,
				LastModified: modTime,
			}, nil
		}
	}

	return nil, fmt.Errorf("nenhuma capa encontrada para o álbum %s", id)
}

// maxArtistCoverTracks bounds how many audio files an artist cover lookup may open
// when none of the artist's albums has a cover file.
const maxArtistCoverTracks = 5

type ArtistService struct {
	artistRepo  ports.ArtistRepository
	albumRepo   ports.AlbumRepository
	trackReader ports.TrackReader
	storage     ports.AudioFileStorage
}

func NewArtistService(
	artistRepo ports.ArtistRepository,
	albumRepo ports.AlbumRepository,
	trackReader ports.TrackReader,
	storage ports.AudioFileStorage,
) *ArtistService {
	return &ArtistService{
		artistRepo:  artistRepo,
		albumRepo:   albumRepo,
		trackReader: trackReader,
		storage:     storage,
	}
}

func (s *ArtistService) ListArtistTracks(ctx context.Context, id library.ArtistID) ([]library.Track, error) {
	tracks, err := s.trackReader.ListByArtistID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar faixas do artista %s: %w", id, err)
	}
	return tracks, nil
}

func (s *ArtistService) GetArtistCover(ctx context.Context, id library.ArtistID) (*ports.CoverResult, error) {
	albums, err := s.albumRepo.ListByArtistID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar álbuns do artista %s: %w", id, err)
	}
	for _, album := range albums {
		if album.CoverPath == "" {
			continue
		}
		if cover := s.openCover(album.CoverPath, id); cover != nil {
			return cover, nil
		}
	}

	// No album art on disk: fall back to the picture embedded in the artist's tracks.
	tracks, err := s.trackReader.ListByArtistID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar faixas do artista %s: %w", id, err)
	}
	for i, track := range tracks {
		if i >= maxArtistCoverTracks {
			break
		}
		if cover := s.openCover(track.FilePath, id); cover != nil {
			return cover, nil
		}
	}

	return nil, fmt.Errorf("nenhuma capa encontrada para o artista %s", id)
}

// openCover returns nil when the file has no usable picture, so the caller can try the next one.
func (s *ArtistService) openCover(path string, id library.ArtistID) *ports.CoverResult {
	reader, mimeType, err := s.storage.ExtractCover(path)
	if err != nil {
		return nil
	}
	_, modTime, _ := s.storage.Stat(path)
	return &ports.CoverResult{
		Content:      reader,
		MIMEType:     mimeType,
		ETag:         fmt.Sprintf(`"artist-cover-%s-%d"`, id, modTime.Unix()),
		LastModified: modTime,
	}
}

func (s *ArtistService) GetArtist(ctx context.Context, id library.ArtistID) (*library.Artist, []library.Album, error) {
	artist, err := s.artistRepo.FindByID(ctx, id)
	if err != nil {
		return nil, nil, fmt.Errorf("falha ao buscar artista %s: %w", id, err)
	}

	albums, err := s.albumRepo.ListByArtistID(ctx, id)
	if err != nil {
		return nil, nil, fmt.Errorf("falha ao listar álbuns do artista %s: %w", id, err)
	}

	return artist, albums, nil
}

func (s *ArtistService) ListArtists(ctx context.Context, offset, limit int) ([]library.Artist, int, error) {
	artists, total, err := s.artistRepo.List(ctx, offset, limit)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao listar artistas: %w", err)
	}
	return artists, total, nil
}
