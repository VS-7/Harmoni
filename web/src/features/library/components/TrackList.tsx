import React, { useState, useEffect } from 'react';
import { Play, Radio, HardDriveDownload, Check, Clock } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';
import { offlineStorage } from '../../../adapters/storage/offline_store.ts';

interface Props {
  tracks: Track[];
}

export const TrackList: React.FC<Props> = ({ tracks }) => {
  const { currentTrack, status, playTrack, startRadio } = usePlayerStore();
  const [offlineMap, setOfflineMap] = useState<Record<string, boolean>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  const handleDownloadOffline = async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    try {
      setDownloadingId(track.id);
      await offlineStorage.downloadTrackForOffline(track);
      setOfflineMap((prev) => ({ ...prev, [track.id]: true }));
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

  return (
    <div className="w-full">
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

          return (
            <div
              key={track.id}
              onClick={() => playTrack(track, tracks)}
              className={`group grid grid-cols-12 gap-4 px-4 py-3 items-center rounded-lg cursor-pointer transition-colors ${
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

              {/* Title & Artist */}
              <div className="col-span-6 sm:col-span-5 min-w-0">
                <p
                  className={`text-sm font-medium truncate ${
                    isCurrent ? 'text-emerald-400 font-semibold' : 'text-zinc-100'
                  }`}
                >
                  {track.title}
                </p>
                <p className="text-xs text-zinc-400 truncate">{track.artist_name}</p>
              </div>

              {/* Album */}
              <div className="hidden sm:block sm:col-span-3 min-w-0">
                <p className="text-xs text-zinc-400 truncate">
                  {track.album_title || '—'}
                </p>
              </div>

              {/* Actions & Duration */}
              <div className="col-span-5 sm:col-span-3 flex items-center justify-end gap-3">
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
