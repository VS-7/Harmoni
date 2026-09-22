package postgres

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"harmoni/internal/core/domain/playlist"
)

// uuidPattern screens ids before they reach a UUID column: Postgres rejects a malformed
// UUID with a syntax error, which would surface as a 500 instead of "not found".
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func isUUID(id string) bool {
	return uuidPattern.MatchString(id)
}

type PlaylistFolderRepository struct {
	pool *pgxpool.Pool
}

func NewPlaylistFolderRepository(pool *pgxpool.Pool) *PlaylistFolderRepository {
	return &PlaylistFolderRepository{pool: pool}
}

func (r *PlaylistFolderRepository) SaveFolder(ctx context.Context, folder *playlist.Folder) error {
	query := `
		INSERT INTO playlist_folders (id, name, created_at, updated_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			updated_at = EXCLUDED.updated_at
	`
	_, err := r.pool.Exec(ctx, query, string(folder.ID), folder.Name, folder.CreatedAt, time.Now().UTC())
	if err != nil {
		return fmt.Errorf("falha ao salvar pasta: %w", err)
	}
	return nil
}

func (r *PlaylistFolderRepository) FindFolderByID(ctx context.Context, id playlist.FolderID) (*playlist.Folder, error) {
	if !isUUID(string(id)) {
		return nil, playlist.ErrFolderNotFound
	}

	query := `SELECT id, name, created_at, updated_at FROM playlist_folders WHERE id = $1`
	var f playlist.Folder
	var idStr string
	err := r.pool.QueryRow(ctx, query, string(id)).Scan(&idStr, &f.Name, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, playlist.ErrFolderNotFound
		}
		return nil, fmt.Errorf("falha ao buscar pasta por id: %w", err)
	}
	f.ID = playlist.FolderID(idStr)
	return &f, nil
}

func (r *PlaylistFolderRepository) ListFolders(ctx context.Context) ([]*playlist.Folder, error) {
	query := `SELECT id, name, created_at, updated_at FROM playlist_folders ORDER BY LOWER(name) ASC`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar pastas: %w", err)
	}
	defer rows.Close()

	var folders []*playlist.Folder
	for rows.Next() {
		var f playlist.Folder
		var idStr string
		if err := rows.Scan(&idStr, &f.Name, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, fmt.Errorf("falha ao escanear pasta: %w", err)
		}
		f.ID = playlist.FolderID(idStr)
		folders = append(folders, &f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("erro durante iteração de pastas: %w", err)
	}
	return folders, nil
}

// DeleteFolder relies on ON DELETE SET NULL to send the folder's playlists back to the root.
func (r *PlaylistFolderRepository) DeleteFolder(ctx context.Context, id playlist.FolderID) error {
	if !isUUID(string(id)) {
		return playlist.ErrFolderNotFound
	}

	res, err := r.pool.Exec(ctx, `DELETE FROM playlist_folders WHERE id = $1`, string(id))
	if err != nil {
		return fmt.Errorf("falha ao remover pasta: %w", err)
	}
	if res.RowsAffected() == 0 {
		return playlist.ErrFolderNotFound
	}
	return nil
}

func (r *PlaylistFolderRepository) AssignPlaylist(ctx context.Context, playlistID playlist.PlaylistID, folderID *playlist.FolderID) error {
	if !isUUID(string(playlistID)) {
		return playlist.ErrPlaylistNotFound
	}

	// A nil interface value becomes NULL, which puts the playlist back at the root.
	var folder any
	if folderID != nil {
		if !isUUID(string(*folderID)) {
			return playlist.ErrFolderNotFound
		}
		folder = string(*folderID)
	}

	// updated_at is left alone: moving a playlist is not activity for the "Recentes" order.
	res, err := r.pool.Exec(ctx, `UPDATE playlists SET folder_id = $2 WHERE id = $1`, string(playlistID), folder)
	if err != nil {
		return fmt.Errorf("falha ao mover playlist para a pasta: %w", err)
	}
	if res.RowsAffected() == 0 {
		return playlist.ErrPlaylistNotFound
	}
	return nil
}
