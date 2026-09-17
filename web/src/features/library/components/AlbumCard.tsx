import React from 'react';
import type { Album } from '../../../domain/album.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Disc3 } from 'lucide-react';

interface Props {
  album: Album;
  onClick: () => void;
}

export const AlbumCard: React.FC<Props> = ({ album, onClick }) => {
  const coverUrl = apiClient.getCoverUrl(album.id);

  return (
    <div
      onClick={onClick}
      className="group bg-zinc-900/60 hover:bg-zinc-800/80 p-4 rounded-xl cursor-pointer transition-all border border-zinc-800/40 hover:border-zinc-700/60 shadow-md"
    >
      <div className="relative aspect-square mb-3 rounded-lg overflow-hidden bg-zinc-800 flex items-center justify-center">
        <img
          src={coverUrl}
          alt={album.title}
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <Disc3 className="absolute text-zinc-600 w-12 h-12 pointer-events-none" />
      </div>

      <h3 className="font-semibold text-sm text-zinc-100 truncate group-hover:text-emerald-400 transition-colors">
        {album.title}
      </h3>
      <p className="text-xs text-zinc-400 truncate mt-0.5">
        {album.year ? `${album.year}` : 'Álbum'}
      </p>
    </div>
  );
};
