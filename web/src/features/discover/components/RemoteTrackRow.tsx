import React from 'react';
import { Check, CircleArrowDown, CircleCheck, ListMusic, MoreHorizontal, Music, User } from 'lucide-react';
import type { RemoteItem } from '../../../domain/discovery.ts';
import type { Track } from '../../../domain/track.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';
import { downloadRemote, remoteMenu } from '../remoteMenus.ts';

interface RemoteTrackRowProps {
  item: RemoteItem;
  index?: number;
  local?: Track;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

/** Linha de um resultado do YouTube: baixar com um clique, ou ver o menu completo. */
export const RemoteTrackRow: React.FC<RemoteTrackRowProps> = ({ item, index, local, selectable = false, selected = false, onToggleSelect }) => {
  const Icon = item.kind === 'playlist' ? ListMusic : item.kind === 'artist' ? User : Music;
  const open = (event: React.MouseEvent) =>
    openMenu(event, remoteMenu(item, local), {
      align: 'end',
      header: { title: item.title, subtitle: item.artist, imageUrl: item.thumbnail_url, round: item.kind === 'artist' },
    });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => (selectable ? onToggleSelect?.() : open(event))}
      onKeyDown={(event) => event.key === 'Enter' && onToggleSelect?.()}
      onContextMenu={open}
      className={`lazy-row group flex h-14 items-center gap-3 rounded-[4px] px-2 md:px-4 ${selected ? 'bg-white/20' : 'hover:bg-white/10'}`}
    >
      {index !== undefined && <span className="w-4 shrink-0 text-right text-base tabular-nums text-sp-subdued max-sm:hidden">{index}</span>}
      <span className="relative shrink-0">
        <Cover src={item.thumbnail_url || null} icon={Icon} round={item.kind === 'artist'} className="h-10 w-10" iconSize={16} />
        {selectable && (
          <span
            className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border ${
              selected ? 'border-sp-green bg-sp-green text-black' : 'border-white/60 bg-black/60'
            }`}
          >
            {selected && <Check size={10} strokeWidth={3} />}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base">{item.title}</span>
        <span className="flex min-w-0 items-center gap-1 text-sm text-sp-subdued">
          {item.in_library && <CircleCheck size={14} className="shrink-0 fill-sp-green text-black" aria-label="Já na biblioteca" />}
          <span className="truncate">
            {item.artist}
            {item.kind === 'playlist' && item.item_count > 0 ? ` • ${item.item_count} músicas` : ''}
          </span>
        </span>
      </span>
      {item.duration_sec > 0 && <span className="shrink-0 text-sm tabular-nums text-sp-subdued max-sm:hidden">{formatDuration(item.duration_sec)}</span>}
      {item.kind !== 'artist' && !selectable && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void downloadRemote(item);
          }}
          aria-label={`Baixar ${item.title} para o servidor`}
          data-tip="Baixar para o servidor"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:scale-[1.04] ${
            item.in_library ? 'text-sp-green' : 'text-sp-subdued hover:text-white'
          }`}
        >
          <CircleArrowDown size={20} />
        </button>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          open(event);
        }}
        aria-label={`Mais opções para ${item.title}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sp-subdued hover:text-white"
      >
        <MoreHorizontal size={20} />
      </button>
    </div>
  );
};
