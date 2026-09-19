import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, ListMusic } from 'lucide-react';
import type { RemoteItem, RemotePlaylist } from '../../../domain/discovery.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { GlassButton, GlassSurface } from '../../../shared/ui/glass/index.ts';
import { RemoteItemRow } from './RemoteItemRow.tsx';
import { RemoteActionsMenu } from './RemoteActionsMenu.tsx';

interface RemotePlaylistScreenProps {
  playlistId: string;
  onOpenRemoteArtist: (id: string) => void;
}

/** Detalhe de uma playlist remota (RF7.2). */
export const RemotePlaylistScreen: React.FC<RemotePlaylistScreenProps> = ({
  playlistId,
  onOpenRemoteArtist,
}) => {
  const [playlist, setPlaylist] = useState<RemotePlaylist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<RemoteItem | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void apiClient
      .getRemotePlaylist(playlistId)
      .then(setPlaylist)
      .catch((err: Error) => setError(err.message));
  }, [playlistId]);

  async function downloadAll() {
    setSending(true);
    try {
      await apiClient.submitSource({ provider: 'youtube', kind: 'playlist', id: playlistId });
      setNotice('Playlist enviada para a fila de download');
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return <p className="py-12 text-center text-body text-[#ff6961]">{error}</p>;
  }
  if (!playlist) {
    return <p className="py-12 text-center text-body text-[color:var(--fg-secondary)]">Carregando…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <GlassSurface radius="md" className="w-[min(55vw,220px)]">
          {playlist.thumbnail_url ? (
            <img src={playlist.thumbnail_url} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center opacity-40">
              <ListMusic size={40} />
            </div>
          )}
        </GlassSurface>
        <div>
          <h2 className="text-title text-on-glass">{playlist.title}</h2>
          <p className="text-footnote text-[color:var(--fg-secondary)]">
            {playlist.artist} · {playlist.item_count} faixas
          </p>
        </div>
        <GlassButton size="md" shape="label" onClick={() => void downloadAll()} disabled={sending}>
          <ArrowDownToLine size={16} />
          {sending ? 'Enviando…' : 'Baixar tudo'}
        </GlassButton>
        {notice && <p className="text-footnote text-[color:var(--fg-secondary)]">{notice}</p>}
      </div>

      <ul className="divide-y divide-[color:var(--separator)]">
        {playlist.tracks.map((track) => (
          <RemoteItemRow
            key={track.id}
            item={track}
            onPrimary={() => setMenuItem(track)}
            onOpenActions={() => setMenuItem(track)}
          />
        ))}
      </ul>

      <RemoteActionsMenu
        item={menuItem}
        onClose={() => setMenuItem(null)}
        onOpenRemote={(item) => onOpenRemoteArtist(item.id)}
        onEnqueued={setNotice}
      />
    </div>
  );
};
