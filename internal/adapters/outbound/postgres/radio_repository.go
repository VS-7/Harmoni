package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	"harmoni/internal/core/domain/library"
)

type RadioRepository struct {
	pool *pgxpool.Pool
}

func NewRadioRepository(pool *pgxpool.Pool) *RadioRepository {
	return &RadioRepository{pool: pool}
}

func (r *RadioRepository) FindSimilarByVector(ctx context.Context, vector []float32, limit int) ([]library.Track, []float32, error) {
	if limit <= 0 {
		limit = 30
	}

	vec := pgvector.NewVector(vector)

	query := `
		SELECT 
			t.id, t.album_id, t.artist_id, COALESCE(a.name, ''), COALESCE(al.title, ''),
			t.title, t.track_number, t.duration, t.file_path, t.file_format,
			t.file_size, t.bitrate, t.genre, t.embedding, t.created_at,
			(t.embedding <=> $1) as distance
		FROM tracks t
		LEFT JOIN artists a ON t.artist_id = a.id
		LEFT JOIN albums al ON t.album_id = al.id
		WHERE t.embedding IS NOT NULL
		ORDER BY t.embedding <=> $1 ASC
		LIMIT $2
	`

	rows, err := r.pool.Query(ctx, query, vec, limit)
	if err != nil {
		return nil, nil, fmt.Errorf("falha ao consultar pgvector para rádio: %w", err)
	}
	defer rows.Close()

	var tracks []library.Track
	var similarities []float32

	for rows.Next() {
		var (
			idStr, artistIDStr   string
			albumIDStr           *string
			artistName, albTitle string
			title                string
			trackNumber          int
			durationSec          int
			filePath             string
			fileFormatStr        string
			fileSize             int64
			bitrate              int
			genre                string
			v                    *pgvector.Vector
			createdAt            time.Time
			distance             float64
		)

		err := rows.Scan(
			&idStr,
			&albumIDStr,
			&artistIDStr,
			&artistName,
			&albTitle,
			&title,
			&trackNumber,
			&durationSec,
			&filePath,
			&fileFormatStr,
			&fileSize,
			&bitrate,
			&genre,
			&v,
			&createdAt,
			&distance,
		)
		if err != nil {
			return nil, nil, fmt.Errorf("falha ao ler linha de similaridade vetorial: %w", err)
		}

		format, _ := library.ParseAudioFormat(fileFormatStr)
		dur := time.Duration(durationSec) * time.Second

		tr, err := library.NewTrack(library.TrackID(idStr), title, library.ArtistID(artistIDStr), dur, filePath, fileSize, format)
		if err != nil {
			continue
		}

		tr.ArtistName = artistName
		tr.AlbumTitle = albTitle
		tr.TrackNumber = trackNumber
		tr.Bitrate = bitrate
		tr.Genre = genre
		tr.CreatedAt = createdAt

		if albumIDStr != nil {
			aID := library.AlbumID(*albumIDStr)
			tr.AlbumID = &aID
		}
		if v != nil {
			tr.Embedding = v.Slice()
		}

		// In pgvector, cosine distance d = 1 - cosine_similarity
		// so similarity = 1 - distance
		sim := float32(1.0 - distance)

		tracks = append(tracks, *tr)
		similarities = append(similarities, sim)
	}

	return tracks, similarities, nil
}
