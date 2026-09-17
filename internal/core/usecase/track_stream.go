package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

type TrackService struct {
	trackReader ports.TrackReader
	storage     ports.AudioFileStorage
}

func NewTrackService(trackReader ports.TrackReader, storage ports.AudioFileStorage) *TrackService {
	return &TrackService{
		trackReader: trackReader,
		storage:     storage,
	}
}

func (s *TrackService) GetTrack(ctx context.Context, id library.TrackID) (*library.Track, error) {
	track, err := s.trackReader.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("falha ao buscar faixa %s: %w", id, err)
	}
	return track, nil
}

func (s *TrackService) ListTracks(ctx context.Context, offset, limit int, query string) ([]library.Track, int, error) {
	tracks, total, err := s.trackReader.List(ctx, offset, limit, query)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao listar faixas: %w", err)
	}
	return tracks, total, nil
}

func (s *TrackService) StreamTrack(ctx context.Context, id library.TrackID) (*ports.StreamResult, error) {
	track, err := s.trackReader.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("faixa não encontrada para streaming: %w", err)
	}

	reader, size, err := s.storage.OpenAudio(track.FilePath)
	if err != nil {
		slog.ErrorContext(ctx, "falha ao abrir áudio no disco", "track_id", id, "file_path", track.FilePath, "err", err)
		return nil, fmt.Errorf("falha ao abrir arquivo de áudio: %w", err)
	}

	_, modTime, _ := s.storage.Stat(track.FilePath)

	etag := fmt.Sprintf(`"%s-%d-%d"`, track.ID, size, modTime.Unix())

	return &ports.StreamResult{
		Content:      reader,
		FileSize:     size,
		FileFormat:   track.FileFormat,
		MIMEType:     track.FileFormat.MIMEType(),
		ETag:         etag,
		LastModified: modTime,
	}, nil
}

func (s *TrackService) GetCoverArt(ctx context.Context, id library.TrackID) (*ports.CoverResult, error) {
	track, err := s.trackReader.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("faixa não encontrada para obter capa: %w", err)
	}

	reader, mimeType, err := s.storage.ExtractCover(track.FilePath)
	if err != nil {
		return nil, fmt.Errorf("capa não encontrada para a faixa: %w", err)
	}

	_, modTime, _ := s.storage.Stat(track.FilePath)
	etag := fmt.Sprintf(`"cover-%s-%d"`, track.ID, modTime.Unix())

	return &ports.CoverResult{
		Content:      reader,
		MIMEType:     mimeType,
		ETag:         etag,
		LastModified: modTime,
	}, nil
}
