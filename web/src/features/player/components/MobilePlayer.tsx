import React from 'react';
import { CircleArrowDown, Loader2, Pause, Play } from 'lucide-react';
import { apiClient } from '../../../adapters/api/client.ts';
import { useLayoutStore } from '../../../app/layout/layoutStore.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { useDominantColor } from '../../../shared/hooks/useDominantColor.ts';
import { usePlayerStore } from '../store/playerStore.ts';

/** Mini player flutuante do celular: cartão colorido pela capa, acima da navegação. */
export const MobilePlayer: React.FC = () => {
  const track = usePlayerStore((s) => s.currentTrack);
  const status = usePlayerStore((s) => s.status);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const isPlayingOffline = usePlayerStore((s) => s.isPlayingOffline);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const setNowPlayingOpen = useLayoutStore((s) => s.setNowPlayingOpen);
  const color = useDominantColor(track ? apiClient.getCoverUrl(track.id) : null, '#3e3e3e');

  if (!track) return null;
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setNowPlayingOpen(true)}
      onKeyDown={(event) => event.key === 'Enter' && setNowPlayingOpen(true)}
      aria-label={`Abrir o player: ${track.title}`}
      className="relative mx-2 overflow-hidden rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      style={{ backgroundColor: color, backgroundImage: 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35))' }}
    >
      <div className="flex h-[var(--mobile-player-h)] items-center gap-2 px-2">
        <Cover src={apiClient.getCoverUrl(track.id)} className="h-10 w-10" iconSize={16} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{track.title}</p>
          <p className="flex min-w-0 items-center gap-1 text-sm text-white/70">
            {isPlayingOffline && <CircleArrowDown size={13} className="shrink-0 fill-sp-green text-black" />}
            <span className="truncate">{track.artist_name}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void togglePlay();
          }}
          aria-label={status === 'playing' ? 'Pausar' : 'Tocar'}
          className="flex h-10 w-10 shrink-0 items-center justify-center"
        >
          {status === 'loading' ? (
            <Loader2 size={22} className="animate-spin" />
          ) : status === 'playing' ? (
            <Pause size={24} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={24} fill="currentColor" strokeWidth={0} />
          )}
        </button>
      </div>
      <div className="absolute inset-x-2 bottom-0 h-0.5 overflow-hidden rounded-full bg-white/20">
        <div className="h-full bg-white" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
};
