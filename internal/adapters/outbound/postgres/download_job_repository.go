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

const downloadJobColumns = `id, source_url, kind, source_provider, source_id, title,
	thumbnail_url, playlist_id, status, error_message, created_at, updated_at`

func (r *DownloadJobRepository) Save(ctx context.Context, job *ingest.DownloadJob) error {
	query := `
		INSERT INTO download_jobs (
			id, source_url, kind, source_provider, source_id, title,
			thumbnail_url, playlist_id, status, error_message, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (id) DO UPDATE SET
			kind = EXCLUDED.kind,
			title = EXCLUDED.title,
			thumbnail_url = EXCLUDED.thumbnail_url,
			playlist_id = EXCLUDED.playlist_id,
			status = EXCLUDED.status,
			error_message = EXCLUDED.error_message,
			updated_at = EXCLUDED.updated_at
	`
	_, err := r.pool.Exec(ctx, query,
		job.ID,
		job.SourceURL,
		string(job.Kind),
		nullableString(string(job.Provider)),
		nullableString(job.SourceID),
		nullableString(job.Title),
		nullableString(job.ThumbnailURL),
		job.PlaylistID,
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
	query := `SELECT ` + downloadJobColumns + ` FROM download_jobs WHERE id = $1`

	job, err := scanDownloadJob(r.pool.QueryRow(ctx, query, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ingest.ErrJobNotFound
		}
		return nil, fmt.Errorf("falha ao buscar job de download: %w", err)
	}
	return job, nil
}

func (r *DownloadJobRepository) ListRecent(ctx context.Context, limit int) ([]ingest.DownloadJob, error) {
	if limit <= 0 {
		limit = 20
	}

	query := `SELECT ` + downloadJobColumns + ` FROM download_jobs ORDER BY created_at DESC LIMIT $1`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar jobs recentes: %w", err)
	}
	defer rows.Close()

	var jobs []ingest.DownloadJob
	for rows.Next() {
		job, err := scanDownloadJob(rows)
		if err != nil {
			return nil, fmt.Errorf("falha ao ler linha de job: %w", err)
		}
		jobs = append(jobs, *job)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("falha ao percorrer jobs recentes: %w", err)
	}
	return jobs, nil
}

// Delete removes the job from the history. The items go with it (ON DELETE CASCADE),
// but the downloaded files stay on disk (RF8.3).
func (r *DownloadJobRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, "DELETE FROM download_jobs WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("falha ao remover job de download: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ingest.ErrJobNotFound
	}
	return nil
}

// FindPlaylistIDBySource returns the Harmoni playlist a previous job already filled for
// the same remote playlist, so a re-download updates it instead of creating another (RF8.4).
func (r *DownloadJobRepository) FindPlaylistIDBySource(ctx context.Context, provider, sourceID string) (string, error) {
	if provider == "" || sourceID == "" {
		return "", nil
	}

	query := `
		SELECT playlist_id FROM download_jobs
		WHERE source_provider = $1 AND source_id = $2 AND playlist_id IS NOT NULL
		ORDER BY updated_at DESC
		LIMIT 1
	`
	var playlistID *string
	err := r.pool.QueryRow(ctx, query, provider, sourceID).Scan(&playlistID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("falha ao buscar playlist da fonte remota: %w", err)
	}
	if playlistID == nil {
		return "", nil
	}
	return *playlistID, nil
}

// rowScanner covers both pgx.Row and pgx.Rows, so one scan function serves every query.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanDownloadJob(row rowScanner) (*ingest.DownloadJob, error) {
	var (
		job                             ingest.DownloadJob
		kind, status                    string
		provider, sourceID              *string
		title, thumbnailURL, playlistID *string
	)

	err := row.Scan(
		&job.ID,
		&job.SourceURL,
		&kind,
		&provider,
		&sourceID,
		&title,
		&thumbnailURL,
		&playlistID,
		&status,
		&job.ErrorMessage,
		&job.CreatedAt,
		&job.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	job.Kind = ingest.SourceKind(kind)
	job.Status = ingest.JobStatus(status)
	job.PlaylistID = playlistID
	if provider != nil {
		job.Provider = ingest.SourceProvider(*provider)
	}
	if sourceID != nil {
		job.SourceID = *sourceID
	}
	if title != nil {
		job.Title = *title
	}
	if thumbnailURL != nil {
		job.ThumbnailURL = *thumbnailURL
	}
	return &job, nil
}

// nullableString keeps empty strings out of the database, so the unique indexes on
// (source_provider, source_id) only see real values.
func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
