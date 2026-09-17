package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/radio"
	"harmoni/internal/core/ports"
)

type RadioService struct {
	trackReader ports.TrackReader
	radioRepo   ports.RadioRepository
	embedder    ports.EmbeddingService
}

func NewRadioService(trackReader ports.TrackReader, radioRepo ports.RadioRepository, embedder ports.EmbeddingService) *RadioService {
	return &RadioService{
		trackReader: trackReader,
		radioRepo:   radioRepo,
		embedder:    embedder,
	}
}

func (s *RadioService) GenerateSongRadio(
	ctx context.Context,
	seedID library.TrackID,
	limit int,
	recentArtistIDs []library.ArtistID,
	recentTrackIDs []library.TrackID,
) ([]library.Track, error) {
	if limit <= 0 {
		limit = 20
	}

	seedTrack, err := s.trackReader.FindByID(ctx, seedID)
	if err != nil {
		return nil, fmt.Errorf("faixa semente %s não encontrada: %w", seedID, err)
	}

	embedding := seedTrack.Embedding
	if len(embedding) == 0 && s.embedder != nil {
		text := fmt.Sprintf("%s %s %s %s", seedTrack.Title, seedTrack.ArtistName, seedTrack.AlbumTitle, seedTrack.Genre)
		emb, err := s.embedder.GenerateEmbedding(ctx, text)
		if err == nil && len(emb) == radio.VectorDimensions {
			embedding = emb
		}
	}

	// If no embedding available, fallback to listing tracks by genre or general list
	if len(embedding) == 0 {
		slog.WarnContext(ctx, "faixa semente não possui embedding vetorial, usando fallback", "seed_id", seedID)
		tracks, _, err := s.trackReader.List(ctx, 0, limit, seedTrack.Genre)
		if err != nil {
			return nil, fmt.Errorf("falha no fallback do rádio: %w", err)
		}
		return tracks, nil
	}

	// Query pgvector for the top 3x candidates
	candidateLimit := limit * 3
	candidates, similarities, err := s.radioRepo.FindSimilarByVector(ctx, embedding, candidateLimit)
	if err != nil {
		return nil, fmt.Errorf("falha ao buscar faixas similares por vetor: %w", err)
	}

	// Always exclude the seed track itself from recommendations
	tracksToExclude := make([]library.TrackID, 0, len(recentTrackIDs)+1)
	tracksToExclude = append(tracksToExclude, seedID)
	tracksToExclude = append(tracksToExclude, recentTrackIDs...)

	ranked := radio.RankAndShuffle(
		candidates,
		similarities,
		seedTrack.ArtistID,
		recentArtistIDs,
		tracksToExclude,
		limit,
		radio.DefaultRadioPolicy(),
	)

	return ranked, nil
}
