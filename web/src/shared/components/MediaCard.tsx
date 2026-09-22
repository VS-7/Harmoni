import React from 'react';
import { Link } from '../../app/router/Link.tsx';
import type { Route } from '../../app/router/routes.ts';
import { PlayButton } from './PlayButton.tsx';

interface MediaCardProps {
  to: Route;
  title: string;
  subtitle?: React.ReactNode;
  /** Arte quadrada (ou redonda, para artistas). */
  image: React.ReactNode;
  onPlay?: () => void;
  playing?: boolean;
  onContextMenu?: (event: React.MouseEvent) => void;
}

/** Card das estantes: arte com sombra, botão verde que sobe no hover, título e subtítulo. */
export const MediaCard: React.FC<MediaCardProps> = ({ to, title, subtitle, image, onPlay, playing = false, onContextMenu }) => (
  <div
    className="group relative rounded-md p-3 transition-colors duration-200 hover:bg-sp-elevated"
    onContextMenu={onContextMenu}
  >
    <div className="relative mb-2 aspect-square w-full">
      {image}
      {onPlay && (
        <div
          className={[
            'absolute bottom-2 right-2 z-10 transition-[opacity,transform] duration-200',
            playing
              ? 'translate-y-0 opacity-100'
              : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100',
          ].join(' ')}
        >
          <PlayButton
            playing={playing}
            label={title}
            onClick={(event) => {
              event.stopPropagation();
              onPlay();
            }}
          />
        </div>
      )}
    </div>
    <Link to={to} className="block truncate text-base font-bold text-white after:absolute after:inset-0 after:content-['']" title={title}>
      {title}
    </Link>
    {subtitle && <div className="mt-1 line-clamp-2 text-sm text-sp-subdued">{subtitle}</div>}
  </div>
);
