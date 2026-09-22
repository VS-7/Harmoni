import type { StationKind } from '../../domain/station.ts';

/** Estantes da Início que têm uma página "Mostrar tudo". */
export type SectionKey = 'stations' | 'mixes' | 'artists' | 'albums' | 'playlists' | 'recents';

export const SECTION_KEYS: SectionKey[] = ['stations', 'mixes', 'artists', 'albums', 'playlists', 'recents'];

export type Route =
  | { name: 'home' }
  | { name: 'search'; query: string }
  | { name: 'library' }
  | { name: 'playlist'; id: string }
  | { name: 'folder'; id: string }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'station'; kind: StationKind; id: string; title?: string }
  | { name: 'section'; key: SectionKey }
  | { name: 'offline' }
  | { name: 'downloads' }
  | { name: 'remote-playlist'; id: string }
  | { name: 'remote-artist'; id: string };

export const HOME: Route = { name: 'home' };

const enc = encodeURIComponent;

export function routeToUrl(route: Route): string {
  switch (route.name) {
    case 'home':
      return '/';
    case 'search':
      return route.query ? `/search/${enc(route.query)}` : '/search';
    case 'library':
      return '/collection';
    case 'playlist':
      return `/playlist/${enc(route.id)}`;
    case 'folder':
      return `/folder/${enc(route.id)}`;
    case 'album':
      return `/album/${enc(route.id)}`;
    case 'artist':
      return `/artist/${enc(route.id)}`;
    case 'station': {
      const base = `/station/${route.kind}/${enc(route.id)}`;
      return route.title ? `${base}?t=${enc(route.title)}` : base;
    }
    case 'section':
      return `/section/${route.key}`;
    case 'offline':
      return '/collection/offline';
    case 'downloads':
      return '/downloads';
    case 'remote-playlist':
      return `/yt/playlist/${enc(route.id)}`;
    case 'remote-artist':
      return `/yt/artist/${enc(route.id)}`;
  }
}

function decode(part: string | undefined): string {
  if (!part) return '';
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Reconstrói a rota a partir da URL, para que um link direto ou um reload funcionem. */
export function urlToRoute(pathname: string, search = ''): Route {
  const parts = pathname.split('/').filter(Boolean);
  const [head, a, b] = parts;

  switch (head) {
    case undefined:
      return HOME;
    case 'search':
      return { name: 'search', query: decode(a) };
    case 'collection':
      return a === 'offline' ? { name: 'offline' } : { name: 'library' };
    case 'playlist':
      return a ? { name: 'playlist', id: decode(a) } : HOME;
    case 'folder':
      return a ? { name: 'folder', id: decode(a) } : HOME;
    case 'album':
      return a ? { name: 'album', id: decode(a) } : HOME;
    case 'artist':
      return a ? { name: 'artist', id: decode(a) } : HOME;
    case 'station':
      if ((a === 'artist' || a === 'track') && b) {
        const title = new URLSearchParams(search).get('t') ?? undefined;
        return { name: 'station', kind: a, id: decode(b), title: title || undefined };
      }
      return HOME;
    case 'section':
      return (SECTION_KEYS as string[]).includes(a ?? '') ? { name: 'section', key: a as SectionKey } : HOME;
    case 'downloads':
      return { name: 'downloads' };
    case 'yt':
      if (a === 'playlist' && b) return { name: 'remote-playlist', id: decode(b) };
      if (a === 'artist' && b) return { name: 'remote-artist', id: decode(b) };
      return HOME;
    default:
      return HOME;
  }
}

export function isSameRoute(a: Route, b: Route): boolean {
  return routeToUrl(a) === routeToUrl(b);
}
