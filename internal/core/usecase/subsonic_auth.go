package usecase

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"strings"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

type SubsonicService struct {
	adminUser  string
	adminPass  string
	artistRepo ports.ArtistRepository
	albumRepo  ports.AlbumRepository
	trackRepo  ports.TrackRepository
	radioUC    ports.RadioUseCase
}

func NewSubsonicService(
	adminUser, adminPass string,
	artistRepo ports.ArtistRepository,
	albumRepo ports.AlbumRepository,
	trackRepo ports.TrackRepository,
	radioUC ports.RadioUseCase,
) *SubsonicService {
	if adminUser == "" {
		adminUser = "admin"
	}
	if adminPass == "" {
		adminPass = "admin"
	}
	return &SubsonicService{
		adminUser:  adminUser,
		adminPass:  adminPass,
		artistRepo: artistRepo,
		albumRepo:  albumRepo,
		trackRepo:  trackRepo,
		radioUC:    radioUC,
	}
}

// Authenticate verifies Subsonic token/salt MD5 or plaintext password.
func (s *SubsonicService) Authenticate(ctx context.Context, username, token, salt string) (bool, error) {
	if username != s.adminUser {
		return false, nil
	}

	// Token + salt auth: md5(password + salt)
	if token != "" && salt != "" {
		expectedHash := md5.Sum([]byte(s.adminPass + salt))
		expectedHex := hex.EncodeToString(expectedHash[:])
		if strings.EqualFold(token, expectedHex) {
			return true, nil
		}
		return false, nil
	}

	return false, nil
}

func (s *SubsonicService) GetSubsonicArtists(ctx context.Context) ([]library.Artist, error) {
	artists, _, err := s.artistRepo.List(ctx, 0, 500)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar artistas para Subsonic: %w", err)
	}
	return artists, nil
}

func (s *SubsonicService) GetSubsonicArtist(ctx context.Context, id library.ArtistID) (*library.Artist, []library.Album, error) {
	artist, err := s.artistRepo.FindByID(ctx, id)
	if err != nil {
		return nil, nil, fmt.Errorf("artista não encontrado: %w", err)
	}

	albums, err := s.albumRepo.ListByArtistID(ctx, id)
	if err != nil {
		return nil, nil, fmt.Errorf("falha ao listar álbuns do artista: %w", err)
	}

	return artist, albums, nil
}

func (s *SubsonicService) GetSubsonicAlbum(ctx context.Context, id library.AlbumID) (*library.Album, []library.Track, error) {
	album, err := s.albumRepo.FindByID(ctx, id)
	if err != nil {
		return nil, nil, fmt.Errorf("álbum não encontrado: %w", err)
	}

	tracks, err := s.trackRepo.ListByAlbumID(ctx, id)
	if err != nil {
		return nil, nil, fmt.Errorf("falha ao listar faixas do álbum: %w", err)
	}

	return album, tracks, nil
}

func (s *SubsonicService) GetSubsonicSong(ctx context.Context, id library.TrackID) (*library.Track, error) {
	track, err := s.trackRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("faixa não encontrada: %w", err)
	}
	return track, nil
}

func (s *SubsonicService) GetSimilarSongs(ctx context.Context, seedID library.TrackID, count int) ([]library.Track, error) {
	if s.radioUC == nil {
		return nil, nil
	}
	return s.radioUC.GenerateSongRadio(ctx, seedID, count, nil, nil)
}
