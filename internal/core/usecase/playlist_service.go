package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/playlist"
	"harmoni/internal/core/ports"
)

type PlaylistService struct {
	playlistRepo ports.PlaylistRepository
	trackRepo    ports.TrackRepository
	radioUC      ports.RadioUseCase
}

func NewPlaylistService(
	playlistRepo ports.PlaylistRepository,
	trackRepo ports.TrackRepository,
	radioUC ports.RadioUseCase,
) *PlaylistService {
	return &PlaylistService{
		playlistRepo: playlistRepo,
		trackRepo:    trackRepo,
		radioUC:      radioUC,
	}
}

func (s *PlaylistService) CreatePlaylist(ctx context.Context, name, description string) (*playlist.Playlist, error) {
	pl, err := playlist.NewPlaylist(playlist.PlaylistID(newUUID()), name, description, false)
	if err != nil {
		return nil, fmt.Errorf("dados inválidos para playlist: %w", err)
	}

	if err := s.playlistRepo.Save(ctx, pl); err != nil {
		return nil, fmt.Errorf("falha ao salvar playlist: %w", err)
	}

	slog.InfoContext(ctx, "playlist criada com sucesso", "id", pl.ID, "nome", pl.Name)
	return pl, nil
}

func (s *PlaylistService) GetPlaylist(ctx context.Context, id playlist.PlaylistID) (*playlist.Playlist, error) {
	pl, err := s.playlistRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("falha ao buscar playlist: %w", err)
	}
	return pl, nil
}

func (s *PlaylistService) ListPlaylists(ctx context.Context) ([]*playlist.Playlist, error) {
	playlists, err := s.playlistRepo.ListAll(ctx)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar playlists: %w", err)
	}
	return playlists, nil
}

func (s *PlaylistService) DeletePlaylist(ctx context.Context, id playlist.PlaylistID) error {
	if err := s.playlistRepo.Delete(ctx, id); err != nil {
		return fmt.Errorf("falha ao deletar playlist: %w", err)
	}
	slog.InfoContext(ctx, "playlist removida com sucesso", "id", id)
	return nil
}

func (s *PlaylistService) AddTrackToPlaylist(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID) error {
	// Verify track exists
	_, err := s.trackRepo.FindByID(ctx, trackID)
	if err != nil {
		return fmt.Errorf("faixa não encontrada: %w", err)
	}

	// Add track (position 0 means append to the end)
	if err := s.playlistRepo.AddTrack(ctx, playlistID, trackID, 0); err != nil {
		return fmt.Errorf("falha ao adicionar faixa na playlist: %w", err)
	}

	slog.InfoContext(ctx, "faixa adicionada à playlist", "playlist_id", playlistID, "track_id", trackID)
	return nil
}

func (s *PlaylistService) RemoveTrackFromPlaylist(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID) error {
	if err := s.playlistRepo.RemoveTrack(ctx, playlistID, trackID); err != nil {
		return fmt.Errorf("falha ao remover faixa da playlist: %w", err)
	}
	slog.InfoContext(ctx, "faixa removida da playlist", "playlist_id", playlistID, "track_id", trackID)
	return nil
}

func (s *PlaylistService) CreateSmartPlaylist(ctx context.Context, seedTrackID library.TrackID, name string, limit int) (*playlist.Playlist, error) {
	if limit <= 0 {
		limit = 25
	}
	if limit > 100 {
		limit = 100
	}

	// 1. Fetch seed track
	seedTrack, err := s.trackRepo.FindByID(ctx, seedTrackID)
	if err != nil {
		return nil, fmt.Errorf("faixa semente não encontrada: %w", err)
	}

	playlistName := name
	if playlistName == "" {
		playlistName = fmt.Sprintf("Mix Inteligente: %s", seedTrack.Title)
	}
	description := fmt.Sprintf("Mix automático baseado em %s (%s)", seedTrack.Title, seedTrack.ArtistName)

	// 2. Generate recommendations via pgvector cosine similarity + anti-repetition
	var recommendations []library.Track
	if s.radioUC != nil {
		recs, err := s.radioUC.GenerateSongRadio(ctx, seedTrackID, limit, []library.ArtistID{seedTrack.ArtistID}, []library.TrackID{seedTrack.ID})
		if err == nil {
			recommendations = recs
		} else {
			slog.WarnContext(ctx, "falha ao gerar recomendações vetoriais, usando apenas faixa semente", "err", err)
		}
	}

	// 3. Create Smart Playlist entity
	pl, err := playlist.NewPlaylist(playlist.PlaylistID(newUUID()), playlistName, description, true)
	if err != nil {
		return nil, fmt.Errorf("falha ao instanciar playlist inteligente: %w", err)
	}

	if err := s.playlistRepo.Save(ctx, pl); err != nil {
		return nil, fmt.Errorf("falha ao salvar playlist inteligente: %w", err)
	}

	// 4. Add seed track first
	pos := 1
	_ = s.playlistRepo.AddTrack(ctx, pl.ID, seedTrack.ID, pos)

	// 5. Add recommendations
	for _, rec := range recommendations {
		if rec.ID == seedTrack.ID {
			continue
		}
		pos++
		_ = s.playlistRepo.AddTrack(ctx, pl.ID, rec.ID, pos)
	}

	// 6. Return populated playlist
	fullPl, err := s.playlistRepo.FindByID(ctx, pl.ID)
	if err != nil {
		return pl, nil
	}

	slog.InfoContext(ctx, "playlist inteligente criada com sucesso", "id", fullPl.ID, "nome", fullPl.Name, "faixas", fullPl.TrackCount)
	return fullPl, nil
}
