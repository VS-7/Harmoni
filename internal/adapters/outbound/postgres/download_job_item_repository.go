package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"harmoni/internal/core/domain/ingest"
)

type DownloadJobItemRepository struct {
	pool *pgxpool.Pool
}

func NewDownloadJobItemRepository(pool *pgxpool.Pool) *DownloadJobItemRepository {
	return &DownloadJobItemRepository{pool: pool}
}

// SaveAll writes the whole expansion of a job in a single batch round trip.
func (r *DownloadJobItemRepository) SaveAll(ctx context.Context, items []ingest.JobItem) error {
	if len(items) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	query := `
		INSERT INTO download_job_items (
			id, job_id, position, source_id, title, status, track_id, error_message, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (job_id, source_id) DO UPDATE SET
			position = EXCLUDED.position,
			title = EXCLUDED.title,
			status = EXCLUDED.status,
			track_id = EXCLUDED.track_id,
			error_message = EXCLUDED.error_message,
			updated_at = EXCLUDED.updated_at
	`
	for _, item := range items {
		batch.Queue(query,
			item.ID,
			item.JobID,
			item.Position,
			item.SourceID,
			nullableString(item.Title),
			string(item.Status),
			item.TrackID,
			item.ErrorMessage,
			item.UpdatedAt,
		)
	}

	results := r.pool.SendBatch(ctx, batch)
	defer results.Close()

	for range items {
		if _, err := results.Exec(); err != nil {
			return fmt.Errorf("falha ao salvar itens do job de download: %w", err)
		}
	}
	return nil
}

func (r *DownloadJobItemRepository) Update(ctx context.Context, item *ingest.JobItem) error {
	query := `
		UPDATE download_job_items
		SET position = $2, title = $3, status = $4, track_id = $5, error_message = $6, updated_at = $7
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query,
		item.ID,
		item.Position,
		nullableString(item.Title),
		string(item.Status),
		item.TrackID,
		item.ErrorMessage,
		item.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("falha ao atualizar item do job de download: %w", err)
	}
	return nil
}

func (r *DownloadJobItemRepository) ListByJob(ctx context.Context, jobID string) ([]ingest.JobItem, error) {
	query := `
		SELECT id, job_id, position, source_id, title, status, track_id, error_message, updated_at
		FROM download_job_items
		WHERE job_id = $1
		ORDER BY position ASC
	`
	rows, err := r.pool.Query(ctx, query, jobID)
	if err != nil {
		return nil, fmt.Errorf("falha ao listar itens do job: %w", err)
	}
	defer rows.Close()

	var items []ingest.JobItem
	for rows.Next() {
		var (
			item         ingest.JobItem
			status       string
			title        *string
			trackID      *string
			errorMessage *string
		)
		if err := rows.Scan(
			&item.ID,
			&item.JobID,
			&item.Position,
			&item.SourceID,
			&title,
			&status,
			&trackID,
			&errorMessage,
			&item.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("falha ao ler item do job: %w", err)
		}

		item.Status = ingest.ItemStatus(status)
		item.TrackID = trackID
		item.ErrorMessage = errorMessage
		if title != nil {
			item.Title = *title
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("falha ao percorrer itens do job: %w", err)
	}
	return items, nil
}

// ProgressByJobs aggregates the counters of several jobs in one query, so listing the
// queue costs a constant number of round trips no matter how long it is (RF8.2).
func (r *DownloadJobItemRepository) ProgressByJobs(ctx context.Context, jobIDs []string) (map[string]ingest.JobProgress, error) {
	progress := make(map[string]ingest.JobProgress, len(jobIDs))
	if len(jobIDs) == 0 {
		return progress, nil
	}

	query := `
		SELECT
			job_id,
			COUNT(*),
			COUNT(*) FILTER (WHERE status IN ('completed', 'skipped')),
			COUNT(*) FILTER (WHERE status = 'failed')
		FROM download_job_items
		WHERE job_id = ANY($1)
		GROUP BY job_id
	`
	rows, err := r.pool.Query(ctx, query, jobIDs)
	if err != nil {
		return nil, fmt.Errorf("falha ao agregar progresso dos jobs: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			jobID               string
			total, done, failed int
		)
		if err := rows.Scan(&jobID, &total, &done, &failed); err != nil {
			return nil, fmt.Errorf("falha ao ler progresso do job: %w", err)
		}
		progress[jobID] = ingest.JobProgress{Total: total, Done: done, Failed: failed}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("falha ao percorrer progresso dos jobs: %w", err)
	}
	return progress, nil
}
