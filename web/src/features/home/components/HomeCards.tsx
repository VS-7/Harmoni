import React from 'react';
import { Play, Pause } from 'lucide-react';
import type { Playlist } from '../../../domain/playlist.ts';
import type { Album, Artist } from '../../../domain/album.ts';
import type { PlaylistFolder } from '../../../domain/folder.ts';
import type { PlaybackContext } from '../../../domain/player.ts';
import type { Route } from '../../../app/router/routes.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { Cover } from '../../../shared/components/Cover.tsx';
import { LogoMark } from '../../../shared/components/Logo.tsx';
import { MediaCard } from '../../../shared/components/MediaCard.tsx';
import { openMenu, type MenuEntry } from '../../../shared/store/menuStore.ts';
import { useDominantColor } from '../../../shared/hooks/useDominantColor.ts';
import { hashString } from '../../../shared/utils/random.ts';
import { paletteColor } from '../../../shared/utils/color.ts';
import { pluralize } from '../../../shared/utils/formatters.ts';
import { useContextPlayback } from '../../player/hooks/useContextPlayback.ts';
import { albumMenu, artistMenu, folderMenu, playlistMenu } from '../../library/menus.tsx';
import { FolderCover, OfflineCover, PlaylistCover } from '../../library/components/Covers.tsx';
import { useLibraryStore } from '../../library/store/libraryStore.ts';

/** Fundos pastel dos cards de rádio, com texto escuro por cima. */
const RADIO_PALETTE = ['#f7c1d8', '#b7e4f9', '#c6f7a6', '#ffd18a', '#d7c3fa', '#a8f0e0', '#ffb5a1', '#fff0a6', '#c3d6ff', '#ffc6f0'];

/** Arte do card de rádio: círculo com o artista sobre um fundo pastel e o selo "RÁDIO". */
export const StationArt: React.FC<{ name: string; imageUrl: string | null }> = ({ name, imageUrl }) => (
  <div
    className="relative aspect-square w-full overflow-hidden rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
    style={{ backgroundColor: RADIO_PALETTE[hashString(name) % RADIO_PALETTE.length] }}
  >
    <div className="absolute left-2.5 top-2.5 flex items-center gap-1 text-black/80">
      <LogoMark size={16} />
      <span className="text-[11px] font-black tracking-[0.12em]">RÁDIO</span>
    </div>
    <div className="absolute left-1/2 top-[47%] w-[56%] -translate-x-1/2 -translate-y-1/2">
      <Cover src={imageUrl} round className="aspect-square w-full shadow-[0_4px_16px_rgba(0,0,0,0.35)]" iconSize={32} />
    </div>
    <p className="absolute inset-x-2.5 bottom-2 truncate text-center text-sm font-black text-black/85">{name}</p>
  </div>
);

