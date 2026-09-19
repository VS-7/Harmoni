package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	"harmoni/internal/core/domain/library"
)

type TrackRepository struct {
	pool *pgxpool.Pool
}

func NewTrackRepository(pool *pgxpool.Pool) *TrackRepository {
	return &TrackRepository{pool: pool}
}

func (r *TrackRepository) Save(ctx context.Context, track *library.Track) error {
	var albumIDStr *string
	if track.AlbumID != nil {
		s := string(*track.AlbumID)
		albumIDStr = &s
	}

	var vec *pgvector.Vector
	if len(track.Embedding) == 384 {
		v := pgvector.NewVector(track.Embedding)
		vec = &v
	}

	query := `
		INSERT INTO tracks (
			id, album_id, artist_id, title, track_number, duration,
			file_path, file_format, file_size, bitrate, genre, embedding, created_at,
			source_provider, source_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
		ON CONFLICT (id) DO UPDATE SET
			album_id = EXCLUDED.album_id,
			artist_id = EXCLUDED.artist_id,
			title = EXCLUDED.title,
			track_number = EXCLUDED.track_number,
			duration = EXCLUDED.duration,
			file_path = EXCLUDED.file_path,
			file_format = EXCLUDED.file_format,
			file_size = EXCLUDED.file_size,
			bitrate = EXCLUDED.bitrate,
			genre = EXCLUDED.genre,
			embedding = EXCLUDED.embedding,
			source_provider = COALESCE(EXCLUDED.source_provider, tracks.source_provider),
			source_id = COALESCE(EXCLUDED.source_id, tracks.source_id)
	`
	durationSec := int(track.Duration.Seconds())

	_, err := r.pool.Exec(ctx, query,
		string(track.ID),
		albumIDStr,
		string(track.ArtistID),
		track.Title,
		track.TrackNumber,
		durationSec,
		track.FilePath,
		string(track.FileFormat),
		track.FileSize,
		track.Bitrate,
		track.Genre,
		vec,
		track.CreatedAt,
		nullableString(track.SourceProvider),
		nullableString(track.SourceID),
	)
	if err != nil {
		return fmt.Errorf("falha ao salvar faixa no banco: %w", err)
	}
	return nil
}

func (r *TrackRepository) Update(ctx context.Context, track *library.Track) error {
	return r.Save(ctx, track)
}

func (r *TrackRepository) Delete(ctx context.Context, id library.TrackID) error {
	_, err := r.pool.Exec(ctx, "DELETE FROM tracks WHERE id = $1", string(id))
	if err != nil {
		return fmt.Errorf("falha ao deletar faixa: %w", err)
	}
	return nil
}

func (r *TrackRepository) FindByID(ctx context.Context, id library.TrackID) (*library.Track, error) {
	query := `
		SELECT 
			t.id, t.album_id, t.artist_id, COALESCE(a.name, ''), COALESCE(al.title, ''),
			t.title, t.track_number, t.duration, t.file_path, t.file_format,
			t.file_size, t.bitrate, t.genre, t.embedding, t.created_at,
			COALESCE(t.source_provider, ''), COALESCE(t.source_id, '')
		FROM tracks t
		LEFT JOIN artists a ON t.artist_id = a.id
		LEFT JOIN albums al ON t.album_id = al.id
		WHERE t.id = $1
	`
	return r.scanTrack(r.pool.QueryRow(ctx, query, string(id)))
}

func (r *TrackRepository) FindByFilePath(ctx context.Context, filePath string) (*library.Track, error) {
	query := `
		SELECT 
			t.id, t.album_id, t.artist_id, COALESCE(a.name, ''), COALESCE(al.title, ''),
			t.title, t.track_number, t.duration, t.file_path, t.file_format,
			t.file_size, t.bitrate, t.genre, t.embedding, t.created_at,
			COALESCE(t.source_provider, ''), COALESCE(t.source_id, '')
		FROM tracks t
		LEFT JOIN artists a ON t.artist_id = a.id
		LEFT JOIN albums al ON t.album_id = al.id
		WHERE t.file_path = $1
	`
	return r.scanTrack(r.pool.QueryRow(ctx, query, filePath))
}

