-- Migration 003: descoberta remota e itens de job de download (PRD v2, seção 5).

-- Liga cada faixa ao item do catálogo remoto que a originou (RF7.1, in_library).
ALTER TABLE tracks
    ADD COLUMN IF NOT EXISTS source_provider VARCHAR(16),
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_source
    ON tracks(source_provider, source_id) WHERE source_id IS NOT NULL;

-- Jobs passam a guardar o que a fila precisa exibir: tipo, fonte, título e capa (RF8.2).
ALTER TABLE download_jobs
    ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'track',
    ADD COLUMN IF NOT EXISTS source_provider VARCHAR(16),
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS title VARCHAR(512),
    ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(1024),
    ADD COLUMN IF NOT EXISTS playlist_id UUID REFERENCES playlists(id) ON DELETE SET NULL;

-- Reaproveita a playlist Harmoni criada para a mesma playlist remota (RF8.4).
CREATE INDEX IF NOT EXISTS idx_download_jobs_source
    ON download_jobs(source_provider, source_id);

-- Um item por vídeo: progresso real e falha isolada não derruba a playlist (RF8.2).
CREATE TABLE IF NOT EXISTS download_job_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES download_jobs(id) ON DELETE CASCADE,
    position INT NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    title VARCHAR(512),
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- queued | processing | completed | failed | skipped | canceled
    track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
    error_message TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (job_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_job_items_job ON download_job_items(job_id, position);
