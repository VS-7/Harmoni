import React from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { useLayoutStore } from '../../../app/layout/layoutStore.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { usePlayerStore } from '../store/playerStore.ts';
import { routeForContext } from '../contextLoader.ts';
import { trackMenu } from '../../library/menus.tsx';
import { QueueList } from './QueueList.tsx';

const PanelHeader: React.FC<{ title: React.ReactNode; onClose: () => void; actions?: React.ReactNode }> = ({ title, onClose, actions }) => (
  <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
    <h2 className="min-w-0 truncate text-base font-bold">{title}</h2>
    <div className="flex items-center gap-1">
      {actions}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="flex h-8 w-8 items-center justify-center rounded-full text-sp-subdued hover:bg-sp-elevated hover:text-white"
      >
        <X size={18} />
      </button>
    </div>
  </div>
);

/** "Tocando agora": capa grande, título e a próxima da fila. */
const NowPlaying: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const track = usePlayerStore((s) => s.currentTrack);
  const context = usePlayerStore((s) => s.context);
  const next = usePlayerStore((s) => s.queue[s.queueIndex + 1]);
  const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);
  const contextRoute = context ? routeForContext(context) : null;

  return (
    <>
      <PanelHeader
        title={context && contextRoute ? <Link to={contextRoute} className="hover:underline">{context.name}</Link> : 'Tocando agora'}
        onClose={onClose}
        actions={
          track && (
            <button
              type="button"
              aria-label="Mais opções"
              onClick={(event) => openMenu(event, trackMenu([track]), { align: 'end' })}
              className="flex h-8 w-8 items-center justify-center rounded-full text-sp-subdued hover:bg-sp-elevated hover:text-white"
            >
              <MoreHorizontal size={18} />
            </button>
          )
        }
      />
      {track ? (
        <div className="sp-scroll flex-1 px-4 pb-4">
          <Cover src={apiClient.getCoverUrl(track.id)} className="aspect-square w-full rounded-lg" iconSize={64} shadow loading="eager" />
          <div className="mt-4 min-w-0">
            <p className="truncate text-2xl font-bold">{track.title}</p>
            <Link to={{ name: 'artist', id: track.artist_id }} className="block truncate text-base text-sp-subdued hover:text-white hover:underline">
              {track.artist_name}
            </Link>
          </div>
          <div className="mt-6 rounded-lg bg-sp-elevated p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold">Próxima na fila</p>
              <button type="button" onClick={() => toggleRightPanel('queue')} className="text-sm font-bold text-sp-subdued hover:text-white hover:underline">
                Abrir fila
              </button>
            </div>
            {next ? (
              <div className="flex items-center gap-3">
                <Cover src={apiClient.getCoverUrl(next.id)} className="h-12 w-12" iconSize={18} />
                <div className="min-w-0">
                  <p className="truncate">{next.title}</p>
                  <p className="truncate text-sm text-sp-subdued">{next.artist_name}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-sp-subdued">Nada na fila depois desta.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="px-4 text-sm text-sp-subdued">Nada tocando.</p>
      )}
    </>
  );
};

/** Coluna direita do desktop: fila ou "Tocando agora". */
export const RightPanel: React.FC = () => {
  const panel = useLayoutStore((s) => s.rightPanel);
  const close = useLayoutStore((s) => s.closeRightPanel);
  if (!panel) return null;

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-sp-base" aria-label={panel === 'queue' ? 'Fila' : 'Tocando agora'}>
      {panel === 'queue' ? (
        <>
          <PanelHeader title="Fila" onClose={close} />
          <div className="sp-scroll flex-1">
            <QueueList />
          </div>
        </>
      ) : (
        <NowPlaying onClose={close} />
      )}
    </aside>
  );
};
