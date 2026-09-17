import React from 'react';
import { ListMusic, Sparkles, Trash2, Play } from 'lucide-react';
import type { Playlist } from '../../../domain/playlist.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';

interface Props {
  playlist: Playlist;
  onClick: () => void;
  onDelete: (id: string) => void;
  onPlay: (playlist: Playlist) => void;
}

export const PlaylistCard: React.FC<Props> = ({ playlist, onClick, onDelete, onPlay }) => {
  return (
    <div
      onClick={onClick}
      className="group relative bg-zinc-900/60 hover:bg-zinc-800/80 p-4 rounded-xl cursor-pointer transition-all border border-zinc-800/40 hover:border-zinc-700/60 shadow-md flex flex-col justify-between"
    >
      <div>
        {/* Cover / Icon Preview */}
        <div className="relative aspect-square mb-3 rounded-lg overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center border border-zinc-800">
          {playlist.isSmart ? (
            <div className="flex flex-col items-center gap-1 text-purple-400">
              <Sparkles className="w-12 h-12" />
            </div>
          ) : (
            <ListMusic className="text-zinc-600 group-hover:text-emerald-400 w-12 h-12 transition-colors" />
          )}

          {/* Quick Play Floating Button */}
          {playlist.trackCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay(playlist);
              }}
              className="absolute bottom-2 right-2 p-3 rounded-full bg-emerald-500 text-zinc-950 opacity-0 group-hover:opacity-100 hover:scale-105 shadow-xl transition-all"
              title="Reproduzir Playlist"
            >
              <Play size={16} fill="currentColor" />
            </button>
          )}

          {/* Smart Badge */}
          {playlist.isSmart && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-purple-950/80 border border-purple-800/60 text-purple-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
              <Sparkles size={10} />
              <span>SMART</span>
            </div>
          )}
        </div>

        <h3 className="font-semibold text-sm text-zinc-100 truncate group-hover:text-emerald-400 transition-colors">
          {playlist.name}
        </h3>
        {playlist.description && (
          <p className="text-xs text-zinc-500 truncate mt-0.5">
            {playlist.description}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/60 text-xs text-zinc-400">
        <span>
          {playlist.trackCount} {playlist.trackCount === 1 ? 'música' : 'músicas'}
          {playlist.duration > 0 && ` • ${formatDuration(playlist.duration)}`}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Deseja realmente remover a playlist "${playlist.name}"?`)) {
              onDelete(playlist.id);
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-opacity"
          title="Remover Playlist"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};
