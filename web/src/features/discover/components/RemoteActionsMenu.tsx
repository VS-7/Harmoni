import React from 'react';
import { ArrowDownToLine, ExternalLink, Eye, Play, Smartphone } from 'lucide-react';
import type { RemoteItem } from '../../../domain/discovery.ts';
import { ActionSheet, type ActionItem } from '../../../shared/ui/ActionSheet.tsx';
import { apiClient } from '../../../adapters/api/client.ts';

interface RemoteActionsMenuProps {
  item: RemoteItem | null;
  onClose: () => void;
  onOpenRemote: (item: RemoteItem) => void;
  onEnqueued: (message: string) => void;
  onPlayLocal?: (item: RemoteItem) => void;
  onSaveOffline?: (item: RemoteItem) => void;
}

function youtubeUrl(item: RemoteItem): string {
  switch (item.kind) {
    case 'playlist':
      return `https://www.youtube.com/playlist?list=${item.id}`;
    case 'artist':
      return `https://www.youtube.com/channel/${item.id}`;
    default:
      return `https://www.youtube.com/watch?v=${item.id}`;
  }
}

/** Menu do item remoto da busca (RF11.2). */
export const RemoteActionsMenu: React.FC<RemoteActionsMenuProps> = ({
  item,
  onClose,
  onOpenRemote,
  onEnqueued,
  onPlayLocal,
  onSaveOffline,
}) => {
  if (!item) return null;

  const items: ActionItem[] = [];

  if (item.kind !== 'artist') {
    items.push({
      id: 'download-server',
      label: item.kind === 'playlist' ? 'Baixar playlist para o servidor' : 'Baixar para o servidor',
      Icon: ArrowDownToLine,
      onSelect: async () => {
        try {
          await apiClient.submitSource({
            provider: 'youtube',
            kind: item.kind === 'playlist' ? 'playlist' : 'track',
            id: item.id,
          });
          onEnqueued(`"${item.title}" entrou na fila de download`);
        } catch (err) {
          onEnqueued((err as Error).message);
        }
      },
    });
  }

  if (item.kind !== 'track') {
    items.push({
      id: 'open-remote',
      label: item.kind === 'playlist' ? 'Ver playlist' : 'Ver artista',
      Icon: Eye,
      onSelect: () => onOpenRemote(item),
    });
  }

  // Item já indexado localmente ganha as ações de faixa da biblioteca (RF11.2).
  if (item.in_library && item.kind === 'track') {
    if (onPlayLocal) {
      items.push({ id: 'play', label: 'Tocar', Icon: Play, onSelect: () => onPlayLocal(item) });
    }
    if (onSaveOffline) {
      items.push({
        id: 'offline',
        label: 'Baixar no aparelho',
        Icon: Smartphone,
        onSelect: () => onSaveOffline(item),
      });
    }
  }

  items.push({
    id: 'open-youtube',
    label: 'Abrir no YouTube',
    Icon: ExternalLink,
    onSelect: () => {
      window.open(youtubeUrl(item), '_blank', 'noopener,noreferrer');
    },
  });

  return (
    <ActionSheet
      open
      onClose={onClose}
      title={item.title}
      subtitle={item.artist}
      thumbnailUrl={item.thumbnail_url}
      items={items}
    />
  );
};
