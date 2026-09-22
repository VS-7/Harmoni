import React, { useMemo } from 'react';
import { Disc3, MoreHorizontal, Shuffle } from 'lucide-react';
import type { PlaybackContext } from '../../../domain/player.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { Cover } from '../../../shared/components/Cover.tsx';
import { EntityPage, Dot } from '../../../shared/components/EntityPage.tsx';
import { EmptyPage, LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { PlayButton } from '../../../shared/components/PlayButton.tsx';
import { Shelf } from '../../../shared/components/Shelf.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { useAsync } from '../../../shared/hooks/useAsync.ts';
import { useDominantColor } from '../../../shared/hooks/useDominantColor.ts';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { fallbackColor } from '../../../shared/utils/color.ts';
import { formatLongDuration, pluralize } from '../../../shared/utils/formatters.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useContextPlayback } from '../../player/hooks/useContextPlayback.ts';
import { DownloadToggle } from '../../offline/components/DownloadToggle.tsx';
import { AlbumCard } from '../../home/components/HomeCards.tsx';
import { useLibraryStore } from '../store/libraryStore.ts';
import { albumMenu } from '../menus.tsx';
import { TrackTable } from './TrackTable.tsx';

export const AlbumPage: React.FC<{ albumId: string }> = ({ albumId }) => {
  const { data, error } = useAsync(() => apiClient.getAlbum(albumId), [albumId]);
  const allAlbums = useLibraryStore((s) => s.albums);
  const album = data?.album;
  const tracks = useMemo(() => data?.tracks ?? [], [data]);
  const context = useMemo<PlaybackContext | null>(
    () => (album ? { type: 'album', id: album.id, name: album.title } : null),
    [album],
  );
  const playback = useContextPlayback(context, tracks);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const coverUrl = apiClient.getAlbumCoverUrl(albumId);
  const color = useDominantColor(coverUrl, fallbackColor(albumId));
  useDocumentTitle(album?.title);

  if (error && !data) return <EmptyPage icon={Disc3} title="Álbum não encontrado" description={error} />;

  const artistName = album?.artist_name || tracks[0]?.artist_name || '';
  const artistId = album?.artist_id || tracks[0]?.artist_id;
  const duration = tracks.reduce((sum, t) => sum + t.duration_sec, 0);
  const moreByArtist = allAlbums.filter((a) => a.artist_id === artistId && a.id !== albumId);

  return (
    <EntityPage
      color={album ? color : fallbackColor(albumId)}
      image={<Cover src={coverUrl} icon={Disc3} className="aspect-square w-full" iconSize={64} shadow loading="eager" />}
      kind="Álbum"
      title={album?.title ?? ''}
      meta={
        album && (
          <>
            {artistId && (
              <Cover src={apiClient.getArtistCoverUrl(artistId)} round className="mr-1 h-6 w-6" iconSize={12} />
            )}
            {artistId ? (
              <Link to={{ name: 'artist', id: artistId }} className="font-bold hover:underline">
                {artistName}
              </Link>
            ) : (
              <span className="font-bold">{artistName}</span>
            )}
            {album.year ? (
              <>
                <Dot />
                <span className="text-white/70">{album.year}</span>
              </>
            ) : null}
            <Dot />
            <span>{pluralize(tracks.length, 'música', 'músicas')},</span>
            <span className="text-white/70">{formatLongDuration(duration)}</span>
          </>
        )
      }
      stickyAction={album && tracks.length > 0 ? <PlayButton playing={playback.isPlaying} label={album.title} onClick={playback.toggle} /> : undefined}
      actions={
        album && (
          <>
            <PlayButton size="lg" playing={playback.isPlaying} label={album.title} onClick={playback.toggle} disabled={tracks.length === 0} />
            <IconButton label={shuffle ? 'Desativar a ordem aleatória' : 'Ativar a ordem aleatória'} active={shuffle} showDot size="lg" onClick={toggleShuffle}>
              <Shuffle size={28} />
            </IconButton>
            <DownloadToggle batchId={`album:${album.id}`} tracks={tracks} label={album.title} />
            <IconButton
              label={`Mais opções para ${album.title}`}
              size="lg"
              onClick={(event) => openMenu(event, albumMenu(album), { header: { title: album.title, subtitle: artistName } })}
            >
              <MoreHorizontal size={28} />
            </IconButton>
          </>
        )
      }
    >
      {!data ? (
        <LoadingDots />
      ) : (
        <>
          <TrackTable tracks={tracks} context={context} variant="album" />
          {moreByArtist.length > 0 && (
            <div className="mt-10 px-1 md:px-3">
              <Shelf title={`Mais de ${artistName}`} to={artistId ? { name: 'artist', id: artistId } : undefined}>
                {moreByArtist.map((a) => (
                  <AlbumCard key={a.id} album={a} />
                ))}
              </Shelf>
            </div>
          )}
        </>
      )}
    </EntityPage>
  );
};
