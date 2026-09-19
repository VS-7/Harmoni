import React from 'react';
import {
  ArrowDownToLine,
  Check,
  Disc3,
  ListEnd,
  ListPlus,
  ListStart,
  Radio,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import { ActionSheet, type ActionItem } from '../../../shared/ui/ActionSheet.tsx';
import { apiClient } from '../../../adapters/api/client.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useOfflineStore } from '../../offline/store/offlineStore.ts';

interface TrackActionsMenuProps {
  track: Track | null;
  open: boolean;
  onClose: () => void;
  onAddToPlaylist: (track: Track) => void;
  onOpenAlbum?: (albumId: string) => void;
  onOpenArtist?: (artistId: string) => void;
  /** Presente apenas no contexto de uma playlist (RF11.2). */
  onRemoveFromPlaylist?: (track: Track) => void;
}

/** Menu de ações de uma faixa local (RF11.2). */
export const TrackActionsMenu: React.FC<TrackActionsMenuProps> = ({
  track,
  open,
  onClose,
  onAddToPlaylist,
  onOpenAlbum,
  onOpenArtist,
  onRemoveFromPlaylist,
}) => {
  const playNext = usePlayerStore((s) => s.playNext);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const startRadio = usePlayerStore((s) => s.startRadio);

  const offlineIds = useOfflineStore((s) => s.offlineIds);
  const progressMap = useOfflineStore((s) => s.progress);
  const download = useOfflineStore((s) => s.download);
  const cancel = useOfflineStore((s) => s.cancel);
  const remove = useOfflineStore((s) => s.remove);

  if (!track) return null;

  const isOffline = offlineIds.has(track.id);
  const progress = progressMap[track.id];
  const isDownloading = progress !== undefined;

  const items: ActionItem[] = [];

  if (isDownloading) {
    items.push({
      id: 'cancel-offline',
      label: 'Cancelar download',
      Icon: X,
      progress,
      keepOpen: true,
      onSelect: () => cancel(track.id),
    });
  } else if (isOffline) {
    items.push({
      id: 'remove-offline',
      label: 'Remover do aparelho',
      Icon: Check,
      onSelect: () => remove(track.id),
    });
  } else {
    items.push({
      id: 'download-offline',
      label: 'Baixar no aparelho',
      Icon: ArrowDownToLine,
      keepOpen: true,
      onSelect: () => download(track),
    });
  }

  items.push(
    { id: 'add-playlist', label: 'Adicionar à playlist', Icon: ListPlus, onSelect: () => onAddToPlaylist(track) },
    { id: 'radio', label: 'Iniciar rádio', Icon: Radio, onSelect: () => startRadio(track) },
    { id: 'play-next', label: 'Tocar a seguir', Icon: ListStart, onSelect: () => playNext(track) },
    { id: 'add-queue', label: 'Adicionar à fila', Icon: ListEnd, onSelect: () => addToQueue(track) },
  );

  if (onOpenArtist && track.artist_id) {
    items.push({
      id: 'artist',
      label: 'Ir para o artista',
      Icon: User,
      onSelect: () => onOpenArtist(track.artist_id),
    });
  }
  if (onOpenAlbum && track.album_id) {
    items.push({
      id: 'album',
      label: 'Ir para o álbum',
      Icon: Disc3,
      onSelect: () => onOpenAlbum(track.album_id as string),
    });
  }
  if (onRemoveFromPlaylist) {
    items.push({
      id: 'remove-playlist',
      label: 'Remover desta playlist',
      Icon: Trash2,
      destructive: true,
      onSelect: () => onRemoveFromPlaylist(track),
    });
  }

  return (
    <ActionSheet
      open={open}
      onClose={onClose}
      title={track.title}
      subtitle={track.artist_name}
      thumbnailUrl={apiClient.getCoverUrl(track.id)}
      items={items}
    />
  );
};
