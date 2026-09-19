import React, { useCallback, useRef, useState } from 'react';
import { MoreHorizontal, ArrowDownToLine, AudioLines } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import { GlassButton } from '../../../shared/ui/glass/index.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useOfflineStore } from '../../offline/store/offlineStore.ts';

interface TrackListProps {
  tracks: Track[];
  /** Numeração por posição, usada em álbuns e playlists. */
  numbered?: boolean;
  emptyMessage?: string;
  onOpenActions: (track: Track) => void;
}

/** Tempo até o toque longo abrir o menu, como no iOS (RF11.1). */
const LONG_PRESS_MS = 500;

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  numbered = false,
  emptyMessage = 'Nenhuma faixa por aqui',
  onOpenActions,
}) => {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const status = usePlayerStore((s) => s.status);

  if (tracks.length === 0) {
    return (
      <p className="py-12 text-center text-body text-[color:var(--fg-secondary)]">{emptyMessage}</p>
    );
  }

  return (
    <ul className="divide-y divide-[color:var(--separator)]">
      {tracks.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index}
          numbered={numbered}
          isCurrent={currentTrack?.id === track.id}
          isPlaying={currentTrack?.id === track.id && status === 'playing'}
          onPlay={() => void playTrack(track, tracks)}
          onOpenActions={() => onOpenActions(track)}
        />
      ))}
    </ul>
  );
};

interface TrackRowProps {
  track: Track;
  index: number;
  numbered: boolean;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onOpenActions: () => void;
}

const TrackRow: React.FC<TrackRowProps> = ({
  track,
  index,
  numbered,
  isCurrent,
  isPlaying,
  onPlay,
  onOpenActions,
}) => {
  const isOffline = useOfflineStore((s) => s.offlineIds.has(track.id));
  const progress = useOfflineStore((s) => s.progress[track.id]);

  const timer = useRef<number | null>(null);
  // Um toque longo abre o menu, então o toque que o segue não deve tocar a faixa.
  const [suppressTap, setSuppressTap] = useState(false);

  const startPress = useCallback(() => {
    setSuppressTap(false);
    timer.current = window.setTimeout(() => {
      setSuppressTap(true);
      onOpenActions();
    }, LONG_PRESS_MS);
  }, [onOpenActions]);

  const endPress = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  return (
    <li className="list-row">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (suppressTap) {
              setSuppressTap(false);
              return;
            }
            onPlay();
          }}
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onPointerCancel={endPress}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenActions();
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
        >
          {numbered && (
            <span className="w-6 shrink-0 text-center text-footnote text-[color:var(--fg-tertiary)]">
              {isCurrent ? <AudioLines size={14} className="mx-auto" /> : index + 1}
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span
                className={`truncate text-body ${isCurrent ? 'font-semibold' : ''} ${
                  isPlaying ? 'opacity-100' : ''
                }`}
              >
                {track.title}
              </span>
              {/* Indicador monocromático de faixa no aparelho (RF11.3). */}
              {isOffline && (
                <ArrowDownToLine
                  size={12}
                  className="shrink-0 opacity-60"
                  aria-label="Disponível no aparelho"
                />
              )}
              {progress !== undefined && (
                <span className="shrink-0 text-caption text-[color:var(--fg-tertiary)]">
                  {Math.round(progress * 100)}%
                </span>
              )}
            </span>
            <span className="block truncate text-footnote text-[color:var(--fg-secondary)]">
              {track.artist_name}
              {track.album_title ? ` — ${track.album_title}` : ''}
            </span>
          </span>

          <span className="shrink-0 text-footnote tabular-nums text-[color:var(--fg-tertiary)]">
            {formatDuration(track.duration_sec)}
          </span>
        </button>

        {/* Sempre visível: não depende de hover (correção do P5, RF11.1). */}
        <GlassButton
          size="sm"
          variant="light"
          onClick={onOpenActions}
          aria-label={`Ações de ${track.title}`}
        >
          <MoreHorizontal size={16} />
        </GlassButton>
      </div>
    </li>
  );
};
