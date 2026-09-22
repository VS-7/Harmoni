import { CircleArrowDown, ExternalLink, Eye, Mic2, Play } from 'lucide-react';
import type { RemoteItem } from '../../domain/discovery.ts';
import type { Track } from '../../domain/track.ts';
import type { MenuEntry } from '../../shared/store/menuStore.ts';
import { toast } from '../../shared/store/toastStore.ts';
import { navigate } from '../../app/router/router.ts';
import { apiClient } from '../../adapters/api/client.ts';
import { usePlayerStore } from '../player/store/playerStore.ts';

export function youtubeUrl(item: Pick<RemoteItem, 'kind' | 'id'>): string {
  switch (item.kind) {
    case 'playlist':
      return `https://www.youtube.com/playlist?list=${item.id}`;
    case 'artist':
      return `https://www.youtube.com/channel/${item.id}`;
    default:
      return `https://www.youtube.com/watch?v=${item.id}`;
  }
}

/** Enfileira no servidor (fila única com nice -n 19, Guardrail 4). */
export async function downloadRemote(item: RemoteItem): Promise<void> {
  try {
    await apiClient.submitSource({
      provider: 'youtube',
      kind: item.kind === 'playlist' ? 'playlist' : 'track',
      id: item.id,
    });
    toast(`"${item.title}" entrou na fila de download`);
  } catch (err) {
    toast((err as Error).message);
  }
}

/** Menu de um item do YouTube. `local` é a faixa da biblioteca que corresponde a ele, se houver. */
export function remoteMenu(item: RemoteItem, local?: Track): MenuEntry[] {
  const entries: MenuEntry[] = [];

  if (local) {
    entries.push({
      id: 'play',
      label: 'Tocar da biblioteca',
      icon: Play,
      onSelect: () => void usePlayerStore.getState().playQueue([local], { context: { type: 'search', id: item.id, name: 'Busca' } }),
    });
  }

  if (item.kind !== 'artist') {
    entries.push({
      id: 'download',
      label: item.kind === 'playlist' ? 'Baixar playlist para o servidor' : item.in_library ? 'Baixar de novo para o servidor' : 'Baixar para o servidor',
      icon: CircleArrowDown,
      onSelect: () => downloadRemote(item),
    });
  }

  if (item.kind === 'playlist') {
    entries.push({ id: 'open', label: 'Ver playlist', icon: Eye, onSelect: () => navigate({ name: 'remote-playlist', id: item.id }) });
  }
  if (item.kind === 'artist') {
    entries.push({ id: 'open', label: 'Ver artista', icon: Mic2, onSelect: () => navigate({ name: 'remote-artist', id: item.id }) });
  }

  entries.push(
    { kind: 'separator', id: 'sep' },
    {
      id: 'youtube',
      label: 'Abrir no YouTube',
      icon: ExternalLink,
      onSelect: () => {
        window.open(youtubeUrl(item), '_blank', 'noopener,noreferrer');
      },
    },
  );
  return entries;
}
