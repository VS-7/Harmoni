import React from 'react';
import { Check, ListMusic, MoreHorizontal, Music, User } from 'lucide-react';
import type { RemoteItem } from '../../../domain/discovery.ts';
import { GlassButton } from '../../../shared/ui/glass/index.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';

interface RemoteItemRowProps {
  item: RemoteItem;
  selected?: boolean;
  selectable?: boolean;
  onPrimary: () => void;
  onOpenActions: () => void;
}

export const RemoteItemRow: React.FC<RemoteItemRowProps> = ({
  item,
  selected = false,
  selectable = false,
  onPrimary,
  onOpenActions,
}) => {
  const Icon = item.kind === 'playlist' ? ListMusic : item.kind === 'artist' ? User : Music;

  return (
    <li className="list-row">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrimary}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 text-left"
        >
          <span className="relative shrink-0">
            {item.thumbnail_url ? (
              <img
                src={item.thumbnail_url}
                alt=""
                loading="lazy"
                className={`h-11 w-11 object-cover ${item.kind === 'artist' ? 'rounded-full' : 'rounded-lg'}`}
              />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[color:var(--glass-scrim)] opacity-50">
                <Icon size={18} />
              </span>
            )}
            {selectable && (
              <span
                className={[
                  'absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full',
                  'border border-[color:var(--separator-strong)]',
                  selected ? 'bg-[color:var(--fg)]' : 'bg-[color:var(--glass-scrim)]',
                ].join(' ')}
              >
                {selected && <Check size={10} className="text-[color:var(--bg)]" />}
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-body">{item.title}</span>
              {/* Já na biblioteca: marca monocromática, sem cor semântica (RF9.2). */}
              {item.in_library && (
                <Check size={12} className="shrink-0 opacity-60" aria-label="Já na biblioteca" />
              )}
            </span>
            <span className="block truncate text-footnote text-[color:var(--fg-secondary)]">
              {item.artist}
              {item.kind === 'playlist' && item.item_count > 0 ? ` · ${item.item_count} faixas` : ''}
              {item.kind === 'track' && item.duration_sec > 0
                ? ` · ${formatDuration(item.duration_sec)}`
                : ''}
            </span>
          </span>
        </button>

        <GlassButton
          size="sm"
          variant="light"
          onClick={onOpenActions}
          aria-label={`Ações de ${item.title}`}
        >
          <MoreHorizontal size={16} />
        </GlassButton>
      </div>
    </li>
  );
};
