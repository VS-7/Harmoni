import React from 'react';
import { ArrowDown, Folder, ListMusic, Sparkles } from 'lucide-react';
import type { Playlist } from '../../../domain/playlist.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Cover } from '../../../shared/components/Cover.tsx';

interface PlaylistCoverProps {
  playlist: Pick<Playlist, 'coverTrackIds' | 'isSmart'>;
  className?: string;
  iconSize?: number;
  shadow?: boolean;
}

/** Capa de playlist como a do Spotify: mosaico 2×2 com quatro álbuns, ou a primeira capa. */
export const PlaylistCover: React.FC<PlaylistCoverProps> = ({ playlist, className = '', iconSize = 24, shadow = false }) => {
  const ids = playlist.coverTrackIds ?? [];
  const icon = playlist.isSmart ? Sparkles : ListMusic;

  if (ids.length >= 4) {
    return (
      <div
        className={[
          'grid shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-[4px] bg-sp-menu',
          shadow ? 'shadow-[0_8px_24px_rgba(0,0,0,0.5)]' : '',
          className,
        ].join(' ')}
      >
        {ids.slice(0, 4).map((id) => (
          <Cover key={id} src={apiClient.getCoverUrl(id)} icon={icon} iconSize={iconSize / 2} className="h-full w-full rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <Cover
      src={ids[0] ? apiClient.getCoverUrl(ids[0]) : null}
      icon={icon}
      iconSize={iconSize}
      shadow={shadow}
      className={className}
    />
  );
};

export const FolderCover: React.FC<{ className?: string; iconSize?: number; shadow?: boolean }> = ({
  className = '',
  iconSize = 24,
  shadow = false,
}) => <Cover icon={Folder} iconSize={iconSize} shadow={shadow} className={className} />;

/** A capa de "Músicas baixadas", no degradê que o Spotify usa em Músicas Curtidas. */
export const OfflineCover: React.FC<{ className?: string; iconSize?: number; shadow?: boolean }> = ({
  className = '',
  iconSize = 24,
  shadow = false,
}) => (
  <div
    className={[
      'flex shrink-0 items-center justify-center rounded-[4px] bg-[linear-gradient(135deg,#450af5,#c4efd9)]',
      shadow ? 'shadow-[0_8px_24px_rgba(0,0,0,0.5)]' : '',
      className,
    ].join(' ')}
  >
    <span className="flex items-center justify-center rounded-full bg-white/0 text-white">
      <ArrowDown size={iconSize} strokeWidth={2.5} />
    </span>
  </div>
);
