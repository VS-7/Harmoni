package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"harmoni/internal/core/domain/ingest"
)

type DownloadJobRepository struct {
	pool *pgxpool.Pool
}

func NewDownloadJobRepository(pool *pgxpool.Pool) *DownloadJobRepository {
	return &DownloadJobRepository{pool: pool}
}

func (r *DownloadJobRepository) Save(ctx context.Context, job *ingest.DownloadJob) error {
	query := `
		INSERT INTO download_jobs (id, source_url, status, error_message, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE SET
			status = EXCLUDED.status,
			error_message = EXCLUDED.error_message,
			updated_at = EXCLUDED.updated_at
	`
	_, err := r.pool.Exec(ctx, query,
		job.ID,
		job.SourceURL,
		string(job.Status),
		job.ErrorMessage,
		job.CreatedAt,
		job.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("falha ao salvar job de download: %w", err)
	}
	return nil
}

func (r *DownloadJobRepository) Update(ctx context.Context, job *ingest.DownloadJob) error {
	return r.Save(ctx, job)
}

func (r *DownloadJobRepository) FindByID(ctx context.Context, id string) (*ingest.DownloadJob, error) {
	query := `SELECT id, source_url, status, error_message, created_at, updated_at FROM download_jobs WHERE id = $1`
	var j ingest.DownloadJob
	var statusStr string
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&j.ID,
		&j.SourceURL,
		&statusStr,
		&j.ErrorMessage,
		&j.CreatedAt,
		&j.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ingest.ErrJobNotFound
		}
		return nil, fmt.Errorf("falha ao buscar job de download: %w", err)
	}
	j.Status = ingest.JobStatus(statusStr)
	return &j, nil
}

func (r *DownloadJobRepository) ListRecent(ctx context.Context, limit int) ([]ingest.DownloadJob, error) {
	if limit <= 0 {
		limit = 20
	}

	query := `
		SELECT id, source_url, status, error_message, created_at, updated_at 
		FROM download_jobs 
		ORDER BY created_at DESC 
		LIMIT $1
	`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar jobs recentes: %w", err)
	}
	defer rows.Close()

	var jobs []ingest.DownloadJob
	for rows.Next() {
		var j ingest.DownloadJob
		var statusStr string
		err := rows.Scan(
			&j.ID,
			&j.SourceURL,
			&statusStr,
			&j.ErrorMessage,
			&j.CreatedAt,
			&j.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		j.Status = ingest.JobStatus(statusStr)
		jobs = append(jobs, j)
	}

	return jobs, nil
}
