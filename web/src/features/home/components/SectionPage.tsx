import React from 'react';
import type { SectionKey, Route } from '../../../app/router/routes.ts';
import { CardGrid } from '../../../shared/components/Shelf.tsx';
import { LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { routeForContext } from '../../player/contextLoader.ts';
import { useHomeFeed } from '../hooks/useHomeFeed.ts';
import { AlbumCard, ArtistCard, ArtistStationCard, MixCard, PlaylistCard, RecentCard } from './HomeCards.tsx';

const TITLES: Record<SectionKey, string> = {
  mixes: 'Feito para você',
  stations: 'Estações de rádio recomendadas',
  recents: 'Tocadas recentemente',
  artists: 'Seus artistas',
  playlists: 'Suas playlists',
  albums: 'Álbuns na sua biblioteca',
};

/** "Mostrar tudo" de uma estante da Início. */
export const SectionPage: React.FC<{ sectionKey: SectionKey }> = ({ sectionKey }) => {
  const feed = useHomeFeed();
  useDocumentTitle(TITLES[sectionKey]);

  let cards: React.ReactNode[] = [];
  switch (sectionKey) {
    case 'mixes':
      cards = feed.mixes.map((mix) => <MixCard key={mix.seed.id} seedId={mix.seed.id} title={mix.title} subtitle={mix.subtitle} />);
      break;
    case 'stations':
      cards = feed.stations.map((s) => <ArtistStationCard key={s.artist.id} artist={s.artist} title={s.title} />);
      break;
    case 'recents':
      cards = feed.recents
        .map((recent) => ({ recent, to: routeForContext(recent) }))
        .filter((item): item is { recent: typeof item.recent; to: Route } => item.to !== null)
        .map(({ recent, to }) => <RecentCard key={`${recent.type}:${recent.id}`} context={recent} to={to} />);
      break;
    case 'artists':
      cards = feed.artists.map((artist) => <ArtistCard key={artist.id} artist={artist} />);
      break;
    case 'playlists':
      cards = feed.playlists.map((pl) => <PlaylistCard key={pl.id} playlist={pl} />);
      break;
    case 'albums':
      cards = feed.albums.map((album) => <AlbumCard key={album.id} album={album} />);
      break;
  }

  return (
    <div className="px-1 pb-10 pt-6 md:px-3">
      <h1 className="mb-4 px-3 text-3xl font-bold">{TITLES[sectionKey]}</h1>
      {!feed.loaded ? <LoadingDots /> : <CardGrid>{cards}</CardGrid>}
    </div>
  );
};
