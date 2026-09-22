package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"harmoni/internal/core/domain/library"
	"harmoni/internal/core/domain/playlist"
)

type PlaylistRepository struct {
	pool *pgxpool.Pool
}

func NewPlaylistRepository(pool *pgxpool.Pool) *PlaylistRepository {
	return &PlaylistRepository{pool: pool}
}

func (r *PlaylistRepository) Save(ctx context.Context, pl *playlist.Playlist) error {
	query := `
		INSERT INTO playlists (id, name, description, cover_path, is_smart, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			cover_path = EXCLUDED.cover_path,
			is_smart = EXCLUDED.is_smart,
			updated_at = EXCLUDED.updated_at
	`
	_, err := r.pool.Exec(ctx, query,
		string(pl.ID),
		pl.Name,
		pl.Description,
		pl.CoverPath,
		pl.IsSmart,
		pl.CreatedAt,
		time.Now().UTC(),
	)
	if err != nil {
		return fmt.Errorf("falha ao salvar playlist: %w", err)
	}
	return nil
}

func (r *PlaylistRepository) FindByID(ctx context.Context, id playlist.PlaylistID) (*playlist.Playlist, error) {
	if !isUUID(string(id)) {
		return nil, playlist.ErrPlaylistNotFound
	}

	query := `
		SELECT id, name, COALESCE(description, ''), COALESCE(cover_path, ''), is_smart, folder_id, created_at, updated_at
		FROM playlists
		WHERE id = $1
	`
	var pl playlist.Playlist
	var idStr string
	var folderID *string
	err := r.pool.QueryRow(ctx, query, string(id)).Scan(
		&idStr,
		&pl.Name,
		&pl.Description,
		&pl.CoverPath,
		&pl.IsSmart,
		&folderID,
		&pl.CreatedAt,
		&pl.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, playlist.ErrPlaylistNotFound
		}
		return nil, fmt.Errorf("falha ao buscar playlist por id: %w", err)
	}
	pl.ID = playlist.PlaylistID(idStr)
	pl.FolderID = toFolderID(folderID)

	// Fetch tracks ordered by position
	tracks, err := r.GetTracks(ctx, pl.ID)
	if err != nil {
		return nil, err
	}
	pl.Tracks = tracks
	pl.TrackCount = len(tracks)
	pl.CoverTrackIDs = playlist.PickCoverTracks(tracks)

	totalSec := 0
	for _, t := range tracks {
		totalSec += int(t.Duration.Seconds())
	}
	pl.Duration = totalSec

	return &pl, nil
}

func (r *PlaylistRepository) FindByName(ctx context.Context, name string) (*playlist.Playlist, error) {
	query := `
		SELECT id, name, COALESCE(description, ''), COALESCE(cover_path, ''), is_smart, folder_id, created_at, updated_at
		FROM playlists
		WHERE LOWER(name) = LOWER($1)
		LIMIT 1
	`
	var pl playlist.Playlist
	var idStr string
	var folderID *string
	err := r.pool.QueryRow(ctx, query, name).Scan(
		&idStr,
		&pl.Name,
		&pl.Description,
		&pl.CoverPath,
		&pl.IsSmart,
		&folderID,
		&pl.CreatedAt,
		&pl.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, playlist.ErrPlaylistNotFound
		}
		return nil, fmt.Errorf("falha ao buscar playlist por nome: %w", err)
	}
	pl.ID = playlist.PlaylistID(idStr)
	pl.FolderID = toFolderID(folderID)

	tracks, err := r.GetTracks(ctx, pl.ID)
	if err == nil {
		pl.Tracks = tracks
		pl.TrackCount = len(tracks)
		pl.CoverTrackIDs = playlist.PickCoverTracks(tracks)
		totalSec := 0
		for _, t := range tracks {
			totalSec += int(t.Duration.Seconds())
		}
		pl.Duration = totalSec
	}

	return &pl, nil
}

