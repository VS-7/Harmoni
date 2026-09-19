import React, { useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Radio,
  ListMusic,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react';
import { Sheet } from '../../shared/ui/Sheet.tsx';
import { GlassButton, GlassSurface } from '../../shared/ui/glass/index.ts';
import { usePlayerStore } from '../../features/player/store/playerStore.ts';
import { apiClient } from '../../adapters/api/client.ts';
import { formatDuration } from '../../shared/utils/formatters.ts';

interface NowPlayingSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Player em tela cheia: capa grande, seek, controles lg e fila (RF10.3). */
export const NowPlayingSheet: React.FC<NowPlayingSheetProps> = ({ open, onClose }) => {
  const [showQueue, setShowQueue] = useState(false);

  const {
    currentTrack,
    queue,
    queueIndex,
    status,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeat,
    isRadioMode,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    startRadio,
    playTrack,
  } = usePlayerStore();

  if (!currentTrack) return null;

  const isPlaying = status === 'playing';
  const total = duration || currentTrack.duration_sec;

  return (
    <Sheet open={open} onClose={onClose} size="full" label="Tocando agora">
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-6 pb-4">
        {showQueue ? (
          <>
            <div className="flex items-center justify-between py-2">
              <h2 className="text-title text-on-glass">A seguir</h2>
              <GlassButton size="sm" shape="label" variant="light" onClick={() => setShowQueue(false)}>
                Fechar
              </GlassButton>
            </div>
            <ul className="app-scroll min-h-0 flex-1 space-y-1">
              {queue.map((track, index) => (
                <li key={`${track.id}-${index}`} className="list-row">
                  <button
                    type="button"
                    onClick={() => void playTrack(track)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left ${
                      index === queueIndex ? 'bg-[color:var(--glass-scrim)]' : ''
                    }`}
                  >
                    <span className="w-6 shrink-0 text-center text-footnote text-[color:var(--fg-tertiary)]">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{track.title}</span>
                      <span className="block truncate text-footnote text-[color:var(--fg-secondary)]">
                        {track.artist_name}
                      </span>
                    </span>
                    <span className="shrink-0 text-footnote text-[color:var(--fg-tertiary)]">
                      {formatDuration(track.duration_sec)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {/* Capa grande */}
            <div className="flex min-h-0 flex-1 items-center justify-center py-4">
              <GlassSurface radius="md" className="w-full max-w-[min(78vw,340px)]">
                <img
                  src={apiClient.getCoverUrl(currentTrack.id)}
                  alt={`Capa de ${currentTrack.title}`}
                  className="aspect-square w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = '0';
                  }}
                />
              </GlassSurface>
            </div>

            {/* Título */}
            <div className="shrink-0 pb-4">
              <h2 className="truncate text-title text-on-glass">{currentTrack.title}</h2>
              <p className="truncate text-body text-[color:var(--fg-secondary)]">
                {currentTrack.artist_name}
                {currentTrack.album_title ? ` — ${currentTrack.album_title}` : ''}
              </p>
            </div>

            {/* Seek */}
            <div className="shrink-0 pb-4">
              <input
                type="range"
                min={0}
                max={total || 1}
                value={Math.min(currentTime, total || 0)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Posição da faixa"
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--separator-strong)] accent-[color:var(--fg)]"
              />
              <div className="flex justify-between pt-1.5 text-caption text-[color:var(--fg-secondary)]">
                <span>{formatDuration(Math.floor(currentTime))}</span>
                <span>-{formatDuration(Math.max(0, Math.floor((total || 0) - currentTime)))}</span>
              </div>
            </div>

            {/* Controles principais */}
            <div className="flex shrink-0 items-center justify-center gap-4 pb-5">
              <GlassButton
                size="md"
                variant="light"
                active={shuffle}
                onClick={toggleShuffle}
                aria-label="Aleatório"
                aria-pressed={shuffle}
              >
                <Shuffle size={18} />
              </GlassButton>

              <GlassButton size="lg" onClick={() => void previous()} aria-label="Anterior">
                <SkipBack size={22} fill="currentColor" />
              </GlassButton>

              <GlassButton
                size="lg"
                onClick={() => void togglePlay()}
                aria-label={isPlaying ? 'Pausar' : 'Tocar'}
              >
                {status === 'loading' ? (
                  <Loader2 size={26} className="animate-spin" />
                ) : isPlaying ? (
                  <Pause size={26} fill="currentColor" />
                ) : (
                  <Play size={26} fill="currentColor" />
                )}
              </GlassButton>

              <GlassButton size="lg" onClick={() => void next()} aria-label="Próxima">
                <SkipForward size={22} fill="currentColor" />
              </GlassButton>

              <GlassButton
                size="md"
                variant="light"
                active={repeat !== 'off'}
                onClick={cycleRepeat}
                aria-label={`Repetir: ${repeat}`}
              >
                {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
              </GlassButton>
            </div>

            {/* Volume e ações secundárias */}
            <div className="flex shrink-0 items-center gap-3 pb-2">
              <GlassButton size="sm" variant="light" onClick={toggleMute} aria-label="Silenciar">
                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </GlassButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[color:var(--separator-strong)] accent-[color:var(--fg)]"
              />
              <GlassButton
                size="sm"
                variant="light"
                active={isRadioMode}
                onClick={() => void startRadio(currentTrack)}
                aria-label="Iniciar rádio"
              >
                <Radio size={16} />
              </GlassButton>
              <GlassButton
                size="sm"
                variant="light"
                onClick={() => setShowQueue(true)}
                aria-label="Ver fila"
              >
                <ListMusic size={16} />
              </GlassButton>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
};
