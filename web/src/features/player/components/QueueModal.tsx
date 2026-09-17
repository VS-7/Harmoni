import React from 'react';
import { X, Trash2, Music } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { queue, queueIndex, playTrack, removeFromQueue, clearQueue } = usePlayerStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-zinc-900 h-full p-6 flex flex-col shadow-2xl border-l border-zinc-800 animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Music size={20} className="text-emerald-400" />
            <h2 className="text-lg font-bold text-zinc-100">Fila de Reprodução</h2>
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
              {queue.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 px-2 py-1 hover:bg-rose-500/10 rounded transition-colors"
              >
                <Trash2 size={14} />
                Limpar
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-2">
          {queue.length === 0 ? (
            <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
              Nenhuma música na fila
            </div>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = idx === queueIndex;
              return (
                <div
                  key={`${track.id}-${idx}`}
                  className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'hover:bg-zinc-800/60'
                  }`}
                  onClick={() => playTrack(track)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-xs font-mono w-5 text-right ${
                        isCurrent ? 'text-emerald-400 font-bold' : 'text-zinc-500'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          isCurrent ? 'text-emerald-400' : 'text-zinc-200'
                        }`}
                      >
                        {track.title}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">
                        {track.artist_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-zinc-500 font-mono">
                      {formatDuration(track.duration_sec)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(idx);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity p-1"
                      title="Remover da fila"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
