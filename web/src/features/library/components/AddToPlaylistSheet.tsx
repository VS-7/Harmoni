import React, { useEffect, useState } from 'react';
import { ListMusic } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import type { Playlist } from '../../../domain/playlist.ts';
import { ActionSheet, type ActionItem } from '../../../shared/ui/ActionSheet.tsx';
import { apiClient } from '../../../adapters/api/client.ts';

interface AddToPlaylistSheetProps {
  track: Track | null;
  /** Opcional: sem ela a sheet busca as playlists por conta própria. */
  playlists?: Playlist[];
  onClose: () => void;
  onCreated?: () => void;
}

/** Escolha da playlist de destino, reaproveitando o mesmo menu de vidro (RF11.2). */
export const AddToPlaylistSheet: React.FC<AddToPlaylistSheetProps> = ({
  track,
  playlists,
  onClose,
  onCreated,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState<Playlist[]>([]);

  const needsFetch = playlists === undefined;
  useEffect(() => {
    if (!track || !needsFetch) return;
    void apiClient
      .listPlaylists()
      .then(setFetched)
      .catch(() => setFetched([]));
  }, [track, needsFetch]);

  if (!track) return null;

  const available = playlists ?? fetched;
  const items: ActionItem[] = available
    .filter((pl) => !pl.isSmart)
    .map((pl) => ({
      id: pl.id,
      label: pl.name,
      Icon: ListMusic,
      onSelect: async () => {
        try {
          await apiClient.addTrackToPlaylist(pl.id, track.id);
          onCreated?.();
        } catch (err) {
          setError((err as Error).message);
        }
      },
    }));

  return (
    <>
      <ActionSheet
        open
        onClose={onClose}
        title="Adicionar à playlist"
        subtitle={error ?? track.title}
        thumbnailUrl={apiClient.getCoverUrl(track.id)}
        items={
          items.length > 0
            ? items
            : [
                {
                  id: 'empty',
                  label: 'Nenhuma playlist manual ainda',
                  Icon: ListMusic,
                  disabled: true,
                  onSelect: () => undefined,
                },
              ]
        }
      />
    </>
  );
};