func (r *TrackRepository) List(ctx context.Context, offset, limit int, query string) ([]library.Track, int, error) {
	if limit <= 0 {
		limit = 50
	}

	whereClause := ""
	var args []any
	if query != "" {
		whereClause = "WHERE t.title ILIKE $1 OR a.name ILIKE $1 OR al.title ILIKE $1 OR t.genre ILIKE $1"
		args = append(args, "%"+query+"%")
	}

	countQuery := fmt.Sprintf(`
		SELECT COUNT(*) 
		FROM tracks t
		LEFT JOIN artists a ON t.artist_id = a.id
		LEFT JOIN albums al ON t.album_id = al.id
		%s
	`, whereClause)

	var total int
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao contar faixas: %w", err)
	}

	selectQuery := fmt.Sprintf(`
		SELECT 
			t.id, t.album_id, t.artist_id, COALESCE(a.name, ''), COALESCE(al.title, ''),
			t.title, t.track_number, t.duration, t.file_path, t.file_format,
			t.file_size, t.bitrate, t.genre, t.embedding, t.created_at,
			COALESCE(t.source_provider, ''), COALESCE(t.source_id, '')
		FROM tracks t
		LEFT JOIN artists a ON t.artist_id = a.id
		LEFT JOIN albums al ON t.album_id = al.id
		%s
		ORDER BY t.title ASC
		LIMIT $%d OFFSET $%d
	`, whereClause, len(args)+1, len(args)+2)

	args = append(args, limit, offset)
	rows, err := r.pool.Query(ctx, selectQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao listar faixas: %w", err)
	}
	defer rows.Close()

	var tracks []library.Track
	for rows.Next() {
		tr, err := r.scanTrackRow(rows)
		if err != nil {
			return nil, 0, err
		}
		tracks = append(tracks, *tr)
	}

	return tracks, total, nil
}

func (r *TrackRepository) ListByAlbumID(ctx context.Context, albumID library.AlbumID) ([]library.Track, error) {
	query := `
		SELECT 
			t.id, t.album_id, t.artist_id, COALESCE(a.name, ''), COALESCE(al.title, ''),
			t.title, t.track_number, t.duration, t.file_path, t.file_format,
			t.file_size, t.bitrate, t.genre, t.embedding, t.created_at,
			COALESCE(t.source_provider, ''), COALESCE(t.source_id, '')
		FROM tracks t
		LEFT JOIN artists a ON t.artist_id = a.id
		LEFT JOIN albums al ON t.album_id = al.id
		WHERE t.album_id = $1
		ORDER BY t.track_number ASC, t.title ASC
	`
	rows, err := r.pool.Query(ctx, query, string(albumID))
	if err != nil {
		return nil, fmt.Errorf("falha ao listar faixas do álbum: %w", err)
	}
	defer rows.Close()

	var tracks []library.Track
	for rows.Next() {
		tr, err := r.scanTrackRow(rows)
		if err != nil {
			return nil, err
		}
		tracks = append(tracks, *tr)
	}

	return tracks, nil
}

func (r *TrackRepository) ListByArtistID(ctx context.Context, artistID library.ArtistID) ([]library.Track, error) {
	query := `
		SELECT 
			t.id, t.album_id, t.artist_id, COALESCE(a.name, ''), COALESCE(al.title, ''),
			t.title, t.track_number, t.duration, t.file_path, t.file_format,
			t.file_size, t.bitrate, t.genre, t.embedding, t.created_at,
			COALESCE(t.source_provider, ''), COALESCE(t.source_id, '')
		FROM tracks t
		LEFT JOIN artists a ON t.artist_id = a.id
		LEFT JOIN albums al ON t.album_id = al.id
		WHERE t.artist_id = $1
		ORDER BY t.title ASC
	`
	rows, err := r.pool.Query(ctx, query, string(artistID))
	if err != nil {
		return nil, fmt.Errorf("falha ao listar faixas do artista: %w", err)
	}
	defer rows.Close()

	var tracks []library.Track
	for rows.Next() {
		tr, err := r.scanTrackRow(rows)
		if err != nil {
			return nil, err
		}
		tracks = append(tracks, *tr)
	}

	return tracks, nil
}

