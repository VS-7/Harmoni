import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import type { RemoteArtist, RemoteItem } from '../../../domain/discovery.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { GlassSurface } from '../../../shared/ui/glass/index.ts';
import { RemoteItemRow } from './RemoteItemRow.tsx';
import { RemoteActionsMenu } from './RemoteActionsMenu.tsx';

interface RemoteArtistScreenProps {
  channelId: string;
  onOpenRemotePlaylist: (id: string) => void;
}

/** Página de artista remoto: populares e lançamentos (RF7.3). */
export const RemoteArtistScreen: React.FC<RemoteArtistScreenProps> = ({
  channelId,
  onOpenRemotePlaylist,
}) => {
  const [artist, setArtist] = useState<RemoteArtist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuItem, setMenuItem] = useState<RemoteItem | null>(null);

  useEffect(() => {
    void apiClient
      .getRemoteArtist(channelId)
      .then(setArtist)
      .catch((err: Error) => setError(err.message));
  }, [channelId]);

  if (error) {
    return <p className="py-12 text-center text-body text-[#ff6961]">{error}</p>;
  }
  if (!artist) {
    return <p className="py-12 text-center text-body text-[color:var(--fg-secondary)]">Carregando…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <GlassSurface radius="pill" className="w-[min(40vw,160px)]">
          {artist.thumbnail_url ? (
            <img src={artist.thumbnail_url} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center opacity-40">
              <User size={36} />
            </div>
          )}
        </GlassSurface>
        <h2 className="text-title text-on-glass">{artist.name}</h2>
        {notice && <p className="text-footnote text-[color:var(--fg-secondary)]">{notice}</p>}
      </div>

      {artist.top_tracks.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-headline">Populares</h3>
          <ul className="divide-y divide-[color:var(--separator)]">
            {artist.top_tracks.map((track) => (
              <RemoteItemRow
                key={track.id}
                item={track}
                onPrimary={() => setMenuItem(track)}
                onOpenActions={() => setMenuItem(track)}
              />
            ))}
          </ul>
        </section>
      )}

      {artist.playlists.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-headline">Álbuns e playlists</h3>
          <ul className="divide-y divide-[color:var(--separator)]">
            {artist.playlists.map((pl) => (
              <RemoteItemRow
                key={pl.id}
                item={pl}
                onPrimary={() => onOpenRemotePlaylist(pl.id)}
                onOpenActions={() => setMenuItem(pl)}
              />
            ))}
          </ul>
        </section>
      )}

      <RemoteActionsMenu
        item={menuItem}
        onClose={() => setMenuItem(null)}
        onOpenRemote={(item) => onOpenRemotePlaylist(item.id)}
        onEnqueued={setNotice}
      />
    </div>
  );
};
