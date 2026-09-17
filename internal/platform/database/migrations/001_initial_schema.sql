-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Table: artists
CREATE TABLE IF NOT EXISTS artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: albums
CREATE TABLE IF NOT EXISTS albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    year INT,
    cover_path VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: tracks
CREATE TABLE IF NOT EXISTS tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID REFERENCES albums(id) ON DELETE SET NULL,
    artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    track_number INT,
    duration INT NOT NULL, -- in seconds
    file_path VARCHAR(1024) NOT NULL UNIQUE,
    file_format VARCHAR(16) NOT NULL, -- mp3, flac, m4a, opus
    file_size BIGINT NOT NULL,
    bitrate INT,
    genre VARCHAR(128),
    embedding vector(384), -- Vector for smart radio similarity
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for relational performance
CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);

-- Vector index with pgvector (Cosine distance)
CREATE INDEX IF NOT EXISTS idx_tracks_embedding ON tracks USING hnsw (embedding vector_cosine_ops);

-- Table: download_jobs
CREATE TABLE IF NOT EXISTS download_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url VARCHAR(1024) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_download_jobs_status ON download_jobs(status);
