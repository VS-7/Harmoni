import React from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { Cover } from '../../../shared/components/Cover.tsx';
import { Equalizer } from '../../../shared/components/Equalizer.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { usePlayerStore } from '../store/playerStore.ts';
import { routeForContext } from '../contextLoader.ts';
import { trackMenu } from '../../library/menus.tsx';

const QueueRow: React.FC<{ track: Track; index: number; current?: boolean; playing?: boolean }> = ({
  track,
  index,
  current = false,
  playing = false,
}) => {
  const playFromQueue = usePlayerStore((s) => s.playFromQueue);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !current && void playFromQueue(index)}
      onKeyDown={(event) => event.key === 'Enter' && !current && void playFromQueue(index)}
      onContextMenu={(event) => openMenu(event, trackMenu([track]), { header: { title: track.title, subtitle: track.artist_name } })}
      className="group flex items-center gap-3 rounded-md p-2 hover:bg-white/10"
    >
      <span className="relative shrink-0">
        <Cover src={apiClient.getCoverUrl(track.id)} className="h-12 w-12" iconSize={18} />
        {playing && (
          <span className="absolute inset-0 flex items-center justify-center rounded bg-black/50">
            <Equalizer />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-base ${current ? 'text-sp-green' : 'text-white'}`}>{track.title}</span>
        <span className="block truncate text-sm text-sp-subdued">{track.artist_name}</span>
      </span>
      {!current && (
        <button
          type="button"
          aria-label={`Remover ${track.title} da fila`}
          onClick={(event) => {
            event.stopPropagation();
            removeFromQueue(index);
          }}
          className="h-8 w-8 shrink-0 items-center justify-center rounded-full text-sp-subdued hover:text-white [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:flex [@media(hover:hover)]:group-focus-within:flex flex"
        >
          <X size={16} />
        </button>
      )}
      <button
        type="button"
        aria-label={`Mais opções para ${track.title}`}
        onClick={(event) => {
          event.stopPropagation();
          openMenu(event, trackMenu([track]), { align: 'end', header: { title: track.title, subtitle: track.artist_name } });
        }}
        className="h-8 w-8 shrink-0 items-center justify-center rounded-full text-sp-subdued hover:text-white [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:flex [@media(hover:hover)]:group-focus-within:flex flex"
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
};

/** "Tocando agora", "Próximas na fila" e "Próximas de: <contexto>". */
export const QueueList: React.FC = () => {
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const queuedAhead = usePlayerStore((s) => s.queuedAhead);
  const context = usePlayerStore((s) => s.context);
  const status = usePlayerStore((s) => s.status);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const current = queue[queueIndex];

  if (!current) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-xl font-bold">Adicione músicas à fila</p>
        <p className="mt-2 text-sm text-sp-subdued">Use "Adicionar à fila" no menu de qualquer música.</p>
      </div>
    );
  }

  const manual = queue.slice(queueIndex + 1, queueIndex + 1 + queuedAhead);
  const rest = queue.slice(queueIndex + 1 + queuedAhead);
  const contextRoute = context ? routeForContext(context) : null;

  return (
    <div className="flex flex-col gap-6 px-2 pb-6">
      <section>
        <h3 className="px-2 pb-2 text-base font-bold">Tocando agora</h3>
        <QueueRow track={current} index={queueIndex} current playing={status === 'playing'} />
      </section>

      {manual.length > 0 && (
        <section>
          <h3 className="px-2 pb-2 text-base font-bold">Próximas na fila</h3>
          {manual.map((track, i) => (
            <QueueRow key={`${track.id}-m${i}`} track={track} index={queueIndex + 1 + i} />
          ))}
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <h3 className="min-w-0 truncate text-base font-bold">
              Próximas de:{' '}
              {context && contextRoute ? (
                <Link to={contextRoute} className="hover:underline">
                  {context.name}
                </Link>
              ) : (
                (context?.name ?? 'Fila')
              )}
            </h3>
            <button type="button" onClick={clearQueue} className="shrink-0 text-sm font-bold text-sp-subdued hover:text-white hover:underline">
              Limpar fila
            </button>
          </div>
          {rest.slice(0, 80).map((track, i) => (
            <QueueRow key={`${track.id}-r${i}`} track={track} index={queueIndex + 1 + queuedAhead + i} />
          ))}
        </section>
      )}
    </div>
  );
};
