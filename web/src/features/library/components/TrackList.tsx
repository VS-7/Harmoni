import React, { useState, useEffect } from 'react';
import { Play, Radio, HardDriveDownload, Check, Clock, Plus, Trash2, Music } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';
import { offlineStorage } from '../../../adapters/storage/offline_store.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { AddToPlaylistModal } from './AddToPlaylistModal.tsx';

interface Props {
  tracks: Track[];
  onRemoveFromPlaylist?: (trackId: string) => void;
  playlistContext?: boolean;
}

export const TrackList: React.FC<Props> = ({ tracks, onRemoveFromPlaylist, playlistContext = false }) => {
  const { currentTrack, status, playTrack, startRadio } = usePlayerStore();
  const [offlineMap, setOfflineMap] = useState<Record<string, boolean>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [modalTrack, setModalTrack] = useState<Track | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    // Check offline status for tracks
    async function checkOfflineStatus() {
      const map: Record<string, boolean> = {};
      for (const t of tracks) {
        map[t.id] = await offlineStorage.isTrackOffline(t.id);
      }
      setOfflineMap(map);
    }
    checkOfflineStatus();
  }, [tracks]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDownloadOffline = async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    try {
      setDownloadingId(track.id);
      await offlineStorage.downloadTrackForOffline(track);
      setOfflineMap((prev) => ({ ...prev, [track.id]: true }));
      showToast('Faixa salva para reprodução offline!');
    } catch (err) {
      alert('Erro ao salvar música offline: ' + (err as Error).message);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleStartRadio = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    startRadio(track);
  };

  const handleOpenPlaylistModal = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    setModalTrack(track);
  };

  const handleRemove = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (onRemoveFromPlaylist) {
      onRemoveFromPlaylist(trackId);
    }
  };

  return (
    <div className="w-full relative">
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-zinc-950 font-medium px-4 py-2.5 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-4 duration-200 text-sm">
          {toastMessage}
        </div>
      )}

      {modalTrack && (
        <AddToPlaylistModal
          track={modalTrack}
          onClose={() => setModalTrack(null)}
          onSuccess={showToast}
        />
      )}

      <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-zinc-400 border-b border-zinc-800">
        <div className="col-span-1 text-center">#</div>
        <div className="col-span-6 sm:col-span-5">Título</div>
        <div className="hidden sm:block sm:col-span-3">Álbum</div>
        <div className="col-span-5 sm:col-span-3 flex items-center justify-end gap-1">
          <Clock size={14} />
          <span>Duração</span>
        </div>
      </div>

      <div className="divide-y divide-zinc-800/40">
        {tracks.map((track, idx) => {
          const isCurrent = currentTrack?.id === track.id;
          const isPlaying = isCurrent && status === 'playing';
          const isOffline = offlineMap[track.id];
          const isDownloading = downloadingId === track.id;
          const coverUrl = apiClient.getCoverUrl(track.id);

          return (
            <div
              key={track.id}
              onClick={() => playTrack(track, tracks)}
              className={`group grid grid-cols-12 gap-4 px-4 py-2.5 items-center rounded-lg cursor-pointer transition-colors ${
                isCurrent ? 'bg-emerald-500/10' : 'hover:bg-zinc-800/50'
              }`}
            >
              {/* Track number / Play icon */}
              <div className="col-span-1 flex items-center justify-center text-zinc-500 group-hover:text-zinc-100">
                {isPlaying ? (
                  <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                ) : (
                  <>
                    <span className="group-hover:hidden text-xs font-mono">{idx + 1}</span>
                    <Play size={16} className="hidden group-hover:block text-emerald-400" />
                  </>
                )}
              </div>

              {/* Thumbnail + Title & Artist */}
              <div className="col-span-6 sm:col-span-5 min-w-0 flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-md overflow-hidden bg-zinc-800 flex-shrink-0 flex items-center justify-center border border-zinc-800 shadow-sm">
                  <img
                    src={coverUrl}
                    alt={track.title}
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                    className="w-full h-full object-cover"
                  />
                  <Music className="absolute text-zinc-600 w-4 h-4 pointer-events-none" />
                </div>

                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      isCurrent ? 'text-emerald-400 font-semibold' : 'text-zinc-100'
                    }`}
                  >
                    {track.title}
                  </p>
                  <p className="text-xs text-zinc-400 truncate">{track.artist_name}</p>
                </div>
              </div>

              {/* Album */}
              <div className="hidden sm:block sm:col-span-3 min-w-0">
                <p className="text-xs text-zinc-400 truncate">
                  {track.album_title || '—'}
                </p>
              </div>

              {/* Actions & Duration */}
              <div className="col-span-5 sm:col-span-3 flex items-center justify-end gap-2 sm:gap-3">
                {/* Add to Playlist button */}
                <button
                  onClick={(e) => handleOpenPlaylistModal(e, track)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-all"
                  title="Adicionar à Playlist / Criar Mix Inteligente"
                >
                  <Plus size={16} />
                </button>

                {/* Remove from Playlist (only if in playlist view) */}
                {playlistContext && onRemoveFromPlaylist && (
                  <button
                    onClick={(e) => handleRemove(e, track.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                    title="Remover desta playlist"
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                {/* Radio button (RF3.2) */}
                <button
                  onClick={(e) => handleStartRadio(e, track)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-purple-400 hover:bg-purple-500/10 rounded transition-all"
                  title="Iniciar rádio desta música"
                >
                  <Radio size={16} />
                </button>

                {/* Offline download button (RF5.2) */}
                <button
                  onClick={(e) => handleDownloadOffline(e, track)}
                  disabled={isOffline || isDownloading}
                  className={`p-1.5 rounded transition-all ${
                    isOffline
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                  title={isOffline ? 'Salva offline no dispositivo' : 'Baixar para reprodução offline'}
                >
                  {isOffline ? (
                    <Check size={16} />
                  ) : isDownloading ? (
                    <span className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin inline-block" />
                  ) : (
                    <HardDriveDownload size={16} />
                  )}
                </button>

                {/* Duration */}
                <span className="text-xs text-zinc-400 font-mono w-10 text-right">
                  {formatDuration(track.duration_sec)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
