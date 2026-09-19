import React, { useEffect, useState } from 'react';
import { Disc3, Play, Shuffle } from 'lucide-react';
import type { Album } from '../../../domain/album.ts';
import type { Track } from '../../../domain/track.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { GlassButton, GlassSurface } from '../../../shared/ui/glass/index.ts';
import { TrackList } from './TrackList.tsx';
import { TrackActionsMenu } from './TrackActionsMenu.tsx';
import { AddToPlaylistSheet } from './AddToPlaylistSheet.tsx';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { OfflineAllButton } from '../../offline/components/OfflineAllButton.tsx';
import { formatDuration } from '../../../shared/utils/formatters.ts';
import type { Playlist } from '../../../domain/playlist.ts';

interface AlbumScreenProps {
  albumId: string;
}

export const AlbumScreen: React.FC<AlbumScreenProps> = ({ albumId }) => {
  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [pickerTrack, setPickerTrack] = useState<Track | null>(null);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  useEffect(() => {
    void (async () => {
      const [details, lists] = await Promise.all([
        apiClient.getAlbum(albumId).catch(() => null),
        apiClient.listPlaylists().catch(() => [] as Playlist[]),
      ]);
      if (details) {
        setAlbum(details.album);
        setTracks(details.tracks);
      }
      setPlaylists(lists);
    })();
  }, [albumId]);

  const totalDuration = tracks.reduce((acc, t) => acc + t.duration_sec, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <GlassSurface radius="md" className="w-[min(60vw,240px)]">
          <img
            src={apiClient.getAlbumCoverUrl(albumId)}
            alt=""
            className="aspect-square w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = '0';
            }}
          />
        </GlassSurface>
        <div>
          <h2 className="text-title text-on-glass">{album?.title ?? 'Álbum'}</h2>
          <p className="text-footnote text-[color:var(--fg-secondary)]">
            {tracks[0]?.artist_name ?? ''} · {tracks.length} faixas · {formatDuration(totalDuration)}
          </p>
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
          <OfflineAllButton id={`album:${albumId}`} tracks={tracks} />
          <GlassButton
            size="md"
            shape="label"
            variant="light"
            onClick={() => {
              toggleShuffle();
              if (tracks.length > 0) {
                void playTrack(tracks[Math.floor(Math.random() * tracks.length)], tracks);
              }
            }}
            disabled={tracks.length === 0}
          >
            <Shuffle size={16} /> Aleatório
          </GlassButton>
        </div>
      </div>

      {tracks.length === 0 ? (
        <p className="py-10 text-center text-body text-[color:var(--fg-secondary)]">
          <Disc3 size={20} className="mx-auto mb-2 opacity-40" />
          Nenhuma faixa neste álbum
        </p>
      ) : (
        <TrackList tracks={tracks} numbered onOpenActions={setMenuTrack} />
      )}

      <TrackActionsMenu
        track={menuTrack}
        open={menuTrack !== null}
        onClose={() => setMenuTrack(null)}
        onAddToPlaylist={setPickerTrack}
      />
      <AddToPlaylistSheet track={pickerTrack} playlists={playlists} onClose={() => setPickerTrack(null)} />
    </div>
  );
};
