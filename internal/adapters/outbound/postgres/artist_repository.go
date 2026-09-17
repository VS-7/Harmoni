package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"harmoni/internal/core/domain/library"
)

type ArtistRepository struct {
	pool *pgxpool.Pool
}

func NewArtistRepository(pool *pgxpool.Pool) *ArtistRepository {
	return &ArtistRepository{pool: pool}
}

func (r *ArtistRepository) Save(ctx context.Context, artist *library.Artist) error {
	query := `
		INSERT INTO artists (id, name, created_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
	`
	_, err := r.pool.Exec(ctx, query, string(artist.ID), artist.Name, artist.CreatedAt)
	if err != nil {
		return fmt.Errorf("falha ao salvar artista: %w", err)
	}
	return nil
}

func (r *ArtistRepository) FindByID(ctx context.Context, id library.ArtistID) (*library.Artist, error) {
	query := `SELECT id, name, created_at FROM artists WHERE id = $1`
	var a library.Artist
	var idStr string
	err := r.pool.QueryRow(ctx, query, string(id)).Scan(&idStr, &a.Name, &a.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, library.ErrArtistNotFound
		}
		return nil, fmt.Errorf("falha ao buscar artista por id: %w", err)
	}
	a.ID = library.ArtistID(idStr)
	return &a, nil
}

func (r *ArtistRepository) FindByName(ctx context.Context, name string) (*library.Artist, error) {
	query := `SELECT id, name, created_at FROM artists WHERE LOWER(name) = LOWER($1)`
	var a library.Artist
	var idStr string
	err := r.pool.QueryRow(ctx, query, name).Scan(&idStr, &a.Name, &a.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, library.ErrArtistNotFound
		}
		return nil, fmt.Errorf("falha ao buscar artista por nome: %w", err)
	}
	a.ID = library.ArtistID(idStr)
	return &a, nil
}

func (r *ArtistRepository) List(ctx context.Context, offset, limit int) ([]library.Artist, int, error) {
	if limit <= 0 {
		limit = 50
	}

	var total int
	err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM artists").Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao contar artistas: %w", err)
	}

	query := `SELECT id, name, created_at FROM artists ORDER BY name ASC LIMIT $1 OFFSET $2`
	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao listar artistas: %w", err)
	}
	defer rows.Close()

	var artists []library.Artist
	for rows.Next() {
		var a library.Artist
		var idStr string
		if err := rows.Scan(&idStr, &a.Name, &a.CreatedAt); err != nil {
			return nil, 0, err
		}
		a.ID = library.ArtistID(idStr)
		artists = append(artists, a)
	}

	return artists, total, nil
}
