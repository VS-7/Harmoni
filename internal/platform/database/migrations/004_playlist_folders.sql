-- Migration 004: pastas de playlists na Sua Biblioteca (UI no estilo Spotify).

CREATE TABLE IF NOT EXISTS playlist_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Excluir uma pasta nunca apaga as playlists: elas voltam para a raiz da biblioteca.
ALTER TABLE playlists
    ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES playlist_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_playlists_folder_id ON playlists(folder_id);
