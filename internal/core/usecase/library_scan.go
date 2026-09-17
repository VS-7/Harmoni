package usecase

import (
	"context"
	"crypto/rand"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/ports"
)

type LibraryScanService struct {
	musicDir      string
	trackRepo     ports.TrackRepository
	albumRepo     ports.AlbumRepository
	artistRepo    ports.ArtistRepository
	tagExtractor  ports.TagExtractor
	storage       ports.AudioFileStorage
	embedder      ports.EmbeddingService
}

func NewLibraryScanService(
	musicDir string,
	trackRepo ports.TrackRepository,
	albumRepo ports.AlbumRepository,
	artistRepo ports.ArtistRepository,
	tagExtractor ports.TagExtractor,
	storage ports.AudioFileStorage,
	embedder ports.EmbeddingService,
) *LibraryScanService {
	return &LibraryScanService{
		musicDir:     filepath.Clean(musicDir),
		trackRepo:    trackRepo,
		albumRepo:    albumRepo,
		artistRepo:   artistRepo,
		tagExtractor: tagExtractor,
		storage:      storage,
		embedder:     embedder,
	}
}

func (s *LibraryScanService) Scan(ctx context.Context) error {
	slog.InfoContext(ctx, "iniciando varredura da biblioteca de músicas", "dir", s.musicDir)

	if _, err := os.Stat(s.musicDir); os.IsNotExist(err) {
		if err := os.MkdirAll(s.musicDir, 0755); err != nil {
			return fmt.Errorf("falha ao criar diretório de música %s: %w", s.musicDir, err)
		}
	}

	scannedCount := 0
	addedCount := 0

	supportedExts := map[string]bool{
		".mp3":  true,
		".flac": true,
		".m4a":  true,
		".opus": true,
		".ogg":  true,
		".wav":  true,
		".aac":  true,
	}

	err := filepath.WalkDir(s.musicDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			slog.WarnContext(ctx, "erro ao acessar arquivo na varredura", "path", path, "err", err)
			return nil
		}
		if d.IsDir() {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		ext := strings.ToLower(filepath.Ext(path))
		if !supportedExts[ext] {
			return nil
		}

		scannedCount++

		// Clean and verify path
		cleanPath, err := s.storage.CleanPath(path)
		if err != nil {
			slog.WarnContext(ctx, "caminho de arquivo rejeitado por segurança", "path", path, "err", err)
			return nil
		}

		// Check if track already exists
		existing, _ := s.trackRepo.FindByFilePath(ctx, cleanPath)
		if existing != nil {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		meta, err := s.tagExtractor.ExtractMetadata(cleanPath)
		if err != nil {
			slog.WarnContext(ctx, "falha ao extrair metadados, usando valores padrão", "path", cleanPath, "err", err)
			base := strings.TrimSuffix(filepath.Base(cleanPath), ext)
			meta = &ports.ExtractedMetadata{
				Title:    base,
				Artist:   "Unknown Artist",
				Album:    "Unknown Album",
				Duration: 180 * time.Second,
				Format:   library.AudioFormat(strings.TrimPrefix(ext, ".")),
			}
		}

		artistName := strings.TrimSpace(meta.Artist)
		if artistName == "" {
			artistName = "Unknown Artist"
		}

		// Find or create artist
		artist, err := s.artistRepo.FindByName(ctx, artistName)
		if err != nil || artist == nil {
			artistID := library.ArtistID(newUUID())
			artist, err = library.NewArtist(artistID, artistName)
			if err == nil {
				_ = s.artistRepo.Save(ctx, artist)
			}
		}

		// Find or create album
		albumTitle := strings.TrimSpace(meta.Album)
		if albumTitle == "" {
			albumTitle = "Unknown Album"
		}

		var albumID *library.AlbumID
		if artist != nil {
			album, err := s.albumRepo.FindByTitleAndArtist(ctx, albumTitle, artist.ID)
			if err != nil || album == nil {
				aID := library.AlbumID(newUUID())
				album, err = library.NewAlbum(aID, artist.ID, albumTitle, meta.Year, "")
				if err == nil {
					_ = s.albumRepo.Save(ctx, album)
					albumID = &album.ID
				}
			} else {
				albumID = &album.ID
			}
		}

		title := strings.TrimSpace(meta.Title)
		if title == "" {
			title = strings.TrimSuffix(filepath.Base(cleanPath), ext)
		}

		dur := meta.Duration
		if dur <= 0 {
			dur = 1 * time.Second
		}

		trackID := library.TrackID(newUUID())
		var aID library.ArtistID
		if artist != nil {
			aID = artist.ID
		}

		track, err := library.NewTrack(trackID, title, aID, dur, cleanPath, info.Size(), meta.Format)
		if err != nil {
			slog.WarnContext(ctx, "falha ao criar entidade de faixa", "path", cleanPath, "err", err)
			return nil
		}

		if albumID != nil {
			track.SetAlbum(*albumID, meta.TrackNumber)
		}
		track.SetMetadata(meta.Bitrate, meta.Genre)

		// Generate embedding
		embedText := fmt.Sprintf("%s %s %s %s", title, artistName, albumTitle, meta.Genre)
		if s.embedder != nil {
			emb, err := s.embedder.GenerateEmbedding(ctx, embedText)
			if err == nil && len(emb) == 384 {
				track.SetEmbedding(emb)
			}
		}

		if err := s.trackRepo.Save(ctx, track); err != nil {
			slog.ErrorContext(ctx, "falha ao salvar faixa no banco", "title", title, "err", err)
			return nil
		}

		addedCount++
		return nil
	})

	if err != nil {
		return fmt.Errorf("erro durante a varredura: %w", err)
	}

	slog.InfoContext(ctx, "varredura concluída com sucesso", "scanned_files", scannedCount, "new_tracks_added", addedCount)
	return nil
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