func (r *PlaylistRepository) ListAll(ctx context.Context) ([]*playlist.Playlist, error) {
	query := `
		SELECT 
			p.id, 
			p.name, 
			COALESCE(p.description, ''), 
			COALESCE(p.cover_path, ''), 
			p.is_smart, 
			p.folder_id,
			p.created_at, 
			p.updated_at,
			COUNT(pt.track_id) as track_count,
			COALESCE(SUM(t.duration), 0) as total_duration,
			-- Same rule as playlist.PickCoverTracks: first track of each of the first 4 albums.
			ARRAY(
				SELECT c.track_id::text FROM (
					SELECT DISTINCT ON (COALESCE(ct.album_id::text, ct.id::text)) cpt.track_id, cpt.position
					FROM playlist_tracks cpt
					JOIN tracks ct ON ct.id = cpt.track_id
					WHERE cpt.playlist_id = p.id
					ORDER BY COALESCE(ct.album_id::text, ct.id::text), cpt.position
				) c
				ORDER BY c.position
				LIMIT 4
			) as cover_track_ids
		FROM playlists p
		LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
		LEFT JOIN tracks t ON pt.track_id = t.id
		GROUP BY p.id
		ORDER BY p.updated_at DESC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar playlists: %w", err)
	}
	defer rows.Close()

	var playlists []*playlist.Playlist
	for rows.Next() {
		var pl playlist.Playlist
		var idStr string
		var folderID *string
		var count int
		var dur int
		var coverIDs []string
		if err := rows.Scan(
			&idStr,
			&pl.Name,
			&pl.Description,
			&pl.CoverPath,
			&pl.IsSmart,
			&folderID,
			&pl.CreatedAt,
			&pl.UpdatedAt,
			&count,
			&dur,
			&coverIDs,
		); err != nil {
			return nil, fmt.Errorf("falha ao escanear playlist: %w", err)
		}
		pl.ID = playlist.PlaylistID(idStr)
		pl.FolderID = toFolderID(folderID)
		pl.TrackCount = count
		pl.Duration = dur
		pl.Tracks = make([]library.Track, 0)
		pl.CoverTrackIDs = make([]library.TrackID, len(coverIDs))
		for i, id := range coverIDs {
			pl.CoverTrackIDs[i] = library.TrackID(id)
		}
		playlists = append(playlists, &pl)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("erro durante iteração de playlists: %w", err)
	}

	return playlists, nil
}

func (r *PlaylistRepository) Delete(ctx context.Context, id playlist.PlaylistID) error {
	query := `DELETE FROM playlists WHERE id = $1`
	res, err := r.pool.Exec(ctx, query, string(id))
	if err != nil {
		return fmt.Errorf("falha ao deletar playlist: %w", err)
	}
	if res.RowsAffected() == 0 {
		return playlist.ErrPlaylistNotFound
	}
	return nil
}

func (r *PlaylistRepository) AddTrack(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID, position int) error {
	if position <= 0 {
		// Calculate next position
		var maxPos sql.NullInt32
		err := r.pool.QueryRow(ctx, "SELECT MAX(position) FROM playlist_tracks WHERE playlist_id = $1", string(playlistID)).Scan(&maxPos)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("falha ao calcular próxima posição: %w", err)
		}
		if maxPos.Valid {
			position = int(maxPos.Int32) + 1
		} else {
			position = 1
		}
	}

	query := `
		INSERT INTO playlist_tracks (playlist_id, track_id, position)
		VALUES ($1, $2, $3)
		ON CONFLICT (playlist_id, track_id) DO UPDATE SET position = EXCLUDED.position
	`
	_, err := r.pool.Exec(ctx, query, string(playlistID), string(trackID), position)
	if err != nil {
		return fmt.Errorf("falha ao adicionar faixa na playlist: %w", err)
	}

	// Update playlist updated_at
	_, _ = r.pool.Exec(ctx, "UPDATE playlists SET updated_at = NOW() WHERE id = $1", string(playlistID))
	return nil
}

func (r *PlaylistRepository) RemoveTrack(ctx context.Context, playlistID playlist.PlaylistID, trackID library.TrackID) error {
	query := `DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2`
	res, err := r.pool.Exec(ctx, query, string(playlistID), string(trackID))
	if err != nil {
		return fmt.Errorf("falha ao remover faixa da playlist: %w", err)
	}
	if res.RowsAffected() == 0 {
		return playlist.ErrTrackNotInPlaylist
	}

	// Update playlist updated_at
	_, _ = r.pool.Exec(ctx, "UPDATE playlists SET updated_at = NOW() WHERE id = $1", string(playlistID))
	return nil
}

func (r *PlaylistRepository) GetTracks(ctx context.Context, playlistID playlist.PlaylistID) ([]library.Track, error) {
	query := `
		SELECT 
			t.id, 
			t.album_id, 
			t.artist_id, 
			ar.name as artist_name, 
			al.title as album_title, 
			t.title, 
			t.track_number, 
			t.duration, 
			t.file_path, 
			t.file_format, 
			t.file_size, 
			t.bitrate, 
			t.genre, 
			t.created_at
		FROM playlist_tracks pt
		JOIN tracks t ON pt.track_id = t.id
		JOIN artists ar ON t.artist_id = ar.id
		LEFT JOIN albums al ON t.album_id = al.id
		WHERE pt.playlist_id = $1
		ORDER BY pt.position ASC
	`
	rows, err := r.pool.Query(ctx, query, string(playlistID))
	if err != nil {
		return nil, fmt.Errorf("falha ao buscar faixas da playlist: %w", err)
	}
	defer rows.Close()

	var tracks []library.Track
	for rows.Next() {
		var t library.Track
		var idStr, artistIDStr string
		var albumIDStr sql.NullString
		var albumTitle sql.NullString
		var genre sql.NullString
		var trackNumber sql.NullInt32
		var bitrate sql.NullInt32
		var durSec int

		if err := rows.Scan(
			&idStr,
			&albumIDStr,
			&artistIDStr,
			&t.ArtistName,
			&albumTitle,
			&t.Title,
			&trackNumber,
			&durSec,
			&t.FilePath,
			&t.FileFormat,
			&t.FileSize,
			&bitrate,
			&genre,
			&t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("falha ao escanear faixa da playlist: %w", err)
		}

		t.ID = library.TrackID(idStr)
		t.ArtistID = library.ArtistID(artistIDStr)
		t.Duration = time.Duration(durSec) * time.Second

		if albumIDStr.Valid {
			aid := library.AlbumID(albumIDStr.String)
			t.AlbumID = &aid
		}
		if albumTitle.Valid {
			t.AlbumTitle = albumTitle.String
		}
		if trackNumber.Valid {
			t.TrackNumber = int(trackNumber.Int32)
		}
		if bitrate.Valid {
			t.Bitrate = int(bitrate.Int32)
		}
		if genre.Valid {
			t.Genre = genre.String
		}

		tracks = append(tracks, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("erro durante iteração de faixas da playlist: %w", err)
	}

	return tracks, nil
}

func toFolderID(raw *string) *playlist.FolderID {
	if raw == nil {
		return nil
	}
	id := playlist.FolderID(*raw)
	return &id
}
