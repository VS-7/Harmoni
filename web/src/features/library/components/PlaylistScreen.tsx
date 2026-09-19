import React, { useCallback, useEffect, useState } from 'react';
import { ListMusic, Play, Sparkles, Trash2 } from 'lucide-react';
import type { Playlist } from '../../../domain/playlist.ts';
import type { Track } from '../../../domain/track.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { GlassButton, GlassSurface } from '../../../shared/ui/glass/index.ts';
import { TrackList } from './TrackList.tsx';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import { AddToPlaylistSheet } from './AddToPlaylistSheet.tsx';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { OfflineAllButton } from '../../offline/components/OfflineAllButton.tsx';
import { formatDuration } from '../../../shared/utils/formatters.ts';

interface PlaylistScreenProps {
  playlistId: string;
  onDeleted: () => void;
  onOpenAlbum: (albumId: string) => void;
}

export const PlaylistScreen: React.FC<PlaylistScreenProps> = ({
  playlistId,
  onDeleted,
  onOpenAlbum,
}) => {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [pickerTrack, setPickerTrack] = useState<Track | null>(null);

  const playTrack = usePlayerStore((s) => s.playTrack);

  const load = useCallback(async () => {
    const [full, lists] = await Promise.all([
      apiClient.getPlaylist(playlistId).catch(() => null),
      apiClient.listPlaylists().catch(() => [] as Playlist[]),
    ]);
    setPlaylist(full);
    setAllPlaylists(lists);
  }, [playlistId]);

  useEffect(() => {
    void load();
  }, [load]);

  const tracks = playlist?.tracks ?? [];

  async function removeFromPlaylist(track: Track) {
    await apiClient.removeTrackFromPlaylist(playlistId, track.id).catch(() => undefined);
    await load();
  }

  async function deletePlaylist() {
    await apiClient.deletePlaylist(playlistId).catch(() => undefined);
    onDeleted();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <GlassSurface radius="md" className="w-[min(50vw,200px)]">
          <div className="flex aspect-square w-full items-center justify-center opacity-40">
            {playlist?.isSmart ? <Sparkles size={40} /> : <ListMusic size={40} />}
          </div>
        </GlassSurface>
        <div>
          <h2 className="text-title text-on-glass">{playlist?.name ?? 'Playlist'}</h2>
          <p className="text-footnote text-[color:var(--fg-secondary)]">
            {tracks.length} faixas · {formatDuration(playlist?.duration ?? 0)}
            {playlist?.isSmart ? ' · Inteligente' : ''}
          </p>
          {playlist?.description && (
            <p className="pt-1 text-footnote text-[color:var(--fg-secondary)]">{playlist.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <GlassButton
            size="md"
            shape="label"
            onClick={() => tracks[0] && void playTrack(tracks[0], tracks)}
            disabled={tracks.length === 0}
          >
            <Play size={16} fill="currentColor" /> Tocar
          </GlassButton>
          <OfflineAllButton id={`playlist:${playlistId}`} tracks={tracks} />
          <GlassButton size="md" variant="light" onClick={() => void deletePlaylist()} aria-label="Apagar playlist">
            <Trash2 size={16} />
          </GlassButton>
        </div>
      </div>

      <TrackList
        tracks={tracks}
        numbered
        emptyMessage="Playlist vazia"
        onOpenActions={setMenuTrack}
      />

      <TrackActionsMenu
        track={menuTrack}
        open={menuTrack !== null}
        onClose={() => setMenuTrack(null)}
        onAddToPlaylist={setPickerTrack}
        onOpenAlbum={onOpenAlbum}
        onRemoveFromPlaylist={(track) => void removeFromPlaylist(track)}
      />
      <AddToPlaylistSheet
        track={pickerTrack}
        playlists={allPlaylists}
        onClose={() => setPickerTrack(null)}
        onCreated={() => void load()}
      />
    </div>
  );
};