func (r *TrackRepository) scanTrack(row pgx.Row) (*library.Track, error) {
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
		vec                  *pgvector.Vector
		createdAt            time.Time
		sourceProvider       string
		sourceID             string
	)

	err := row.Scan(
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
		&vec,
		&createdAt,
		&sourceProvider,
		&sourceID,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, library.ErrTrackNotFound
		}
		return nil, fmt.Errorf("falha ao ler faixa: %w", err)
	}

	format, _ := library.ParseAudioFormat(fileFormatStr)
	dur := time.Duration(durationSec) * time.Second

	tr, err := library.NewTrack(library.TrackID(idStr), title, library.ArtistID(artistIDStr), dur, filePath, fileSize, format)
	if err != nil {
		return nil, err
	}

	tr.ArtistName = artistName
	tr.AlbumTitle = albTitle
	tr.TrackNumber = trackNumber
	tr.Bitrate = bitrate
	tr.Genre = genre
	tr.CreatedAt = createdAt
	tr.SetSource(sourceProvider, sourceID)

	if albumIDStr != nil {
		aID := library.AlbumID(*albumIDStr)
		tr.AlbumID = &aID
	}
	if vec != nil {
		tr.Embedding = vec.Slice()
	}

	return tr, nil
}

func (r *TrackRepository) scanTrackRow(rows pgx.Rows) (*library.Track, error) {
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
		vec                  *pgvector.Vector
		createdAt            time.Time
		sourceProvider       string
		sourceID             string
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
		&vec,
		&createdAt,
		&sourceProvider,
		&sourceID,
	)
	if err != nil {
		return nil, fmt.Errorf("falha ao ler linha de faixa: %w", err)
	}

	format, _ := library.ParseAudioFormat(fileFormatStr)
	dur := time.Duration(durationSec) * time.Second

	tr, err := library.NewTrack(library.TrackID(idStr), title, library.ArtistID(artistIDStr), dur, filePath, fileSize, format)
	if err != nil {
		return nil, err
	}

	tr.ArtistName = artistName
	tr.AlbumTitle = albTitle
	tr.TrackNumber = trackNumber
	tr.Bitrate = bitrate
	tr.Genre = genre
	tr.CreatedAt = createdAt
	tr.SetSource(sourceProvider, sourceID)

	if albumIDStr != nil {
		aID := library.AlbumID(*albumIDStr)
		tr.AlbumID = &aID
	}
	if vec != nil {
		tr.Embedding = vec.Slice()
	}

	return tr, nil
}

// FindTrackIDsBySource maps the remote ids that are already indexed locally, so the
// discovery results can be flagged with "in_library" in a single query (RF7.1).
func (r *TrackRepository) FindTrackIDsBySource(ctx context.Context, provider string, sourceIDs []string) (map[string]library.TrackID, error) {
	found := make(map[string]library.TrackID, len(sourceIDs))
	if provider == "" || len(sourceIDs) == 0 {
		return found, nil
	}

	query := `SELECT source_id, id FROM tracks WHERE source_provider = $1 AND source_id = ANY($2)`
	rows, err := r.pool.Query(ctx, query, provider, sourceIDs)
	if err != nil {
		return nil, fmt.Errorf("falha ao buscar faixas por origem remota: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var sourceID, trackID string
		if err := rows.Scan(&sourceID, &trackID); err != nil {
			return nil, fmt.Errorf("falha ao ler faixa por origem remota: %w", err)
		}
		found[sourceID] = library.TrackID(trackID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("falha ao percorrer faixas por origem remota: %w", err)
	}
	return found, nil
}
