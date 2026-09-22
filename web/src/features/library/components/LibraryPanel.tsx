import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  CircleArrowDown,
  Download,
  Folder,
  Library,
  List,
  Pin,
  Play,
  Plus,
  Search,
  Volume2,
} from 'lucide-react';
import type { Playlist } from '../../../domain/playlist.ts';
import type { PlaylistFolder } from '../../../domain/folder.ts';
import type { Album, Artist } from '../../../domain/album.ts';
import { contextKey, type PlaybackContext } from '../../../domain/player.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { preferences } from '../../../adapters/storage/preferences.ts';
import { Link } from '../../../app/router/Link.tsx';
import { useRouter } from '../../../app/router/router.ts';
import { isSameRoute, type Route } from '../../../app/router/routes.ts';
import { Chip } from '../../../shared/components/Chip.tsx';
import { Cover } from '../../../shared/components/Cover.tsx';
import { openMenu, type MenuEntry } from '../../../shared/store/menuStore.ts';
import { pluralize } from '../../../shared/utils/formatters.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useRecentsStore } from '../../player/store/recentsStore.ts';
import { toggleContext } from '../../player/contextLoader.ts';
import { useOfflineStore } from '../../offline/store/offlineStore.ts';
import { useDownloadsStore } from '../../downloads/store/downloadsStore.ts';
import { useLibraryStore } from '../store/libraryStore.ts';
import { albumMenu, artistMenu, createMenu, folderMenu, playlistMenu } from '../menus.tsx';
import { FolderCover, OfflineCover, PlaylistCover } from './Covers.tsx';

type Filter = 'playlists' | 'artists' | 'albums' | null;
type Sort = 'recents' | 'added' | 'alpha';

const SORT_LABEL: Record<Sort, string> = {
  recents: 'Recentes',
  added: 'Adicionados recentemente',
  alpha: 'Ordem alfabética',
};

interface LibraryItem {
  key: string;
  route: Route;
  title: string;
  subtitle: string;
  image: React.ReactNode;
  round?: boolean;
  pinned?: boolean;
  /** Contexto tocável pelo botão sobre a capa. */
  context?: PlaybackContext;
  menu?: () => MenuEntry[];
  sortTime: number;
  addedTime: number;
  kind: 'pinned' | 'folder' | 'playlist' | 'album' | 'artist';
}

interface LibraryPanelProps {
  /** Recolhida: só as capas, como a sidebar estreita do Spotify. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Página inteira (Sua Biblioteca no celular). */
  asPage?: boolean;
}

const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);

