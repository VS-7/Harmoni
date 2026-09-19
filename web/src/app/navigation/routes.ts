/** As quatro abas da tab bar (RF10.1, Q3). */
export type TabKey = 'library' | 'search' | 'downloads' | 'offline';

export const TAB_KEYS: TabKey[] = ['library', 'search', 'downloads', 'offline'];

/** Telas de detalhe empilháveis sobre uma aba. */
export type Route =
  | { name: 'tab'; tab: TabKey }
  | { name: 'album'; id: string }
  | { name: 'playlist'; id: string }
  | { name: 'remote-playlist'; id: string }
  | { name: 'remote-artist'; id: string };

export const HOME: Route = { name: 'tab', tab: 'library' };

/** A aba que fica destacada enquanto uma tela de detalhe está aberta. */
export function tabOf(route: Route, fallback: TabKey): TabKey {
  if (route.name === 'tab') return route.tab;
  if (route.name === 'remote-playlist' || route.name === 'remote-artist') return 'search';
  return fallback;
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'tab':
      return route.tab === 'library' ? '/' : `/${route.tab}`;
    case 'album':
      return `/album/${route.id}`;
    case 'playlist':
      return `/playlist/${route.id}`;
    case 'remote-playlist':
      return `/yt/playlist/${route.id}`;
    case 'remote-artist':
      return `/yt/artist/${route.id}`;
  }
}

/** Reconstrói a rota a partir da URL, para que um link direto ou um reload funcionem. */
export function pathToRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return HOME;

  if (parts[0] === 'yt' && parts.length >= 3) {
    if (parts[1] === 'playlist') return { name: 'remote-playlist', id: decodeURIComponent(parts[2]) };
    if (parts[1] === 'artist') return { name: 'remote-artist', id: decodeURIComponent(parts[2]) };
  }
  if (parts[0] === 'album' && parts[1]) return { name: 'album', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'playlist' && parts[1]) return { name: 'playlist', id: decodeURIComponent(parts[1]) };

  if ((TAB_KEYS as string[]).includes(parts[0])) {
    return { name: 'tab', tab: parts[0] as TabKey };
  }
  return HOME;
}
