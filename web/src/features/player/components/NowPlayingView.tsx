import React, { useEffect, useState } from 'react';
import { ChevronDown, CirclePlus, ListMusic, MoreHorizontal, Volume2, VolumeX } from 'lucide-react';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { useLayoutStore } from '../../../app/layout/layoutStore.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { useDominantColor } from '../../../shared/hooks/useDominantColor.ts';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { usePlayerStore } from '../store/playerStore.ts';
import { trackMenu } from '../../library/menus.tsx';
import { ProgressBar, TransportButtons } from './PlaybackControls.tsx';
import { QueueList } from './QueueList.tsx';

const CONTEXT_LABEL: Record<string, string> = {
  playlist: 'Tocando da playlist',
  album: 'Tocando do álbum',
  artist: 'Tocando do artista',
  station: 'Tocando da rádio',
  offline: 'Tocando de Músicas baixadas',
  search: 'Tocando da busca',
  queue: 'Tocando da fila',
};

/** Player em tela cheia do celular: degradê da capa, capa grande, controles e a fila. */
export const NowPlayingView: React.FC = () => {
  const open = useLayoutStore((s) => s.nowPlayingOpen);
  const setOpen = useLayoutStore((s) => s.setNowPlayingOpen);
  const track = usePlayerStore((s) => s.currentTrack);
  const context = usePlayerStore((s) => s.context);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const [showQueue, setShowQueue] = useState(false);
  const color = useDominantColor(track ? apiClient.getCoverUrl(track.id) : null, '#404040');

  useEffect(() => {
    if (!open) setShowQueue(false);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Navegar para outra tela (artista, álbum) fecha o player.
  const close = () => setOpen(false);

  if (!open || !track) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tocando agora"
      className="fixed inset-0 z-[60] flex animate-sp-up flex-col px-6 pt-[calc(var(--safe-top)+8px)] pb-[max(var(--safe-bottom),16px)]"
      style={{ backgroundColor: color, backgroundImage: 'linear-gradient(rgba(0,0,0,0.1), #121212 85%)' }}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2">
        <button type="button" onClick={close} aria-label="Fechar o player" className="-ml-2 flex h-10 w-10 items-center justify-center">
          <ChevronDown size={28} />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/80">
            {showQueue ? 'Fila' : context ? CONTEXT_LABEL[context.type] : 'Tocando agora'}
          </p>
          {!showQueue && context && <p className="truncate text-sm font-bold">{context.name}</p>}
        </div>
        <button
          type="button"
          aria-label="Mais opções"
          onClick={(event) =>
            openMenu(event, trackMenu([track]), {
              header: { title: track.title, subtitle: track.artist_name, imageUrl: apiClient.getCoverUrl(track.id) },
            })
          }
          className="-mr-2 flex h-10 w-10 items-center justify-center"
        >
          <MoreHorizontal size={24} />
        </button>
      </header>

      {showQueue ? (
        <div className="sp-scroll -mx-4 mt-2 flex-1">
          <QueueList />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center py-6">
          <Cover
            src={apiClient.getCoverUrl(track.id)}
            className="aspect-square w-full max-w-[min(100%,calc(100dvh-420px),420px)] rounded-lg"
            iconSize={72}
            shadow
            loading="eager"
          />
        </div>
      )}

      <div className="shrink-0">
        <div className="mb-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xl font-bold">{track.title}</p>
            <Link to={{ name: 'artist', id: track.artist_id }} onClick={close} className="block truncate text-base text-white/70">
              {track.artist_name}
            </Link>
          </div>
          <button
            type="button"
            aria-label="Adicionar à playlist"
            onClick={(event) => openMenu(event, trackMenu([track]), { header: { title: track.title, subtitle: track.artist_name } })}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-white/80"
          >
            <CirclePlus size={26} />
          </button>
        </div>
        <ProgressBar layout="stacked" />
        <div className="mt-3">
          <TransportButtons size="full" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Com som' : 'Sem som'} className="flex h-10 w-10 items-center justify-center text-white/80">
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button
            type="button"
            onClick={() => setShowQueue((v) => !v)}
            aria-label="Fila"
            aria-pressed={showQueue}
            className={`flex h-10 w-10 items-center justify-center ${showQueue ? 'text-sp-green' : 'text-white/80'}`}
          >
            <ListMusic size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
