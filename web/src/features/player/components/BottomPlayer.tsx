import React, { useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  Radio,
  HardDriveDownload,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { QueueModal } from './QueueModal.tsx';

export const BottomPlayer: React.FC = () => {
  const {
    currentTrack,
    status,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    isPlayingOffline,
    isRadioMode,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
  } = usePlayerStore();

  const [isQueueOpen, setIsQueueOpen] = useState(false);

  if (!currentTrack) return null;

  const isPlaying = status === 'playing';
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const coverUrl = apiClient.getCoverUrl(currentTrack.id);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/60 px-4 py-3 z-40 transition-all">
        {/* Seek Bar */}
        <div className="w-full flex items-center gap-3 mb-2">
          <span className="text-xs text-zinc-400 w-10 text-right font-mono">
            {formatDuration(currentTime)}
          </span>
          <div className="relative flex-1 group py-1 cursor-pointer">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 group-hover:h-2 transition-all"
            />
            <div
              className="absolute top-1 left-0 h-1 bg-emerald-500 rounded-lg pointer-events-none group-hover:h-2 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-zinc-400 w-10 font-mono">
            {formatDuration(duration)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
          {/* Left: Track Info */}
          <div className="flex items-center gap-3 min-w-0 w-1/3">
            <img
              src={coverUrl}
              alt={currentTrack.title}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
              className="w-12 h-12 rounded-lg object-cover bg-zinc-800 flex-shrink-0 shadow"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100 truncate block">
                  {currentTrack.title}
                </span>
                {isPlayingOffline && (
                  <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                    <HardDriveDownload size={10} />
                    Offline
                  </span>
                )}
                {isRadioMode && (
                  <span className="flex items-center gap-1 text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-medium">
                    <Radio size={10} />
                    Rádio
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-400 truncate block">
                {currentTrack.artist_name} {currentTrack.album_title ? `• ${currentTrack.album_title}` : ''}
              </span>
            </div>
          </div>

          {/* Center: Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleShuffle}
              className={`p-2 rounded-full transition-colors ${
                shuffle ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Aleatório"
            >
              <Shuffle size={18} />
            </button>

            <button
              onClick={previous}
              className="text-zinc-300 hover:text-white transition-colors p-1"
              title="Anterior"
            >
              <SkipBack size={20} />
            </button>

            <button
              onClick={togglePlay}
              className="w-11 h-11 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center justify-center shadow-lg transition-transform active:scale-95"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            </button>

            <button
              onClick={next}
              className="text-zinc-300 hover:text-white transition-colors p-1"
              title="Próxima"
            >
              <SkipForward size={20} />
            </button>

            <button
              onClick={cycleRepeat}
              className={`p-2 rounded-full transition-colors ${
                repeat !== 'off' ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title={`Repetir: ${repeat}`}
            >
              {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>

          {/* Right: Volume & Queue */}
          <div className="flex items-center justify-end gap-3 w-1/3">
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={toggleMute} className="text-zinc-400 hover:text-zinc-200">
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            <button
              onClick={() => setIsQueueOpen(true)}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              title="Fila de reprodução"
            >
              <ListMusic size={20} />
            </button>
          </div>
        </div>
      </div>

      <QueueModal isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
    </>
  );
};
