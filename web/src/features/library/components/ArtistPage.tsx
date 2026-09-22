import React, { useMemo, useState } from 'react';
import { Mic2, MoreHorizontal, Radio, Shuffle } from 'lucide-react';
import type { PlaybackContext } from '../../../domain/player.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { navigate } from '../../../app/router/router.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { EntityPage } from '../../../shared/components/EntityPage.tsx';
import { EmptyPage, LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { PillButton } from '../../../shared/components/Modal.tsx';
import { PlayButton } from '../../../shared/components/PlayButton.tsx';
import { Shelf } from '../../../shared/components/Shelf.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { useAsync } from '../../../shared/hooks/useAsync.ts';
import { useDominantColor } from '../../../shared/hooks/useDominantColor.ts';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { fallbackColor } from '../../../shared/utils/color.ts';
import { pluralize } from '../../../shared/utils/formatters.ts';
import { dailySeed, seededRandom, shuffled } from '../../../shared/utils/random.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useContextPlayback } from '../../player/hooks/useContextPlayback.ts';
import { DownloadToggle } from '../../offline/components/DownloadToggle.tsx';
import { AlbumCard, ArtistStationCard, MixCard } from '../../home/components/HomeCards.tsx';
import { artistMenu } from '../menus.tsx';
import { TrackTable } from './TrackTable.tsx';

const POPULAR_COLLAPSED = 5;
const POPULAR_EXPANDED = 10;

export const ArtistPage: React.FC<{ artistId: string }> = ({ artistId }) => {
  const { data, error } = useAsync(() => apiClient.getArtist(artistId), [artistId]);
  const [expanded, setExpanded] = useState(false);
  const artist = data?.artist;
  const tracks = useMemo(() => data?.tracks ?? [], [data]);
  // Sem contagem de plays, "Populares" é uma seleção do dia entre as faixas do artista.
  const popular = useMemo(() => shuffled(tracks, seededRandom(dailySeed(artistId))), [tracks, artistId]);
  const context = useMemo<PlaybackContext | null>(
    () => (artist ? { type: 'artist', id: artist.id, name: artist.name } : null),
    [artist],
  );
  const playback = useContextPlayback(context, popular);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const coverUrl = apiClient.getArtistCoverUrl(artistId);
  const color = useDominantColor(coverUrl, fallbackColor(artistId));
  useDocumentTitle(artist?.name);

  if (error && !data) return <EmptyPage icon={Mic2} title="Artista não encontrado" description={error} />;

  const shown = popular.slice(0, expanded ? POPULAR_EXPANDED : POPULAR_COLLAPSED);
  const mixSeeds = popular.slice(0, 3);

  return (
    <EntityPage
      color={artist ? color : fallbackColor(artistId)}
      backgroundImage={coverUrl}
      image={<Cover src={coverUrl} round className="aspect-square w-full" />}
      kind="Artista"
      title={artist?.name ?? ''}
      meta={artist && <span>{pluralize(tracks.length, 'música', 'músicas')} na sua biblioteca</span>}
      stickyAction={artist && tracks.length > 0 ? <PlayButton playing={playback.isPlaying} label={artist.name} onClick={playback.toggle} /> : undefined}
      actions={
        artist && (
          <>
            <PlayButton size="lg" playing={playback.isPlaying} label={artist.name} onClick={playback.toggle} disabled={tracks.length === 0} />
            <IconButton label={shuffle ? 'Desativar a ordem aleatória' : 'Ativar a ordem aleatória'} active={shuffle} showDot size="lg" onClick={toggleShuffle}>
              <Shuffle size={28} />
            </IconButton>
            <PillButton variant="outline" className="h-8 px-4 text-sm" onClick={() => navigate({ name: 'station', kind: 'artist', id: artistId })}>
              <Radio size={16} /> Rádio
            </PillButton>
            <DownloadToggle batchId={`artist:${artistId}`} tracks={tracks} label={artist.name} />
            <IconButton
              label={`Mais opções para ${artist.name}`}
              size="lg"
              onClick={(event) => openMenu(event, artistMenu(artist), { header: { title: artist.name, subtitle: 'Artista', imageUrl: coverUrl, round: true } })}
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
        <div className="flex flex-col gap-10">
          {tracks.length > 0 && (
            <section>
              <h2 className="mb-4 px-4 text-2xl font-bold md:px-6">Populares</h2>
              <TrackTable tracks={shown} context={context} variant="compact" onPlay={(index) => void usePlayerStore.getState().playQueue(popular, { startIndex: index, context })} />
              {tracks.length > POPULAR_COLLAPSED && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 px-4 text-sm font-bold text-sp-subdued hover:text-white md:px-8"
                >
                  {expanded ? 'Mostrar menos' : 'Ver mais'}
                </button>
              )}
            </section>
          )}

          {data.albums.length > 0 && (
            <div className="px-1 md:px-3">
              <Shelf title="Discografia">
                {data.albums.map((album) => (
                  <AlbumCard key={album.id} album={{ ...album, artist_name: album.artist_name ?? artist?.name }} />
                ))}
              </Shelf>
            </div>
          )}

          {artist && tracks.length > 0 && (
            <div className="px-1 md:px-3">
              <Shelf title={`Com ${artist.name}`}>
                {[
                  <ArtistStationCard key="radio" artist={artist} title={`Rádio ${artist.name}`} />,
                  ...mixSeeds.map((seed) => (
                    <MixCard key={seed.id} seedId={seed.id} title={`Mix de ${seed.title}`} subtitle={`${artist.name} e músicas parecidas`} />
                  )),
                ]}
              </Shelf>
            </div>
          )}
        </div>
      )}
    </EntityPage>
  );
};
