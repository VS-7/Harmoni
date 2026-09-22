import React from 'react';
import { useRouter } from '../router/router.ts';
import { HomePage } from '../../features/home/components/HomePage.tsx';
import { SectionPage } from '../../features/home/components/SectionPage.tsx';
import { StationPage } from '../../features/radio/components/StationPage.tsx';
import { PlaylistPage } from '../../features/library/components/PlaylistPage.tsx';
import { AlbumPage } from '../../features/library/components/AlbumPage.tsx';
import { ArtistPage } from '../../features/library/components/ArtistPage.tsx';
import { FolderPage } from '../../features/library/components/FolderPage.tsx';
import { LibraryPanel } from '../../features/library/components/LibraryPanel.tsx';
import { SearchPage } from '../../features/discover/components/SearchPage.tsx';
import { RemoteArtistPage, RemotePlaylistPage } from '../../features/discover/components/RemotePages.tsx';
import { DownloadsPage } from '../../features/downloads/components/DownloadsPage.tsx';
import { OfflinePage } from '../../features/offline/components/OfflinePage.tsx';

/** Troca a página da área principal conforme a rota. */
export const RouteView: React.FC = () => {
  const route = useRouter((s) => s.route);

  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'search':
      return <SearchPage query={route.query} />;
    case 'library':
      return <LibraryPanel asPage />;
    case 'playlist':
      return <PlaylistPage key={route.id} playlistId={route.id} />;
    case 'folder':
      return <FolderPage key={route.id} folderId={route.id} />;
    case 'album':
      return <AlbumPage key={route.id} albumId={route.id} />;
    case 'artist':
      return <ArtistPage key={route.id} artistId={route.id} />;
    case 'station':
      return <StationPage key={`${route.kind}:${route.id}`} kind={route.kind} id={route.id} title={route.title} />;
    case 'section':
      return <SectionPage sectionKey={route.key} />;
    case 'offline':
      return <OfflinePage />;
    case 'downloads':
      return <DownloadsPage />;
    case 'remote-playlist':
      return <RemotePlaylistPage key={route.id} playlistId={route.id} />;
    case 'remote-artist':
      return <RemoteArtistPage key={route.id} channelId={route.id} />;
  }
};
