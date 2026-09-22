import React, { useMemo } from 'react';
import { ListMusic, MoreHorizontal, Shuffle } from 'lucide-react';
import type { PlaybackContext } from '../../../domain/player.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { EntityPage, Dot } from '../../../shared/components/EntityPage.tsx';
import { EmptyPage, LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { PlayButton } from '../../../shared/components/PlayButton.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { useAsync } from '../../../shared/hooks/useAsync.ts';
import { useDominantColor } from '../../../shared/hooks/useDominantColor.ts';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { fallbackColor } from '../../../shared/utils/color.ts';
import { formatLongDuration, pluralize } from '../../../shared/utils/formatters.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useContextPlayback } from '../../player/hooks/useContextPlayback.ts';
import { DownloadToggle } from '../../offline/components/DownloadToggle.tsx';
import { useLibraryStore } from '../store/libraryStore.ts';
import { editPlaylistDetails, playlistMenu } from '../menus.tsx';
import { PlaylistCover } from './Covers.tsx';
import { PlaylistExtras } from './PlaylistExtras.tsx';
import { TrackTable } from './TrackTable.tsx';

export const PlaylistPage: React.FC<{ playlistId: string }> = ({ playlistId }) => {
  const version = useLibraryStore((s) => s.version);
  const summary = useLibraryStore((s) => s.playlists.find((pl) => pl.id === playlistId));
  const { data: playlist, error, loading } = useAsync(() => apiClient.getPlaylist(playlistId), [playlistId, version]);
  const tracks = useMemo(() => playlist?.tracks ?? [], [playlist]);
  const context = useMemo<PlaybackContext | null>(
    () => (playlist ? { type: 'playlist', id: playlist.id, name: playlist.name } : null),
    [playlist],
  );
  const playback = useContextPlayback(context, tracks);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const firstCover = playlist?.coverTrackIds?.[0];
  const color = useDominantColor(firstCover ? apiClient.getCoverUrl(firstCover) : null, fallbackColor(playlistId));
  useDocumentTitle(playlist?.name ?? summary?.name);

  if (error && !playlist) {
    return <EmptyPage icon={ListMusic} title="Playlist não encontrada" description={error} />;
  }

  if (!playlist) {
    return (
      <EntityPage
        color={fallbackColor(playlistId)}
        image={<PlaylistCover playlist={summary ?? { isSmart: false }} className="aspect-square w-full" iconSize={64} shadow />}
        kind="Playlist"
        title={summary?.name ?? ''}
      >
        {loading && <LoadingDots />}
      </EntityPage>
    );
  }

  // As ações do menu usam a versão da lista (com a pasta), que a página de detalhe não traz.
  const menuTarget = { ...playlist, folderId: summary?.folderId ?? playlist.folderId ?? null };
  const edit = () => editPlaylistDetails(menuTarget);

  return (
    <EntityPage
      color={color}
      image={
        <button type="button" onClick={edit} aria-label="Editar detalhes" className="block w-full">
          <PlaylistCover playlist={playlist} className="aspect-square w-full" iconSize={64} shadow />
        </button>
      }
      kind={playlist.isSmart ? 'Playlist inteligente' : 'Playlist'}
      title={playlist.name}
      onTitleClick={edit}
      description={playlist.description || undefined}
      meta={
        <>
          <span className="font-bold">Harmoni</span>
          <Dot />
          <span>
            {pluralize(tracks.length, 'música', 'músicas')}
            {tracks.length > 0 && ','}
          </span>
          {tracks.length > 0 && <span className="text-white/70">{formatLongDuration(playlist.duration)}</span>}
        </>
      }
      stickyAction={
        tracks.length > 0 ? <PlayButton playing={playback.isPlaying} label={playlist.name} onClick={playback.toggle} /> : undefined
      }
      actions={
        <>
          {tracks.length > 0 && (
            <>
              <PlayButton size="lg" playing={playback.isPlaying} label={playlist.name} onClick={playback.toggle} />
              <IconButton
                label={shuffle ? 'Desativar a ordem aleatória' : 'Ativar a ordem aleatória'}
                active={shuffle}
                showDot
                size="lg"
                onClick={toggleShuffle}
              >
                <Shuffle size={28} />
              </IconButton>
              <DownloadToggle batchId={`playlist:${playlist.id}`} tracks={tracks} label={playlist.name} />
            </>
          )}
          <IconButton
            label={`Mais opções para ${playlist.name}`}
            size="lg"
            onClick={(event) => openMenu(event, playlistMenu(menuTarget), { header: { title: playlist.name, subtitle: 'Playlist' } })}
          >
            <MoreHorizontal size={28} />
          </IconButton>
        </>
      }
    >
      {tracks.length > 0 && <TrackTable tracks={tracks} context={context} playlistId={playlist.id} />}
      <PlaylistExtras playlistId={playlist.id} tracks={tracks} />
    </EntityPage>
  );
};
