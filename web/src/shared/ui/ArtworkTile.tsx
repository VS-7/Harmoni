import React from 'react';
import { GlassSurface } from './glass/index.ts';

interface ArtworkTileProps {
  imageUrl?: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  fallbackIcon: React.ReactNode;
  onClick: () => void;
}

/** Card quadrado de álbum, playlist ou artista. */
export const ArtworkTile: React.FC<ArtworkTileProps> = ({
  imageUrl,
  title,
  subtitle,
  badge,
  fallbackIcon,
  onClick,
}) => (
  <button type="button" onClick={onClick} className="group w-full text-left active:scale-[0.97] transition-transform">
    <GlassSurface radius="md" variant="light" className="w-full">
      <div className="relative aspect-square w-full">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center opacity-40">{fallbackIcon}</span>
        )}
        {badge && <span className="absolute right-2 top-2">{badge}</span>}
      </div>
    </GlassSurface>
    <p className="truncate pt-2 text-body font-medium">{title}</p>
    {subtitle && <p className="truncate text-footnote text-[color:var(--fg-secondary)]">{subtitle}</p>}
  </button>
);
