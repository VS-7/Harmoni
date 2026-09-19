import React, { useCallback, useEffect, useState } from 'react';
import { Disc3, ListMusic, Music2, Plus, RefreshCw, Search } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import type { Album } from '../../../domain/album.ts';
import type { Playlist } from '../../../domain/playlist.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { GlassButton } from '../../../shared/ui/glass/index.ts';
import { GlassField } from '../../../shared/ui/GlassField.tsx';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl.tsx';
import { ArtworkTile } from '../../../shared/ui/ArtworkTile.tsx';
import { EmptyState } from '../../../shared/ui/EmptyState.tsx';
import { TrackList } from './TrackList.tsx';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import { AddToPlaylistSheet } from './AddToPlaylistSheet.tsx';
import { NewPlaylistSheet } from './NewPlaylistSheet.tsx';
import { formatDuration } from '../../../shared/utils/formatters.ts';

type Section = 'tracks' | 'albums' | 'playlists';

interface LibraryViewProps {
  onOpenAlbum: (albumId: string) => void;
  onOpenPlaylist: (playlistId: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onOpenAlbum, onOpenPlaylist }) => {
  const [section, setSection] = useState<Section>('tracks');
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [playlistPickerTrack, setPlaylistPickerTrack] = useState<Track | null>(null);
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tracksRes, albumsRes, playlistsRes] = await Promise.all([
        apiClient.listTracks(0, 200, query).catch(() => ({ data: [], total: 0 })),
        apiClient.listAlbums(0, 60).catch(() => ({ data: [], total: 0 })),
        apiClient.listPlaylists().catch(() => [] as Playlist[]),
      ]);
      setTracks(tracksRes.data);
      setAlbums(albumsRes.data);
      setPlaylists(playlistsRes);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  async function handleScan() {
    setScanning(true);
    try {
      await apiClient.triggerScan();
      // A varredura roda no servidor; damos um tempo antes de recarregar.
      window.setTimeout(() => void load(), 2500);
    } finally {
      window.setTimeout(() => setScanning(false), 2500);
    }
  }

  return (
    <div className="space-y-4">
      <GlassField
        icon={<Search size={16} />}
        placeholder="Buscar na biblioteca"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        aria-label="Buscar na biblioteca"
      />

      <div className="flex items-center gap-2">
        <SegmentedControl
          className="flex-1"
          value={section}
          onChange={setSection}
          segments={[
            { value: 'tracks', label: 'Músicas' },
            { value: 'albums', label: 'Álbuns' },
            { value: 'playlists', label: 'Playlists' },
          ]}
        />
        <GlassButton
          size="md"
          variant="light"
          onClick={() => void handleScan()}
          disabled={scanning}
          aria-label="Varrer biblioteca"
        >
          <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />
        </GlassButton>
        {section === 'playlists' && (
          <GlassButton
            size="md"
            variant="light"
            onClick={() => setShowNewPlaylist(true)}
            aria-label="Nova playlist"
          >
            <Plus size={16} />
          </GlassButton>
        )}
      </div>

      {loading ? (
        <p className="py-16 text-center text-body text-[color:var(--fg-secondary)]">Carregando…</p>
      ) : section === 'tracks' ? (
        <TrackList
          tracks={tracks}
          emptyMessage={query ? 'Nada encontrado na biblioteca' : 'Sua biblioteca está vazia'}
          onOpenActions={setMenuTrack}
        />
      ) : section === 'albums' ? (
        albums.length === 0 ? (
          <EmptyState icon={<Disc3 size={40} />} title="Nenhum álbum ainda" />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {albums.map((album) => (
              <ArtworkTile
                key={album.id}
                imageUrl={apiClient.getAlbumCoverUrl(album.id)}
                title={album.title}
                subtitle={album.year ? String(album.year) : undefined}
                fallbackIcon={<Disc3 size={32} />}
                onClick={() => onOpenAlbum(album.id)}
              />
            ))}
          </div>
        )
      ) : playlists.length === 0 ? (
        <EmptyState
          icon={<ListMusic size={40} />}
          title="Nenhuma playlist"
          description="Crie uma playlist ou baixe uma do YouTube pela aba Buscar."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {playlists.map((pl) => (
            <ArtworkTile
              key={pl.id}
              title={pl.name}
              subtitle={`${pl.trackCount} ${pl.trackCount === 1 ? 'faixa' : 'faixas'} · ${formatDuration(pl.duration)}`}
              fallbackIcon={pl.isSmart ? <Music2 size={32} /> : <ListMusic size={32} />}
              onClick={() => onOpenPlaylist(pl.id)}
            />
          ))}
        </div>
      )}

      <TrackActionsMenu
        track={menuTrack}
        open={menuTrack !== null}
        onClose={() => setMenuTrack(null)}
        onAddToPlaylist={setPlaylistPickerTrack}
        onOpenAlbum={onOpenAlbum}
      />

      <AddToPlaylistSheet
        track={playlistPickerTrack}
        playlists={playlists}
        onClose={() => setPlaylistPickerTrack(null)}
        onCreated={() => void load()}
      />

      <NewPlaylistSheet
        open={showNewPlaylist}
        onClose={() => setShowNewPlaylist(false)}
        onCreated={() => void load()}
      />
    </div>
  );
};
