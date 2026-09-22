import React, { useMemo, useState } from 'react';
import { CircleArrowDown, Search, X } from 'lucide-react';
import type { RemoteItem, SearchType } from '../../../domain/discovery.ts';
import type { Track } from '../../../domain/track.ts';
import type { PlaybackContext } from '../../../domain/player.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { navigate } from '../../../app/router/router.ts';
import { Chip } from '../../../shared/components/Chip.tsx';
import { Cover } from '../../../shared/components/Cover.tsx';
import { LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { MediaCard } from '../../../shared/components/MediaCard.tsx';
import { PillButton } from '../../../shared/components/Modal.tsx';
import { PlayButton } from '../../../shared/components/PlayButton.tsx';
import { Shelf } from '../../../shared/components/Shelf.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { toast } from '../../../shared/store/toastStore.ts';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { useIsMobile } from '../../../shared/hooks/useMediaQuery.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { TrackTable } from '../../library/components/TrackTable.tsx';
import { trackMenu } from '../../library/menus.tsx';
import { useDiscoverSearch } from '../hooks/useDiscoverSearch.ts';
import { downloadRemote, remoteMenu } from '../remoteMenus.ts';
import { BrowseAll } from './BrowseAll.tsx';
import { RemoteTrackRow } from './RemoteTrackRow.tsx';

const FILTERS: { value: SearchType; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'track', label: 'Músicas' },
  { value: 'playlist', label: 'Playlists' },
  { value: 'artist', label: 'Artistas' },
];

/** Campo de busca do celular, onde não há barra superior. */
export const MobileSearchField: React.FC<{ query: string }> = ({ query }) => (
  <label className="flex h-12 items-center gap-3 rounded-md bg-white px-3 text-black">
    <Search size={22} className="shrink-0" />
    <input
      value={query}
      onChange={(e) => navigate({ name: 'search', query: e.target.value }, { replace: true })}
      type="search"
      placeholder="O que você quer ouvir?"
      aria-label="O que você quer ouvir?"
      className="min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-[#535353]"
    />
    {query && (
      <button type="button" onClick={() => navigate({ name: 'search', query: '' }, { replace: true })} aria-label="Limpar busca">
        <X size={20} />
      </button>
    )}
  </label>
);

const TopResult: React.FC<{ local?: Track; remote?: RemoteItem; context: PlaybackContext }> = ({ local, remote, context }) => {
  const playQueue = usePlayerStore((s) => s.playQueue);
  const isPlaying = usePlayerStore((s) => !!local && s.currentTrack?.id === local.id && s.status === 'playing');
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const isCurrent = usePlayerStore((s) => !!local && s.currentTrack?.id === local.id);

  if (!local && !remote) return null;
  const title = local?.title ?? remote?.title ?? '';
  const artist = local?.artist_name ?? remote?.artist ?? '';
  const kind = local ? 'Música' : remote?.kind === 'playlist' ? 'Playlist' : remote?.kind === 'artist' ? 'Artista' : 'Música';
  const image = local ? apiClient.getCoverUrl(local.id) : remote?.thumbnail_url;

  const onContext = (event: React.MouseEvent) => {
    if (local) openMenu(event, trackMenu([local]), { header: { title, subtitle: artist } });
    else if (remote) openMenu(event, remoteMenu(remote), { header: { title, subtitle: artist } });
  };

  const target = remote?.kind === 'playlist'
    ? { name: 'remote-playlist' as const, id: remote.id }
    : remote?.kind === 'artist'
      ? { name: 'remote-artist' as const, id: remote.id }
      : null;

  return (
    <div className="group relative flex h-full min-h-[220px] flex-col gap-5 rounded-lg bg-sp-card p-5 transition-colors hover:bg-sp-highlight" onContextMenu={onContext}>
      <Cover src={image || null} round={remote?.kind === 'artist'} className="h-[92px] w-[92px]" iconSize={36} shadow />
      <div className="min-w-0">
        {target ? (
          <Link to={target} className="line-clamp-2 text-[32px] font-bold leading-tight hover:underline">
            {title}
          </Link>
        ) : (
          <p className="line-clamp-2 text-[32px] font-bold leading-tight">{title}</p>
        )}
        <p className="mt-1 truncate text-sm text-sp-subdued">
          <span>{kind}</span>
          {artist && <span className="text-white"> • {artist}</span>}
        </p>
      </div>
      <div className="absolute bottom-5 right-5 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
        {local ? (
          <PlayButton
            playing={isPlaying}
            label={title}
            onClick={() => (isCurrent ? void togglePlay() : void playQueue([local], { context }))}
          />
        ) : remote && remote.kind !== 'artist' ? (
          <button
            type="button"
            onClick={() => void downloadRemote(remote)}
            aria-label={`Baixar ${title} para o servidor`}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-sp-green text-black shadow-[0_8px_8px_rgba(0,0,0,0.3)] hover:scale-[1.04]"
          >
            <CircleArrowDown size={24} />
          </button>
        ) : null}
      </div>
    </div>
  );
};

