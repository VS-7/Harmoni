import React, { useMemo, useState } from 'react';
import { Library, Music } from 'lucide-react';
import type { PlaybackContext } from '../../../domain/player.ts';
import type { Route } from '../../../app/router/routes.ts';
import { useMainScroll } from '../../../app/layout/scrollStore.ts';
import { Chip } from '../../../shared/components/Chip.tsx';
import { EmptyPage, LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { PillButton } from '../../../shared/components/Modal.tsx';
import { Shelf } from '../../../shared/components/Shelf.tsx';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { useIsMobile } from '../../../shared/hooks/useMediaQuery.ts';
import { navigate } from '../../../app/router/router.ts';
import { routeForContext } from '../../player/contextLoader.ts';
import { NotificationsButton } from '../../downloads/components/NotificationsButton.tsx';
import { useHomeFeed } from '../hooks/useHomeFeed.ts';
import {
  AlbumCard,
  ArtistCard,
  ArtistStationCard,
  MixCard,
  PlaylistCard,
  QuickCard,
  RecentCard,
} from './HomeCards.tsx';

type HomeFilter = 'all' | 'music' | 'radio';

const DEFAULT_TOP = '#3a3a3a';

/** Início: atalhos, mixes, rádios e a biblioteca em estantes, como a home do Spotify. */
export const HomePage: React.FC = () => {
  const feed = useHomeFeed();
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const scrolled = useMainScroll((s) => s.y > 8);
  useDocumentTitle(null);

  const quick = useMemo(() => {
    const items: { context: PlaybackContext; to: Route }[] = [];
    const seen = new Set<string>();
    // Downloads do YouTube criam playlist e álbum com o mesmo nome: um atalho por título basta.
    const titles = new Set<string>();
    const push = (context: PlaybackContext) => {
      const key = `${context.type}:${context.id}`;
      const title = context.name.trim().toLocaleLowerCase('pt-BR');
      const to = routeForContext(context);
      if (seen.has(key) || titles.has(title) || !to) return;
      seen.add(key);
      titles.add(title);
      items.push({ context, to });
    };
    feed.recents.forEach(push);
    feed.playlists.forEach((pl) => push({ type: 'playlist', id: pl.id, name: pl.name }));
    feed.albums.forEach((album) => push({ type: 'album', id: album.id, name: album.title }));
    return items.slice(0, 8);
  }, [feed.recents, feed.playlists, feed.albums]);

  const topColor = hoverColor ?? DEFAULT_TOP;
  const empty = feed.loaded && feed.playlists.length === 0 && feed.albums.length === 0 && feed.artists.length === 0;

  return (
    <div className="relative isolate min-h-full pb-8">
      {/* Degradê do topo que assume a cor do atalho sob o mouse. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[332px] transition-[background-color] duration-700"
        style={{ backgroundColor: topColor, backgroundImage: 'linear-gradient(rgba(0,0,0,0.6) 0, #121212 100%)' }}
      />

      <div
        className={[
          'sticky top-0 z-20 flex h-16 items-center gap-2 px-4 transition-colors md:px-6',
          scrolled ? 'bg-sp-base' : '',
        ].join(' ')}
        style={scrolled ? { backgroundColor: topColor, backgroundImage: 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6))' } : undefined}
      >
        {isMobile && (
          <span className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sp-green text-sm font-bold text-black">H</span>
        )}
        <Chip label="Tudo" active={filter === 'all'} onClick={() => setFilter('all')} />
        <Chip label="Música" active={filter === 'music'} onClick={() => setFilter('music')} />
        <Chip label="Rádios" active={filter === 'radio'} onClick={() => setFilter('radio')} />
        {isMobile && (
          <div className="ml-auto">
            <NotificationsButton />
          </div>
        )}
      </div>

      {!feed.loaded ? (
        <LoadingDots />
      ) : empty ? (
        <EmptyPage
          icon={Music}
          title="Sua biblioteca está vazia"
          description="Busque no YouTube e baixe músicas para o servidor, ou coloque arquivos na pasta de músicas e rode uma varredura."
          action={<PillButton onClick={() => navigate({ name: 'search', query: '' })}>Buscar músicas</PillButton>}
        />
      ) : (
        <div className="px-1 md:px-3">
          {filter !== 'radio' && quick.length > 0 && (
            <div className="mb-6 grid grid-cols-2 gap-2 px-3 pt-2 lg:grid-cols-4">
              {quick.map((item) => (
                <QuickCard
                  key={`${item.context.type}:${item.context.id}`}
                  context={item.context}
                  to={item.to}
                  title={item.context.name}
                  onHoverColor={setHoverColor}
                />
              ))}
            </div>
          )}

          {filter !== 'music' && (
            <Shelf title="Feito para você" to={{ name: 'section', key: 'mixes' }}>
              {feed.mixes.map((mix) => (
                <MixCard key={mix.seed.id} seedId={mix.seed.id} title={mix.title} subtitle={mix.subtitle} />
              ))}
            </Shelf>
          )}

          {filter !== 'music' && (
            <Shelf title="Estações de rádio recomendadas" to={{ name: 'section', key: 'stations' }}>
              {feed.stations.map((station) => (
                <ArtistStationCard key={station.artist.id} artist={station.artist} title={station.title} />
              ))}
            </Shelf>
          )}

          {filter === 'all' && feed.recents.length > 0 && (
            <Shelf title="Tocadas recentemente" to={{ name: 'section', key: 'recents' }}>
              {feed.recents
                .map((recent) => ({ recent, to: routeForContext(recent) }))
                .filter((item): item is { recent: typeof item.recent; to: Route } => item.to !== null)
                .map(({ recent, to }) => (
                  <RecentCard key={`${recent.type}:${recent.id}`} context={recent} to={to} />
                ))}
            </Shelf>
          )}

          {filter !== 'radio' && (
            <Shelf title="Seus artistas" to={{ name: 'section', key: 'artists' }}>
              {feed.artists.map((artist) => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </Shelf>
          )}

          {filter !== 'radio' && (
            <Shelf title="Suas playlists" to={{ name: 'section', key: 'playlists' }}>
              {feed.playlists.map((pl) => (
                <PlaylistCard key={pl.id} playlist={pl} />
              ))}
            </Shelf>
          )}

          {filter !== 'radio' && (
            <Shelf title="Álbuns na sua biblioteca" to={{ name: 'section', key: 'albums' }}>
              {feed.albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </Shelf>
          )}

          {isMobile && (
            <div className="px-3 pt-2">
              <PillButton variant="outline" onClick={() => navigate({ name: 'library' })} className="w-full">
                <Library size={18} /> Abrir Sua Biblioteca
              </PillButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
