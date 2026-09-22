import React from 'react';
import { CircleArrowDown, ExternalLink, ListMusic, Loader2, Mic2 } from 'lucide-react';
import { apiClient } from '../../../adapters/api/client.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { EntityPage, Dot } from '../../../shared/components/EntityPage.tsx';
import { EmptyPage, LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { MediaCard } from '../../../shared/components/MediaCard.tsx';
import { PillButton } from '../../../shared/components/Modal.tsx';
import { Shelf } from '../../../shared/components/Shelf.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { useAsync } from '../../../shared/hooks/useAsync.ts';
import { useDominantColor } from '../../../shared/hooks/useDominantColor.ts';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { fallbackColor } from '../../../shared/utils/color.ts';
import { pluralize } from '../../../shared/utils/formatters.ts';
import { downloadRemote, remoteMenu, youtubeUrl } from '../remoteMenus.ts';
import { RemoteTrackRow } from './RemoteTrackRow.tsx';

/** Detalhe de uma playlist do YouTube (RF7.2): baixar tudo ou faixa a faixa. */
export const RemotePlaylistPage: React.FC<{ playlistId: string }> = ({ playlistId }) => {
  const { data: playlist, error } = useAsync(() => apiClient.getRemotePlaylist(playlistId), [playlistId]);
  const [sending, setSending] = React.useState(false);
  const color = useDominantColor(playlist?.thumbnail_url || null, fallbackColor(playlistId));
  useDocumentTitle(playlist?.title);

  if (error) return <EmptyPage icon={ListMusic} title="Não foi possível abrir esta playlist" description={error} />;
  if (!playlist) return <LoadingDots />;

  const item = { id: playlist.id, kind: 'playlist' as const, title: playlist.title, artist: playlist.artist, duration_sec: 0, thumbnail_url: playlist.thumbnail_url, item_count: playlist.item_count, in_library: false };
  const inLibrary = playlist.tracks.filter((t) => t.in_library).length;

  return (
    <EntityPage
      color={color}
      image={<Cover src={playlist.thumbnail_url || null} icon={ListMusic} className="aspect-square w-full" iconSize={64} shadow loading="eager" />}
      kind="Playlist do YouTube"
      title={playlist.title}
      meta={
        <>
          <span className="font-bold">{playlist.artist}</span>
          <Dot />
          <span>{pluralize(playlist.item_count || playlist.tracks.length, 'música', 'músicas')}</span>
          {inLibrary > 0 && <span className="text-white/70">, {inLibrary} já na biblioteca</span>}
        </>
      }
      actions={
        <>
          <PillButton
            variant="green"
            disabled={sending}
            onClick={async () => {
              setSending(true);
              await downloadRemote(item);
              setSending(false);
            }}
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <CircleArrowDown size={18} />}
            Baixar tudo para o servidor
          </PillButton>
          <IconButton label="Abrir no YouTube" size="lg" onClick={() => window.open(youtubeUrl(item), '_blank', 'noopener,noreferrer')}>
            <ExternalLink size={24} />
          </IconButton>
        </>
      }
    >
      <div className="px-2 md:px-4">
        {playlist.tracks.map((track, index) => (
          <RemoteTrackRow key={`${track.id}-${index}`} item={track} index={index + 1} />
        ))}
      </div>
    </EntityPage>
  );
};

/** Página de artista do YouTube (RF7.3): populares e lançamentos. */
export const RemoteArtistPage: React.FC<{ channelId: string }> = ({ channelId }) => {
  const { data: artist, error } = useAsync(() => apiClient.getRemoteArtist(channelId), [channelId]);
  const color = useDominantColor(artist?.thumbnail_url || null, fallbackColor(channelId));
  useDocumentTitle(artist?.name);

  if (error) return <EmptyPage icon={Mic2} title="Não foi possível abrir este artista" description={error} />;
  if (!artist) return <LoadingDots />;

  return (
    <EntityPage
      color={color}
      image={<Cover src={artist.thumbnail_url || null} icon={Mic2} round className="aspect-square w-full" iconSize={64} shadow loading="eager" />}
      kind="Artista no YouTube"
      title={artist.name}
      meta={<span>{pluralize(artist.top_tracks.length, 'música popular', 'músicas populares')}</span>}
      actions={
        <IconButton
          label="Abrir no YouTube"
          size="lg"
          onClick={() => window.open(youtubeUrl({ kind: 'artist', id: artist.id }), '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink size={24} />
        </IconButton>
      }
    >
      <div className="flex flex-col gap-10">
        {artist.top_tracks.length > 0 && (
          <section>
            <h2 className="mb-2 px-4 text-2xl font-bold md:px-6">Populares</h2>
            <div className="px-2 md:px-4">
              {artist.top_tracks.map((track, index) => (
                <RemoteTrackRow key={track.id} item={track} index={index + 1} />
              ))}
            </div>
          </section>
        )}
        {artist.playlists.length > 0 && (
          <div className="px-1 md:px-3">
            <Shelf title="Álbuns e playlists">
              {artist.playlists.map((pl) => (
                <MediaCard
                  key={pl.id}
                  to={{ name: 'remote-playlist', id: pl.id }}
                  title={pl.title}
                  subtitle={pl.item_count > 0 ? pluralize(pl.item_count, 'música', 'músicas') : 'Playlist'}
                  image={<Cover src={pl.thumbnail_url || null} className="aspect-square w-full" iconSize={40} shadow />}
                  onContextMenu={(event) => openMenu(event, remoteMenu(pl), { header: { title: pl.title } })}
                />
              ))}
            </Shelf>
          </div>
        )}
      </div>
    </EntityPage>
  );
};
