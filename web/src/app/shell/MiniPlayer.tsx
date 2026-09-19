import React from 'react';
import { Play, Pause, SkipForward, Loader2, ArrowDownToLine } from 'lucide-react';
import { GlassButton, GlassSurface } from '../../shared/ui/glass/index.ts';
import { usePlayerStore } from '../../features/player/store/playerStore.ts';
import { apiClient } from '../../adapters/api/client.ts';

interface MiniPlayerProps {
  onExpand: () => void;
}

/** Mini player flutuante, acima da tab bar (RF10.1). */
export const MiniPlayer: React.FC<MiniPlayerProps> = ({ onExpand }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const status = usePlayerStore((s) => s.status);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const isPlayingOffline = usePlayerStore((s) => s.isPlayingOffline);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);

  if (!currentTrack) return null;

  const isPlaying = status === 'playing';
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <GlassSurface radius="md" className="w-full">
      <div className="relative" style={{ height: 'var(--mini-player-height)' }}>
        {/* Linha de progresso monocromática, sem cor semântica (RF9.2). */}
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[color:var(--separator)]">
          <div
            className="h-full bg-[color:var(--fg)] opacity-70 transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex h-full items-center gap-3 pl-3 pr-2">
          <button
            type="button"
            onClick={onExpand}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label="Abrir player"
          >
            <img
              src={apiClient.getCoverUrl(currentTrack.id)}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-body font-semibold text-on-glass">
                  {currentTrack.title}
                </span>
                {isPlayingOffline && (
                  <ArrowDownToLine size={12} className="shrink-0 opacity-60" aria-label="No aparelho" />
                )}
              </span>
              <span className="block truncate text-footnote text-[color:var(--fg-secondary)]">
                {currentTrack.artist_name}
              </span>
            </span>
          </button>

          <GlassButton
            size="md"
            variant="light"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? 'Pausar' : 'Tocar'}
          >
            {status === 'loading' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </GlassButton>

          <GlassButton size="md" variant="light" onClick={() => void next()} aria-label="Próxima">
            <SkipForward size={18} fill="currentColor" />
          </GlassButton>
        </div>
      </div>
    </GlassSurface>
  );
};
