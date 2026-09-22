package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"harmoni/internal/core/domain/library"
)

type AlbumRepository struct {
	pool *pgxpool.Pool
}

func NewAlbumRepository(pool *pgxpool.Pool) *AlbumRepository {
	return &AlbumRepository{pool: pool}
}

func (r *AlbumRepository) Save(ctx context.Context, album *library.Album) error {
	query := `
		INSERT INTO albums (id, artist_id, title, year, cover_path, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE SET
			title = EXCLUDED.title,
			year = EXCLUDED.year,
			cover_path = EXCLUDED.cover_path
	`
	_, err := r.pool.Exec(ctx, query,
		string(album.ID),
		string(album.ArtistID),
		album.Title,
		album.Year,
		album.CoverPath,
		album.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("falha ao salvar álbum: %w", err)
	}
	return nil
}

func (r *AlbumRepository) Update(ctx context.Context, album *library.Album) error {
	return r.Save(ctx, album)
}

func (r *AlbumRepository) FindByID(ctx context.Context, id library.AlbumID) (*library.Album, error) {
	query := `
		SELECT al.id, al.artist_id, COALESCE(ar.name, ''), al.title, al.year, al.cover_path, al.created_at
		FROM albums al
		LEFT JOIN artists ar ON ar.id = al.artist_id
		WHERE al.id = $1
	`
	var a library.Album
	var idStr, artistIDStr string
	err := r.pool.QueryRow(ctx, query, string(id)).Scan(
		&idStr,
		&artistIDStr,
		&a.ArtistName,
		&a.Title,
		&a.Year,
		&a.CoverPath,
		&a.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, library.ErrAlbumNotFound
		}
		return nil, fmt.Errorf("falha ao buscar álbum por id: %w", err)
	}
	a.ID = library.AlbumID(idStr)
	a.ArtistID = library.ArtistID(artistIDStr)
	return &a, nil
}

func (r *AlbumRepository) FindByTitleAndArtist(ctx context.Context, title string, artistID library.ArtistID) (*library.Album, error) {
	query := `SELECT id, artist_id, title, year, cover_path, created_at FROM albums WHERE LOWER(title) = LOWER($1) AND artist_id = $2`
	var a library.Album
	var idStr, artistIDStr string
	err := r.pool.QueryRow(ctx, query, title, string(artistID)).Scan(
		&idStr,
		&artistIDStr,
		&a.Title,
		&a.Year,
		&a.CoverPath,
		&a.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, library.ErrAlbumNotFound
		}
		return nil, fmt.Errorf("falha ao buscar álbum por título e artista: %w", err)
	}
	a.ID = library.AlbumID(idStr)
	a.ArtistID = library.ArtistID(artistIDStr)
	return &a, nil
}

func (r *AlbumRepository) List(ctx context.Context, offset, limit int) ([]library.Album, int, error) {
	if limit <= 0 {
		limit = 50
	}

	var total int
	err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM albums").Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao contar álbuns: %w", err)
	}

	query := `
		SELECT al.id, al.artist_id, COALESCE(ar.name, ''), al.title, al.year, al.cover_path, al.created_at
		FROM albums al
		LEFT JOIN artists ar ON ar.id = al.artist_id
		ORDER BY al.title ASC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao listar álbuns: %w", err)
	}
	defer rows.Close()

	var albums []library.Album
	for rows.Next() {
		var a library.Album
		var idStr, artistIDStr string
		if err := rows.Scan(&idStr, &artistIDStr, &a.ArtistName, &a.Title, &a.Year, &a.CoverPath, &a.CreatedAt); err != nil {
			return nil, 0, err
		}
		a.ID = library.AlbumID(idStr)
		a.ArtistID = library.ArtistID(artistIDStr)
		albums = append(albums, a)
	}

	return albums, total, nil
}

func (r *AlbumRepository) ListByArtistID(ctx context.Context, artistID library.ArtistID) ([]library.Album, error) {
	query := `
		SELECT al.id, al.artist_id, COALESCE(ar.name, ''), al.title, al.year, al.cover_path, al.created_at
		FROM albums al
		LEFT JOIN artists ar ON ar.id = al.artist_id
		WHERE al.artist_id = $1
		ORDER BY al.year DESC, al.title ASC
	`
	rows, err := r.pool.Query(ctx, query, string(artistID))
	if err != nil {
		return nil, fmt.Errorf("falha ao listar álbuns do artista: %w", err)
	}
	defer rows.Close()

	var albums []library.Album
	for rows.Next() {
		var a library.Album
		var idStr, artistIDStr string
		if err := rows.Scan(&idStr, &artistIDStr, &a.ArtistName, &a.Title, &a.Year, &a.CoverPath, &a.CreatedAt); err != nil {
			return nil, err
		}
		a.ID = library.AlbumID(idStr)
		a.ArtistID = library.ArtistID(artistIDStr)
		albums = append(albums, a)
	}

	return albums, nil
}
