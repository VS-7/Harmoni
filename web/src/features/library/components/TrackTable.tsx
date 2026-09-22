import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleArrowDown, Clock3, MoreHorizontal, Pause, Play } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import type { PlaybackContext } from '../../../domain/player.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { useMainScroll } from '../../../app/layout/scrollStore.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { Equalizer } from '../../../shared/components/Equalizer.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { useCanHover } from '../../../shared/hooks/useMediaQuery.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useOfflineStore } from '../../offline/store/offlineStore.ts';
import { apiCoverFor } from './trackArt.ts';
import { trackMenu } from '../menus.tsx';

export type TrackTableVariant = 'playlist' | 'album' | 'compact';

interface TrackTableProps {
  tracks: Track[];
  context: PlaybackContext | null;
  /**
   * playlist: capa + coluna Álbum; album: sem capa (a capa é a do álbum); compact: capa,
   * sem cabeçalho nem coluna Álbum (buscas, "Populares").
   */
  variant?: TrackTableVariant;
  /** Habilita "Remover desta playlist" no menu. */
  playlistId?: string;
  onRemoved?: () => void;
  /** A estação estende a fila sozinha ao chegar no fim. */
  radio?: boolean;
  /** Tocar a partir desta lista; o padrão toca a lista inteira no contexto. */
  onPlay?: (index: number) => void;
}

/**
 * Lista de faixas do Spotify: no desktop o clique seleciona (Ctrl/Shift para vários) e o
 * duplo clique toca; no toque, um toque já toca.
 */
export const TrackTable: React.FC<TrackTableProps> = ({
  tracks,
  context,
  variant = 'playlist',
  playlistId,
  onRemoved,
  radio = false,
  onPlay,
}) => {
  const canHover = useCanHover();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anchor = useRef<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const playQueue = usePlayerStore((s) => s.playQueue);

  // Clicar fora da lista limpa a seleção.
  useEffect(() => {
    if (selected.size === 0) return;
    const onDown = (event: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(event.target as Node)) setSelected(new Set());
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [selected.size]);

  useEffect(() => setSelected(new Set()), [tracks]);

  const play = useCallback(
    (index: number) => {
      if (onPlay) onPlay(index);
      else void playQueue(tracks, { startIndex: index, context, radio });
    },
    [onPlay, playQueue, tracks, context, radio],
  );

  const select = (index: number, event: React.MouseEvent) => {
    if (event.shiftKey && anchor.current !== null) {
      const [from, to] = [Math.min(anchor.current, index), Math.max(anchor.current, index)];
      setSelected(new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i)));
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      anchor.current = index;
      return;
    }
    setSelected(new Set([index]));
    anchor.current = index;
  };

  const openActions = (index: number, event: React.MouseEvent) => {
    const useSelection = selected.has(index) && selected.size > 1;
    if (!selected.has(index)) setSelected(new Set([index]));
    const chosen = useSelection ? [...selected].sort((a, b) => a - b).map((i) => tracks[i]) : [tracks[index]];
    const track = tracks[index];
    openMenu(event, trackMenu(chosen, { playlistId, onRemoved }), {
      align: 'end',
      header: useSelection
        ? { title: `${chosen.length} músicas selecionadas` }
        : { title: track.title, subtitle: track.artist_name, imageUrl: apiCoverFor(track) },
    });
  };

  return (
    <div ref={tableRef} className="sp-tracks px-2 md:px-4" role="grid" aria-rowcount={tracks.length}>
      {variant !== 'compact' && <TableHeader variant={variant} />}
      <div role="rowgroup">
        {tracks.map((track, index) => (
          <TrackRow
            key={`${track.id}-${index}`}
            track={track}
            index={index}
            variant={variant}
            selected={selected.has(index)}
            canHover={canHover}
            onSelect={select}
            onPlay={play}
            onActions={openActions}
          />
        ))}
      </div>
    </div>
  );
};

const TableHeader: React.FC<{ variant: TrackTableVariant }> = ({ variant }) => {
  const sentinel = useRef<HTMLDivElement>(null);
  const root = useMainScroll((s) => s.element);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!sentinel.current || !root) return;
    // Fica "presa" quando passa por baixo do cabeçalho fixo de 64px da página.
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      root,
      rootMargin: '-64px 0px 0px 0px',
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [root]);

  return (
    <>
      <div ref={sentinel} className="h-px" aria-hidden="true" />
      <div
        role="row"
        data-variant={variant}
        className={[
          'sp-track-grid sticky top-16 z-10 mb-4 h-9 border-b text-sm text-sp-subdued max-md:hidden',
          stuck ? '-mx-2 border-white/10 bg-sp-card px-6 md:-mx-4 md:px-8' : 'border-white/10',
        ].join(' ')}
      >
        <span role="columnheader" className="sp-col-index justify-end">
          #
        </span>
        <span role="columnheader">Título</span>
        <span role="columnheader" className="sp-col-album">
          Álbum
        </span>
        <span role="columnheader" className="flex justify-end pr-8" aria-label="Duração">
          <Clock3 size={16} />
        </span>
      </div>
    </>
  );
};