/** Arte do "Mix Diário": capa inteira com a faixa colorida e o número do mix. */
export const MixArt: React.FC<{ title: string; imageUrl: string }> = ({ title, imageUrl }) => {
  const band = paletteColor(title);
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
      <Cover src={imageUrl} className="absolute inset-0 h-full w-full rounded-none" iconSize={40} />
      <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(transparent 45%, ${band} 100%)` }} />
      <div className="absolute left-2.5 top-2.5 text-white drop-shadow">
        <LogoMark size={18} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[6px]" style={{ backgroundColor: band }} />
      <p className="absolute inset-x-3 bottom-3 text-lg font-black leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
        {title}
      </p>
    </div>
  );
};

interface ContextCardProps {
  context: PlaybackContext;
  to: Route;
  title: string;
  subtitle?: React.ReactNode;
  image: React.ReactNode;
  menu?: () => MenuEntry[];
}

/** Card com play verde ligado a um contexto de reprodução. */
export const ContextCard: React.FC<ContextCardProps> = ({ context, to, title, subtitle, image, menu }) => {
  const { isPlaying, toggle } = useContextPlayback(context);
  return (
    <MediaCard
      to={to}
      title={title}
      subtitle={subtitle}
      image={image}
      playing={isPlaying}
      onPlay={toggle}
      onContextMenu={menu ? (event) => openMenu(event, menu(), { header: { title } }) : undefined}
    />
  );
};

export const PlaylistCard: React.FC<{ playlist: Playlist }> = ({ playlist }) => (
  <ContextCard
    context={{ type: 'playlist', id: playlist.id, name: playlist.name }}
    to={{ name: 'playlist', id: playlist.id }}
    title={playlist.name}
    subtitle={playlist.description || `${pluralize(playlist.trackCount, 'música', 'músicas')}`}
    image={<PlaylistCover playlist={playlist} className="aspect-square w-full" iconSize={48} shadow />}
    menu={() => playlistMenu(playlist)}
  />
);

export const AlbumCard: React.FC<{ album: Album }> = ({ album }) => (
  <ContextCard
    context={{ type: 'album', id: album.id, name: album.title }}
    to={{ name: 'album', id: album.id }}
    title={album.title}
    subtitle={[album.year, album.artist_name].filter(Boolean).join(' • ') || 'Álbum'}
    image={<Cover src={apiClient.getAlbumCoverUrl(album.id)} className="aspect-square w-full" iconSize={48} shadow />}
    menu={() => albumMenu(album)}
  />
);

export const ArtistCard: React.FC<{ artist: Artist }> = ({ artist }) => (
  <ContextCard
    context={{ type: 'artist', id: artist.id, name: artist.name }}
    to={{ name: 'artist', id: artist.id }}
    title={artist.name}
    subtitle="Artista"
    image={<Cover src={apiClient.getArtistCoverUrl(artist.id)} round className="aspect-square w-full" iconSize={48} shadow />}
    menu={() => artistMenu(artist)}
  />
);

export const ArtistStationCard: React.FC<{ artist: Artist; title: string }> = ({ artist, title }) => (
  <ContextCard
    context={{ type: 'station', id: `artist:${artist.id}`, name: title }}
    to={{ name: 'station', kind: 'artist', id: artist.id }}
    title={title}
    subtitle={`Com ${artist.name} e artistas parecidos`}
    image={<StationArt name={artist.name} imageUrl={apiClient.getArtistCoverUrl(artist.id)} />}
  />
);

export const MixCard: React.FC<{ seedId: string; title: string; subtitle: string }> = ({ seedId, title, subtitle }) => (
  <ContextCard
    context={{ type: 'station', id: `track:${seedId}`, name: title }}
    to={{ name: 'station', kind: 'track', id: seedId, title }}
    title={title}
    subtitle={subtitle}
    image={<MixArt title={title} imageUrl={apiClient.getCoverUrl(seedId)} />}
  />
);

export const FolderCard: React.FC<{ folder: PlaylistFolder; count: number }> = ({ folder, count }) => (
  <MediaCard
    to={{ name: 'folder', id: folder.id }}
    title={folder.name}
    subtitle={pluralize(count, 'playlist', 'playlists')}
    image={<FolderCover className="aspect-square w-full" iconSize={48} shadow />}
    onContextMenu={(event) => openMenu(event, folderMenu(folder), { header: { title: folder.name } })}
  />
);

/** Arte de um contexto lembrado em "Tocadas recentemente". */
export function useContextArt(context: PlaybackContext): { image: (className: string, iconSize: number) => React.ReactNode; url: string | null; round: boolean } {
  const playlists = useLibraryStore((s) => s.playlists);
  switch (context.type) {
    case 'playlist': {
      const pl = playlists.find((p) => p.id === context.id);
      const first = pl?.coverTrackIds?.[0];
      return {
        image: (className, iconSize) => <PlaylistCover playlist={pl ?? { isSmart: false }} className={className} iconSize={iconSize} />,
        url: first ? apiClient.getCoverUrl(first) : null,
        round: false,
      };
    }
    case 'album': {
      const url = apiClient.getAlbumCoverUrl(context.id);
      return { image: (className, iconSize) => <Cover src={url} className={className} iconSize={iconSize} />, url, round: false };
    }
    case 'artist': {
      const url = apiClient.getArtistCoverUrl(context.id);
      return { image: (className, iconSize) => <Cover src={url} round className={className} iconSize={iconSize} />, url, round: true };
    }
    case 'offline':
      return { image: (className, iconSize) => <OfflineCover className={className} iconSize={iconSize} />, url: null, round: false };
    case 'station': {
      const [kind, ...rest] = context.id.split(':');
      const id = rest.join(':');
      const url = kind === 'artist' ? apiClient.getArtistCoverUrl(id) : apiClient.getCoverUrl(id);
      return { image: (className, iconSize) => <Cover src={url} className={className} iconSize={iconSize} />, url, round: false };
    }
    default:
      return { image: (className, iconSize) => <Cover className={className} iconSize={iconSize} />, url: null, round: false };
  }
}

/** Atalho compacto do topo da Início: capa, nome e play que aparece no hover. */
export const QuickCard: React.FC<{
  context: PlaybackContext;
  to: Route;
  title: string;
  onHoverColor: (color: string | null) => void;
}> = ({ context, to, title, onHoverColor }) => {
  const { isPlaying, toggle } = useContextPlayback(context);
  const art = useContextArt(context);
  const color = useDominantColor(art.url, '#535353');

  return (
    <div
      className="group relative flex h-12 items-center overflow-hidden rounded bg-white/[0.07] transition-colors hover:bg-white/[0.2] md:h-16"
      onMouseEnter={() => onHoverColor(color)}
      onMouseLeave={() => onHoverColor(null)}
    >
      {art.image('h-12 w-12 md:h-16 md:w-16 shrink-0 rounded-none shadow-[0_8px_24px_rgba(0,0,0,0.5)]', 20)}
      <Link to={to} className="min-w-0 flex-1 px-2 text-sm font-bold after:absolute after:inset-0 after:content-[''] md:px-4 md:text-base">
        <span className="line-clamp-2">{title}</span>
      </Link>
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? `Pausar ${title}` : `Tocar ${title}`}
        className={[
          'relative z-10 mr-2 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sp-green text-black shadow-[0_8px_8px_rgba(0,0,0,0.3)] hover:scale-[1.04] md:flex',
          isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        ].join(' ')}
      >
        {isPlaying ? <Pause size={14} fill="currentColor" strokeWidth={0} /> : <Play size={14} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />}
      </button>
    </div>
  );
};

/** Card de "Tocadas recentemente". */
export const RecentCard: React.FC<{ context: PlaybackContext; to: Route }> = ({ context, to }) => {
  const art = useContextArt(context);
  const kindLabel: Record<string, string> = {
    playlist: 'Playlist',
    album: 'Álbum',
    artist: 'Artista',
    station: 'Rádio',
    offline: 'Playlist',
  };
  return (
    <ContextCard
      context={context}
      to={to}
      title={context.name}
      subtitle={kindLabel[context.type] ?? ''}
      image={art.image('aspect-square w-full shadow-[0_8px_24px_rgba(0,0,0,0.5)]', 48)}
    />
  );
};
