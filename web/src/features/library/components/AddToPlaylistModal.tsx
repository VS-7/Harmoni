import React, { useState, useEffect } from 'react';
import { X, Plus, Sparkles, Check, ListMusic } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import type { Playlist } from '../../../domain/playlist.ts';
import { apiClient } from '../../../adapters/api/client.ts';

interface Props {
  track: Track | null;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export const AddToPlaylistModal: React.FC<Props> = ({ track, onClose, onSuccess }) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isGeneratingSmart, setIsGeneratingSmart] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  useEffect(() => {
    if (!track) return;
    loadPlaylists();
  }, [track]);

  async function loadPlaylists() {
    try {
      setLoading(true);
      const list = await apiClient.listPlaylists();
      setPlaylists(list || []);
    } catch (err) {
      console.error('Falha ao carregar playlists:', err);
    } finally {
      setLoading(false);
    }
  }

  if (!track) return null;

  const handleAddToExisting = async (playlistId: string) => {
    try {
      await apiClient.addTrackToPlaylist(playlistId, track.id);
      setAddedId(playlistId);
      setTimeout(() => {
        onSuccess?.('Música adicionada à playlist!');
        onClose();
      }, 600);
    } catch (err) {
      alert('Falha ao adicionar música à playlist: ' + (err as Error).message);
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    try {
      setIsCreating(true);
      const pl = await apiClient.createPlaylist(newPlaylistName.trim());
      await apiClient.addTrackToPlaylist(pl.id, track.id);
      onSuccess?.(`Playlist "${pl.name}" criada com a música!`);
      onClose();
    } catch (err) {
      alert('Falha ao criar playlist: ' + (err as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateSmartMix = async () => {
    try {
      setIsGeneratingSmart(true);
      const pl = await apiClient.createSmartPlaylist(track.id, `Mix: ${track.title}`, 25);
      onSuccess?.(`Mix Inteligente "${pl.name}" gerado com sucesso com ${pl.trackCount} músicas similares!`);
      onClose();
    } catch (err) {
      alert('Falha ao gerar mix inteligente: ' + (err as Error).message);
    } finally {
      setIsGeneratingSmart(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h3 className="font-bold text-zinc-100">Adicionar à Playlist</h3>
            <p className="text-xs text-zinc-400 truncate max-w-[280px]">
              {track.title} • {track.artist_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Smart Mix Option */}
          <button
            onClick={handleGenerateSmartMix}
            disabled={isGeneratingSmart}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-purple-950/60 to-indigo-950/60 border border-purple-800/40 hover:border-purple-600/60 text-left group transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Sparkles size={20} className={isGeneratingSmart ? 'animate-spin' : ''} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-purple-200 flex items-center gap-2">
                <span>Criar Mix Inteligente (AI)</span>
                <span className="text-[10px] uppercase tracking-wider bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono">pgvector</span>
              </div>
              <p className="text-xs text-purple-300/70 truncate">
                Gera uma playlist automática com músicas semelhantes
              </p>
            </div>
          </button>

          {/* Create New Form */}
          <form onSubmit={handleCreateNew} className="flex gap-2">
            <input
              type="text"
              placeholder="Nova playlist..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!newPlaylistName.trim() || isCreating}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs rounded-lg transition-colors"
            >
              <Plus size={16} />
              Criar
            </button>
          </form>

          {/* Existing Playlists */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-zinc-400 px-1 mb-2">Suas Playlists</p>
            {loading ? (
              <p className="text-xs text-zinc-500 text-center py-4">Carregando playlists...</p>
            ) : playlists.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">Nenhuma playlist criada ainda.</p>
            ) : (
              playlists.map((pl) => {
                const isSuccess = addedId === pl.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => handleAddToExisting(pl.id)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-zinc-800 text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-emerald-400 transition-colors">
                        <ListMusic size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200 truncate">{pl.name}</p>
                        <p className="text-xs text-zinc-500">{pl.trackCount} músicas</p>
                      </div>
                    </div>
                    {isSuccess ? (
                      <span className="text-emerald-400 flex items-center gap-1 text-xs">
                        <Check size={16} /> Adicionada
                      </span>
                    ) : (
                      <span className="opacity-0 group-hover:opacity-100 text-xs text-emerald-400 font-semibold transition-opacity">
                        + Adicionar
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