export const LibraryPanel: React.FC<LibraryPanelProps> = ({ collapsed = false, onToggleCollapsed, asPage = false }) => {
  const playlists = useLibraryStore((s) => s.playlists);
  const folders = useLibraryStore((s) => s.folders);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const recents = useRecentsStore((s) => s.items);
  const offlineCount = useOfflineStore((s) => s.offlineIds.size);
  const activeDownloads = useDownloadsStore(
    (s) => s.jobs.filter((job) => job.status === 'queued' || job.status === 'processing').length,
  );

  const [filter, setFilter] = useState<Filter>(() => preferences.get<Filter>('library-filter', null));
  const [sort, setSort] = useState<Sort>(() => preferences.get<Sort>('library-sort', 'recents'));
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [openFolder, setOpenFolder] = useState<PlaylistFolder | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => preferences.set('library-filter', filter), [filter]);
  useEffect(() => preferences.set('library-sort', sort), [sort]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Uma pasta excluída em outro lugar fecha a navegação para dentro dela.
  useEffect(() => {
    if (openFolder && !folders.some((f) => f.id === openFolder.id)) setOpenFolder(null);
  }, [folders, openFolder]);

  const items = useMemo(() => {
    const played = new Map(recents.map((r) => [contextKey(r), r.playedAt]));
    const list: LibraryItem[] = [];

    const playlistItem = (pl: Playlist): LibraryItem => ({
      key: `playlist:${pl.id}`,
      route: { name: 'playlist', id: pl.id },
      title: pl.name,
      subtitle: `${pl.isSmart ? 'Playlist inteligente' : 'Playlist'} • ${pluralize(pl.trackCount, 'música', 'músicas')}`,
      image: <PlaylistCover playlist={pl} className="h-full w-full" iconSize={20} />,
      context: { type: 'playlist', id: pl.id, name: pl.name },
      menu: () => playlistMenu(pl),
      sortTime: Math.max(played.get(`playlist:${pl.id}`) ?? 0, time(pl.updatedAt)),
      addedTime: time(pl.createdAt),
      kind: 'playlist',
    });

    if (openFolder) {
      return playlists.filter((pl) => pl.folderId === openFolder.id).map(playlistItem);
    }

    if (filter === null || filter === 'playlists') {
      list.push(
        {
          key: 'offline',
          route: { name: 'offline' },
          title: 'Músicas baixadas',
          subtitle: `Playlist • ${pluralize(offlineCount, 'música', 'músicas')}`,
          image: <OfflineCover className="h-full w-full" iconSize={20} />,
          pinned: true,
          context: { type: 'offline', id: 'all', name: 'Músicas baixadas' },
          sortTime: Number.MAX_SAFE_INTEGER,
          addedTime: Number.MAX_SAFE_INTEGER,
          kind: 'pinned',
        },
        {
          key: 'downloads',
          route: { name: 'downloads' },
          title: 'Downloads',
          subtitle: activeDownloads > 0 ? `Fila • ${pluralize(activeDownloads, 'item baixando', 'itens baixando')}` : 'Fila de downloads do servidor',
          image: (
            <span className="flex h-full w-full items-center justify-center rounded-[4px] bg-[#056952] text-sp-green">
              <Download size={20} strokeWidth={2.5} />
            </span>
          ),
          pinned: true,
          sortTime: Number.MAX_SAFE_INTEGER - 1,
          addedTime: Number.MAX_SAFE_INTEGER - 1,
          kind: 'pinned',
        },
      );

      for (const folder of folders) {
        const inside = playlists.filter((pl) => pl.folderId === folder.id);
        list.push({
          key: `folder:${folder.id}`,
          route: { name: 'folder', id: folder.id },
          title: folder.name,
          subtitle: pluralize(inside.length, 'playlist', 'playlists'),
          image: <FolderCover className="h-full w-full" iconSize={20} />,
          menu: () => folderMenu(folder),
          sortTime: Math.max(time(folder.updatedAt), ...inside.map((pl) => played.get(`playlist:${pl.id}`) ?? 0)),
          addedTime: time(folder.createdAt),
          kind: 'folder',
        });
      }
      for (const pl of playlists) {
        if (!pl.folderId || !folders.some((f) => f.id === pl.folderId)) list.push(playlistItem(pl));
      }
    }

    if (filter === null || filter === 'albums') {
      list.push(
        ...albums.map(
          (album: Album): LibraryItem => ({
            key: `album:${album.id}`,
            route: { name: 'album', id: album.id },
            title: album.title,
            subtitle: `Álbum • ${album.artist_name ?? (album.year ? String(album.year) : 'Harmoni')}`,
            image: <Cover src={apiClient.getAlbumCoverUrl(album.id)} className="h-full w-full" iconSize={20} />,
            context: { type: 'album', id: album.id, name: album.title },
            menu: () => albumMenu(album),
            sortTime: played.get(`album:${album.id}`) ?? 0,
            addedTime: 0,
            kind: 'album',
          }),
        ),
      );
    }

    if (filter === null || filter === 'artists') {
      list.push(
        ...artists.map(
          (artist: Artist): LibraryItem => ({
            key: `artist:${artist.id}`,
            route: { name: 'artist', id: artist.id },
            title: artist.name,
            subtitle: 'Artista',
            round: true,
            image: <Cover src={apiClient.getArtistCoverUrl(artist.id)} round className="h-full w-full" iconSize={20} />,
            context: { type: 'artist', id: artist.id, name: artist.name },
            menu: () => artistMenu(artist),
            sortTime: played.get(`artist:${artist.id}`) ?? 0,
            addedTime: 0,
            kind: 'artist',
          }),
        ),
      );
    }

    return list;
  }, [playlists, folders, albums, artists, recents, offlineCount, activeDownloads, filter, openFolder]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    const filtered = term ? items.filter((item) => item.title.toLocaleLowerCase('pt-BR').includes(term)) : items;
    const alpha = (a: LibraryItem, b: LibraryItem) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === 'alpha') return alpha(a, b);
      const key = sort === 'recents' ? 'sortTime' : 'addedTime';
      return b[key] - a[key] || alpha(a, b);
    });
  }, [items, query, sort]);

  const openSortMenu = (event: React.MouseEvent) =>
    openMenu(
      event,
      [
        { kind: 'custom', id: 'title', render: () => <p className="px-3 pb-1 pt-2 text-xs font-bold text-sp-subdued">Classificar por</p> },
        ...(['recents', 'added', 'alpha'] as Sort[]).map((option) => ({
          id: option,
          label: SORT_LABEL[option],
          active: sort === option,
          icon: sort === option ? Check : undefined,
          onSelect: () => setSort(option),
        })),
      ],
      { align: 'end', header: { title: 'Classificar por' } },
    );

  if (collapsed) {
    return (
      <nav aria-label="Sua Biblioteca" className="flex h-full flex-col items-center gap-2 overflow-hidden rounded-lg bg-sp-base py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Abrir Sua Biblioteca"
          data-tip="Abrir Sua Biblioteca"
          className="flex h-10 w-10 items-center justify-center rounded-full text-sp-subdued hover:text-white"
        >
          <Library size={24} />
        </button>
        <button
          type="button"
          onClick={(event) => openMenu(event, createMenu(null), { header: { title: 'Criar' } })}
          aria-label="Criar playlist ou pasta"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-sp-elevated text-sp-subdued hover:bg-sp-highlight hover:text-white"
        >
          <Plus size={18} />
        </button>
        <div className="sp-scroll no-scrollbar mt-1 flex w-full flex-1 flex-col items-center gap-1 px-1">
          {visible.map((item) => (
            <LibraryRow key={item.key} item={item} compact />
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Sua Biblioteca"
      className={asPage ? 'flex min-h-full flex-col' : 'flex h-full flex-col overflow-hidden rounded-lg bg-sp-base'}
    >
      <div className={`flex items-center justify-between gap-2 px-4 ${asPage ? 'pt-4 pb-2' : 'pt-3 pb-2'}`}>
        {asPage ? (
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sp-green text-sm font-bold text-black">H</span>
            Sua Biblioteca
          </h1>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapsed}
            disabled={!onToggleCollapsed}
            aria-label="Recolher Sua Biblioteca"
            className="flex min-w-0 items-center gap-3 rounded px-2 py-1 font-bold text-sp-subdued transition-colors hover:text-white disabled:hover:text-sp-subdued"
          >
            <Library size={24} />
            <span className="truncate">Sua Biblioteca</span>
          </button>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(event) => openMenu(event, createMenu(openFolder?.id ?? null), { header: { title: 'Criar' } })}
            className="flex h-8 items-center gap-1 rounded-full bg-sp-elevated pl-2 pr-3 text-sm font-bold text-white transition-colors hover:bg-sp-highlight"
          >
            <Plus size={18} />
            Criar
          </button>
          {onToggleCollapsed && !asPage && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Recolher Sua Biblioteca"
              data-tip="Recolher Sua Biblioteca"
              className="flex h-8 w-8 items-center justify-center rounded-full text-sp-subdued hover:bg-sp-elevated hover:text-white"
            >
              <ArrowLeft size={18} />
            </button>
          )}
        </div>
      </div>

      {openFolder ? (
        <div className="flex items-center gap-2 px-4 pb-2 pt-1">
          <button
            type="button"
            onClick={() => setOpenFolder(null)}
            aria-label="Voltar para Sua Biblioteca"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-sp-elevated text-sp-subdued hover:text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <Link to={{ name: 'folder', id: openFolder.id }} className="flex min-w-0 items-center gap-2 font-bold hover:underline">
            <Folder size={16} className="shrink-0 text-sp-subdued" />
            <span className="truncate">{openFolder.name}</span>
          </Link>
        </div>
      ) : (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2 pt-1">
          {filter !== null && (
            <button
              type="button"
              onClick={() => setFilter(null)}
              aria-label="Limpar filtro"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] hover:bg-white/10"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          )}
          {(['playlists', 'artists', 'albums'] as const)
            .filter((option) => filter === null || filter === option)
            .map((option) => (
              <Chip
                key={option}
                label={option === 'playlists' ? 'Playlists' : option === 'artists' ? 'Artistas' : 'Álbuns'}
                active={filter === option}
                onClick={() => setFilter(filter === option ? null : option)}
              />
            ))}
        </div>
      )}

      <div className={asPage ? 'px-2 pb-4' : 'sp-scroll flex-1 px-2 pb-2'}>
        <div className="flex h-10 items-center justify-between gap-2 px-2">
          <div className="flex min-w-0 items-center">
            {searchOpen ? (
              <label className="flex h-8 w-[min(220px,100%)] items-center gap-2 rounded bg-sp-highlight px-2 text-sm">
                <Search size={16} className="shrink-0 text-sp-subdued" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => !query && setSearchOpen(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setQuery('');
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Buscar em Sua Biblioteca"
                  aria-label="Buscar em Sua Biblioteca"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar em Sua Biblioteca"
                data-tip="Buscar em Sua Biblioteca"
                className="flex h-8 w-8 items-center justify-center rounded-full text-sp-subdued hover:bg-sp-elevated hover:text-white"
              >
                <Search size={16} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={openSortMenu}
            className="flex shrink-0 items-center gap-2 text-sm text-sp-subdued transition-colors hover:scale-[1.02] hover:text-white"
          >
            {SORT_LABEL[sort]}
            <List size={16} />
          </button>
        </div>

        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-sp-subdued">
            {query ? `Nada encontrado para "${query}"` : openFolder ? 'Esta pasta está vazia' : 'Nada por aqui ainda'}
          </p>
        ) : (
          <ul className="flex flex-col">
            {visible.map((item) => (
              <li key={item.key}>
                <LibraryRow
                  item={item}
                  onOpenFolder={
                    item.kind === 'folder' && !asPage
                      ? () => setOpenFolder(folders.find((f) => `folder:${f.id}` === item.key) ?? null)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
};

const LibraryRow: React.FC<{ item: LibraryItem; compact?: boolean; onOpenFolder?: () => void }> = ({
  item,
  compact = false,
  onOpenFolder,
}) => {
  const route = useRouter((s) => s.route);
  const active = isSameRoute(route, item.route);
  const key = item.context ? contextKey(item.context) : null;
  const isContext = usePlayerStore((s) => key !== null && contextKey(s.context) === key && s.currentTrack !== null);
  const isPlaying = usePlayerStore((s) => isContext && s.status === 'playing');

  const onContextMenu = item.menu
    ? (event: React.MouseEvent) =>
        openMenu(event, item.menu?.() ?? [], { header: { title: item.title, subtitle: item.subtitle } })
    : undefined;

  const cover = (
    <span className={`relative block shrink-0 overflow-hidden ${item.round ? 'rounded-full' : 'rounded-[4px]'} h-12 w-12`}>
      {item.image}
      {item.context && (
        <button
          type="button"
          aria-label={isPlaying ? `Pausar ${item.title}` : `Tocar ${item.title}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (item.context) void toggleContext(item.context);
          }}
          className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover:flex"
        >
          {isPlaying ? <Volume2 size={20} /> : <Play size={20} fill="currentColor" strokeWidth={0} />}
        </button>
      )}
    </span>
  );

  if (compact) {
    return (
      <Link
        to={item.route}
        onContextMenu={onContextMenu}
        aria-label={item.title}
        title={item.title}
        className={`group rounded-md p-2 ${active ? 'bg-sp-highlight' : 'hover:bg-sp-elevated'}`}
      >
        {cover}
      </Link>
    );
  }

  return (
    <Link
      to={item.route}
      onContextMenu={onContextMenu}
      onClick={(event) => {
        if (onOpenFolder && !event.metaKey && !event.ctrlKey) onOpenFolder();
      }}
      className={[
        'group flex items-center gap-3 rounded-md p-2 transition-colors',
        active ? 'bg-sp-highlight hover:bg-[#393939]' : 'hover:bg-sp-elevated',
      ].join(' ')}
    >
      {cover}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-base ${isContext ? 'text-sp-green' : 'text-white'}`}>{item.title}</span>
        <span className="flex min-w-0 items-center gap-1 text-sm text-sp-subdued">
          {item.pinned && <Pin size={13} className="shrink-0 rotate-45 fill-sp-green text-sp-green" />}
          {item.key === 'offline' && <CircleArrowDown size={14} className="shrink-0 fill-sp-green text-sp-base" />}
          <span className="truncate">{item.subtitle}</span>
        </span>
      </span>
      {isPlaying && <Volume2 size={16} className="shrink-0 text-sp-green" aria-label="Tocando" />}
      {item.kind === 'folder' && <ArrowRight size={16} className="shrink-0 text-sp-subdued opacity-0 group-hover:opacity-100" />}
    </Link>
  );
};