interface TrackRowProps {
  track: Track;
  index: number;
  variant: TrackTableVariant;
  selected: boolean;
  canHover: boolean;
  onSelect: (index: number, event: React.MouseEvent) => void;
  onPlay: (index: number) => void;
  onActions: (index: number, event: React.MouseEvent) => void;
}

const TrackRow: React.FC<TrackRowProps> = React.memo(
  ({ track, index, variant, selected, canHover, onSelect, onPlay, onActions }) => {
    const isCurrent = usePlayerStore((s) => s.currentTrack?.id === track.id);
    const isPlaying = usePlayerStore((s) => s.currentTrack?.id === track.id && s.status === 'playing');
    const isOffline = useOfflineStore((s) => s.offlineIds.has(track.id));
    const progress = useOfflineStore((s) => s.progress[track.id]);
    const togglePlay = usePlayerStore((s) => s.togglePlay);

    const showCover = variant !== 'album';

    return (
      <div
        role="row"
        tabIndex={0}
        aria-selected={selected}
        data-variant={variant}
        onClick={(event) => {
          if (!canHover) onPlay(index);
          else onSelect(index, event);
        }}
        onDoubleClick={() => canHover && onPlay(index)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onPlay(index);
        }}
        onContextMenu={(event) => onActions(index, event)}
        className={[
          'sp-track-grid lazy-row group h-14 select-none rounded-[4px] outline-none',
          selected ? 'bg-white/30' : 'hover:bg-white/10 focus-visible:bg-white/10',
        ].join(' ')}
      >
        {/* # vira play no hover; a faixa atual mostra o equalizador. */}
        <div role="gridcell" className="sp-col-index relative items-center justify-end text-base tabular-nums text-sp-subdued">
          {isPlaying ? (
            <span className="group-hover:hidden">
              <Equalizer />
            </span>
          ) : (
            <span className={`group-hover:hidden ${isCurrent ? 'text-sp-green' : ''}`}>{index + 1}</span>
          )}
          <button
            type="button"
            aria-label={isPlaying ? `Pausar ${track.title}` : `Tocar ${track.title}`}
            onClick={(event) => {
              event.stopPropagation();
              if (isCurrent) void togglePlay();
              else onPlay(index);
            }}
            className="absolute right-0 hidden text-white group-hover:block"
          >
            {isPlaying ? (
              <Pause size={14} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={14} fill="currentColor" strokeWidth={0} />
            )}
          </button>
        </div>

        <div role="gridcell" className="flex min-w-0 items-center gap-3">
          {showCover && <Cover src={apiClient.getCoverUrl(track.id)} className="h-10 w-10" iconSize={16} />}
          <div className="min-w-0">
            <div className={`truncate text-base ${isCurrent ? 'text-sp-green' : 'text-white'}`}>{track.title}</div>
            <div className="flex min-w-0 items-center gap-1 text-sm text-sp-subdued">
              {isOffline && (
                <CircleArrowDown size={14} className="shrink-0 fill-sp-green text-sp-base" aria-label="Baixada no aparelho" />
              )}
              {progress !== undefined && (
                <span className="shrink-0 text-xs text-sp-green">{Math.round(progress * 100)}%</span>
              )}
              <Link
                to={{ name: 'artist', id: track.artist_id }}
                onClick={(event) => event.stopPropagation()}
                className="truncate group-hover:text-white hover:underline"
              >
                {track.artist_name}
              </Link>
            </div>
          </div>
        </div>

        <div role="gridcell" className="sp-col-album min-w-0 text-sm text-sp-subdued">
          {track.album_id && track.album_title ? (
            <Link
              to={{ name: 'album', id: track.album_id }}
              onClick={(event) => event.stopPropagation()}
              className="truncate group-hover:text-white hover:underline"
            >
              {track.album_title}
            </Link>
          ) : (
            <span className="truncate">{track.album_title ?? ''}</span>
          )}
        </div>

        <div role="gridcell" className="flex items-center justify-end gap-3">
          <span className="text-sm tabular-nums text-sp-subdued max-[479px]:hidden">{formatDuration(track.duration_sec)}</span>
          <button
            type="button"
            aria-label={`Mais opções para ${track.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onActions(index, event);
            }}
            className={[
              'flex h-8 w-8 items-center justify-center rounded-full text-sp-subdued hover:text-white',
              canHover && !selected ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : '',
            ].join(' ')}
          >
            <MoreHorizontal size={20} />
          </button>
        </div>
      </div>
    );
  },
);

TrackRow.displayName = 'TrackRow';
