import React, { useEffect } from 'react';
import { AppShell } from './app/shell/AppShell.tsx';
import { useNavigation } from './app/navigation/useNavigation.ts';
import { LibraryView } from './features/library/components/LibraryView.tsx';
import { AlbumScreen } from './features/library/components/AlbumScreen.tsx';
import { PlaylistScreen } from './features/library/components/PlaylistScreen.tsx';
import { SearchView } from './features/discover/components/SearchView.tsx';
import { RemotePlaylistScreen } from './features/discover/components/RemotePlaylistScreen.tsx';
import { RemoteArtistScreen } from './features/discover/components/RemoteArtistScreen.tsx';
import { DownloadsView } from './features/downloads/components/DownloadsView.tsx';
import { OfflineView } from './features/offline/components/OfflineView.tsx';
import { useOfflineStore } from './features/offline/store/offlineStore.ts';
import type { TabKey } from './app/navigation/routes.ts';

const TAB_TITLE: Record<TabKey, string> = {
  library: 'Biblioteca',
  search: 'Buscar',
  downloads: 'Downloads',
  offline: 'No Aparelho',
};

export const App: React.FC = () => {
  const { route, activeTab, push, selectTab, back } = useNavigation();
  const refreshOffline = useOfflineStore((s) => s.refresh);

  useEffect(() => {
    void refreshOffline();

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
    }
  }, [refreshOffline]);

  const isDetail = route.name !== 'tab';
  const title = route.name === 'tab' ? TAB_TITLE[route.tab] : titleForDetail(route.name);

  return (
    <AppShell
      title={title}
      activeTab={activeTab}
      onSelectTab={selectTab}
      onBack={isDetail ? back : undefined}
    >
      {route.name === 'tab' && route.tab === 'library' && (
        <LibraryView
          onOpenAlbum={(id) => push({ name: 'album', id })}
          onOpenPlaylist={(id) => push({ name: 'playlist', id })}
        />
      )}

      {route.name === 'tab' && route.tab === 'search' && (
        <SearchView
          onOpenRemotePlaylist={(id) => push({ name: 'remote-playlist', id })}
          onOpenRemoteArtist={(id) => push({ name: 'remote-artist', id })}
        />
      )}

      {route.name === 'tab' && route.tab === 'downloads' && <DownloadsView />}
      {route.name === 'tab' && route.tab === 'offline' && <OfflineView />}

      {route.name === 'album' && <AlbumScreen albumId={route.id} />}

      {route.name === 'playlist' && (
        <PlaylistScreen
          playlistId={route.id}
          onDeleted={back}
          onOpenAlbum={(id) => push({ name: 'album', id })}
        />
      )}

      {route.name === 'remote-playlist' && (
        <RemotePlaylistScreen
          playlistId={route.id}
          onOpenRemoteArtist={(id) => push({ name: 'remote-artist', id })}
        />
      )}

      {route.name === 'remote-artist' && (
        <RemoteArtistScreen
          channelId={route.id}
          onOpenRemotePlaylist={(id) => push({ name: 'remote-playlist', id })}
        />
      )}
    </AppShell>
  );
};

function titleForDetail(name: string): string {
  switch (name) {
    case 'album':
      return 'Álbum';
    case 'playlist':
      return 'Playlist';
    case 'remote-playlist':
      return 'Playlist do YouTube';
    default:
      return 'Artista';
  }
}