/** Busca na biblioteca e no YouTube (RF7.6): a biblioteca responde primeiro. */
export const SearchPage: React.FC<{ query: string }> = ({ query }) => {
  const isMobile = useIsMobile();
  const [type, setType] = useState<SearchType>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const { localTracks, remoteItems, loadingLocal, loadingRemote, error } = useDiscoverSearch(query, type);
  const hasQuery = query.trim().length >= 2;
  useDocumentTitle(hasQuery ? `Busca: ${query}` : 'Buscar');

  const context = useMemo<PlaybackContext>(() => ({ type: 'search', id: query, name: `Busca "${query}"` }), [query]);
  const remoteTracks = remoteItems.filter((i) => i.kind === 'track');
  const remotePlaylists = remoteItems.filter((i) => i.kind === 'playlist');
  const remoteArtists = remoteItems.filter((i) => i.kind === 'artist');
  const localByTitle = useMemo(() => new Map(localTracks.map((t) => [t.title.toLocaleLowerCase('pt-BR'), t])), [localTracks]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendBatch() {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const jobs = await apiClient.submitBatch([...selected].map((id) => ({ provider: 'youtube', kind: 'track' as const, id })));
      toast(`${jobs.length} ${jobs.length === 1 ? 'música entrou' : 'músicas entraram'} na fila de download`);
      setSelected(new Set());
      setSelectMode(false);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const showLocal = type === 'all' || type === 'track';
  const topLocal = showLocal ? localTracks[0] : undefined;
  const topRemote = topLocal ? undefined : remoteItems[0];

  return (
    <div className="px-4 pb-24 pt-4 md:px-6">
      {isMobile && (
        <div className="mb-4">
          <h1 className="mb-4 text-2xl font-bold">Buscar</h1>
          <MobileSearchField query={query} />
        </div>
      )}

      {!hasQuery ? (
        <BrowseAll />
      ) : (
        <>
          <div className="no-scrollbar -mx-1 mb-6 flex gap-2 overflow-x-auto px-1">
            {FILTERS.map((filter) => (
              <Chip key={filter.value} label={filter.label} active={type === filter.value} onClick={() => setType(filter.value)} />
            ))}
          </div>

          {(topLocal || topRemote || (showLocal && localTracks.length > 0)) && (
            <div className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <section>
                <h2 className="mb-4 text-2xl font-bold">Melhor resultado</h2>
                <TopResult local={topLocal} remote={topRemote} context={context} />
              </section>
              {showLocal && localTracks.length > 0 && (
                <section className="min-w-0">
                  <h2 className="mb-4 text-2xl font-bold">Músicas na biblioteca</h2>
                  <div className="-mx-2 md:-mx-4">
                    <TrackTable tracks={localTracks.slice(0, 4)} context={context} variant="compact" />
                  </div>
                </section>
              )}
            </div>
          )}

          {loadingLocal && localTracks.length === 0 && !topRemote && <LoadingDots className="py-6" />}

          {showLocal && localTracks.length > 4 && (
            <section className="mb-10">
              <h2 className="mb-2 text-2xl font-bold">Mais na sua biblioteca</h2>
              <div className="-mx-2 md:-mx-4">
                <TrackTable tracks={localTracks.slice(4)} context={context} variant="compact" />
              </div>
            </section>
          )}

          <section className="mb-10">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold">No YouTube</h2>
              {remoteTracks.length > 0 && (
                <Chip
                  label={selectMode ? 'Cancelar seleção' : 'Selecionar várias'}
                  active={selectMode}
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setSelected(new Set());
                  }}
                />
              )}
            </div>
            {error && <p className="py-2 text-sm text-sp-negative">{error}</p>}
            {loadingRemote && remoteItems.length === 0 && <LoadingDots className="py-6" />}
            {!loadingRemote && !error && remoteItems.length === 0 && (
              <p className="py-4 text-sm text-sp-subdued">Nenhum resultado no YouTube para "{query}".</p>
            )}
            {remoteTracks.length > 0 && (
              <div className="-mx-2 md:-mx-4">
                {remoteTracks.map((item) => (
                  <RemoteTrackRow
                    key={item.id}
                    item={item}
                    local={localByTitle.get(item.title.toLocaleLowerCase('pt-BR'))}
                    selectable={selectMode}
                    selected={selected.has(item.id)}
                    onToggleSelect={() => toggleSelected(item.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {remoteArtists.length > 0 && (
            <div className="-mx-3">
              <Shelf title="Artistas">
                {remoteArtists.map((item) => (
                  <MediaCard
                    key={item.id}
                    to={{ name: 'remote-artist', id: item.id }}
                    title={item.title}
                    subtitle="Artista • YouTube"
                    image={<Cover src={item.thumbnail_url || null} round className="aspect-square w-full" iconSize={40} shadow />}
                    onContextMenu={(event) => openMenu(event, remoteMenu(item), { header: { title: item.title } })}
                  />
                ))}
              </Shelf>
            </div>
          )}

          {remotePlaylists.length > 0 && (
            <div className="-mx-3">
              <Shelf title="Playlists">
                {remotePlaylists.map((item) => (
                  <MediaCard
                    key={item.id}
                    to={{ name: 'remote-playlist', id: item.id }}
                    title={item.title}
                    subtitle={`${item.artist}${item.item_count > 0 ? ` • ${item.item_count} músicas` : ''}`}
                    image={<Cover src={item.thumbnail_url || null} className="aspect-square w-full" iconSize={40} shadow />}
                    onContextMenu={(event) => openMenu(event, remoteMenu(item), { header: { title: item.title } })}
                  />
                ))}
              </Shelf>
            </div>
          )}
        </>
      )}

      {selectMode && selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex justify-center">
          <PillButton variant="green" onClick={() => void sendBatch()} disabled={sending} className="shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
            <CircleArrowDown size={18} />
            {sending ? 'Enviando…' : `Baixar ${selected.size} para o servidor`}
          </PillButton>
        </div>
      )}
    </div>
  );
};
