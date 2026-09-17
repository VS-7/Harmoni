import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, Music2, Disc3, HardDriveDownload, ListMusic, Plus, Play } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import type { Album } from '../../../domain/album.ts';
import type { Playlist } from '../../../domain/playlist.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { offlineStorage } from '../../../adapters/storage/offline_store.ts';
import { TrackList } from './TrackList.tsx';
import { AlbumCard } from './AlbumCard.tsx';
import { PlaylistCard } from './PlaylistCard.tsx';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';

type Tab = 'tracks' | 'albums' | 'playlists' | 'offline';

export const LibraryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<{ album: Album; tracks: Track[] } | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);

  // New Playlist Modal state
  const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [isCreatingPL, setIsCreatingPL] = useState(false);

  const { playTrack } = usePlayerStore();

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  async function loadData() {
    setLoading(true);
    try {
      // 1. Fetch tracks, albums and playlists from server
      const [tracksRes, albumsRes, playlistsRes, offlineList] = await Promise.all([
        apiClient.listTracks(0, 100, searchQuery).catch(() => ({ data: [], total: 0 })),
        apiClient.listAlbums(0, 50).catch(() => ({ data: [], total: 0 })),
        apiClient.listPlaylists().catch(() => []),
        offlineStorage.listOfflineTracks().catch(() => []),
      ]);
      setTracks(tracksRes?.data || []);
      setAlbums(albumsRes?.data || []);
      setPlaylists(playlistsRes || []);
      setOfflineTracks(offlineList || []);
    } catch {
      // Fallback to offline tracks if server is unreachable
      const offlineList = await offlineStorage.listOfflineTracks().catch(() => []);
      setOfflineTracks(offlineList || []);
      setTracks(offlineList || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleScan() {
    try {
      setIsScanning(true);
      await apiClient.triggerScan();
      setTimeout(loadData, 2000);
    } catch (err) {
      alert('Falha ao acionar varredura: ' + (err as Error).message);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleSelectAlbum(album: Album) {
    try {
      const details = await apiClient.getAlbum(album.id);
      setSelectedAlbum(details);
      setSelectedPlaylist(null);
    } catch (err) {
      alert('Falha ao abrir álbum: ' + (err as Error).message);
    }
  }

  async function handleSelectPlaylist(pl: Playlist) {
    try {
      const full = await apiClient.getPlaylist(pl.id);
      setSelectedPlaylist(full);
      setSelectedAlbum(null);
    } catch (err) {
      alert('Falha ao abrir playlist: ' + (err as Error).message);
    }
  }

  async function handleDeletePlaylist(id: string) {
    try {
      await apiClient.deletePlaylist(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      if (selectedPlaylist?.id === id) {
        setSelectedPlaylist(null);
      }
    } catch (err) {
      alert('Falha ao deletar playlist: ' + (err as Error).message);
    }
  }

  async function handleRemoveTrackFromCurrentPlaylist(trackId: string) {
    if (!selectedPlaylist) return;
    try {
      await apiClient.removeTrackFromPlaylist(selectedPlaylist.id, trackId);
      const updatedTracks = (selectedPlaylist.tracks || []).filter((t) => t.id !== trackId);
      const updatedDuration = updatedTracks.reduce((acc, t) => acc + t.duration_sec, 0);
      setSelectedPlaylist({
        ...selectedPlaylist,
        tracks: updatedTracks,
        trackCount: updatedTracks.length,
        duration: updatedDuration,
      });
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === selectedPlaylist.id
            ? { ...p, trackCount: updatedTracks.length, duration: updatedDuration }
            : p
        )
      );
    } catch (err) {
      alert('Falha ao remover faixa da playlist: ' + (err as Error).message);
    }
  }

  async function handlePlayPlaylist(pl: Playlist) {
    try {
      const full = await apiClient.getPlaylist(pl.id);
      if (full.tracks && full.tracks.length > 0) {
        playTrack(full.tracks[0], full.tracks);
      }
    } catch (err) {
      alert('Falha ao reproduzir playlist: ' + (err as Error).message);
    }
  }

  async function handleCreatePlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    try {
      setIsCreatingPL(true);
      const created = await apiClient.createPlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
      setPlaylists((prev) => [created, ...prev]);
      setShowNewPlaylistModal(false);
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      handleSelectPlaylist(created);
    } catch (err) {
      alert('Falha ao criar playlist: ' + (err as Error).message);
    } finally {
      setIsCreatingPL(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Search, Tabs, and Scan */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 overflow-x-auto">
          <button
            onClick={() => {
              setActiveTab('tracks');
              setSelectedAlbum(null);
              setSelectedPlaylist(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'tracks' && !selectedAlbum && !selectedPlaylist
                ? 'bg-emerald-500 text-zinc-950 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Music2 size={16} />
            Músicas ({(tracks || []).length})
          </button>

          <button
            onClick={() => {
              setActiveTab('albums');
              setSelectedAlbum(null);
              setSelectedPlaylist(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'albums' && !selectedAlbum && !selectedPlaylist
                ? 'bg-emerald-500 text-zinc-950 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Disc3 size={16} />
            Álbuns ({(albums || []).length})
          </button>

          <button
            onClick={() => {
              setActiveTab('playlists');
              setSelectedAlbum(null);
              setSelectedPlaylist(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'playlists' && !selectedAlbum && !selectedPlaylist
                ? 'bg-emerald-500 text-zinc-950 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ListMusic size={16} />
            Playlists ({(playlists || []).length})
          </button>

          <button
            onClick={() => {
              setActiveTab('offline');
              setSelectedAlbum(null);
              setSelectedPlaylist(null);
            }}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'offline' && !selectedAlbum && !selectedPlaylist
                ? 'bg-emerald-500 text-zinc-950 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <HardDriveDownload size={16} />
            Offline ({(offlineTracks || []).length})
          </button>
        </div>

        {/* Search & Scan Action */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder="Buscar músicas, álbuns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <button
            onClick={handleScan}
            disabled={isScanning}
            className="p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-300 hover:text-emerald-400 transition-colors"
            title="Escanear pasta de músicas"
          >
            <RefreshCw size={16} className={isScanning ? 'animate-spin text-emerald-400' : ''} />
          </button>
        </div>
      </div>

      {/* Album Detail View */}
      {selectedAlbum && (
        <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <h2 className="text-xl font-bold text-zinc-100">{selectedAlbum.album.title}</h2>
              <p className="text-sm text-zinc-400">
                {selectedAlbum.tracks.length} músicas • {selectedAlbum.album.year || 'Ano desconhecido'}
              </p>
            </div>
            <button
              onClick={() => setSelectedAlbum(null)}
              className="text-xs text-zinc-400 hover:text-zinc-100 px-3 py-1.5 bg-zinc-800 rounded-lg"
            >
              Fechar
            </button>
          </div>
          <TrackList tracks={selectedAlbum.tracks} />
        </div>
      )}

      {/* Playlist Detail View */}
      {selectedPlaylist && (
        <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-zinc-100">{selectedPlaylist.name}</h2>
                {selectedPlaylist.isSmart && (
                  <span className="text-[10px] uppercase font-bold tracking-wider bg-purple-950 border border-purple-800 text-purple-300 px-2 py-0.5 rounded-full font-mono">
                    Mix Inteligente (AI)
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-400 mt-0.5">
                {selectedPlaylist.description || 'Playlist de reprodução'} • {selectedPlaylist.trackCount} músicas
                {selectedPlaylist.duration > 0 && ` • ${formatDuration(selectedPlaylist.duration)}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 && (
                <button
                  onClick={() => playTrack(selectedPlaylist.tracks![0], selectedPlaylist.tracks!)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl shadow transition-colors"
                >
                  <Play size={14} fill="currentColor" />
                  Tocar Tudo
                </button>
              )}
              <button
                onClick={() => setSelectedPlaylist(null)}
                className="text-xs text-zinc-400 hover:text-zinc-100 px-3 py-2 bg-zinc-800 rounded-xl"
              >
                Voltar
              </button>
            </div>
          </div>

          {(!selectedPlaylist.tracks || selectedPlaylist.tracks.length === 0) ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              Nenhuma música nesta playlist. Adicione músicas clicando no ícone de "+" na lista de músicas!
            </div>
          ) : (
            <TrackList
              tracks={selectedPlaylist.tracks}
              playlistContext={true}
              onRemoveFromPlaylist={handleRemoveTrackFromCurrentPlaylist}
            />
          )}
        </div>
      )}

      {/* New Playlist Modal */}
      {showNewPlaylistModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-100">Criar Nova Playlist</h3>
            <form onSubmit={handleCreatePlaylist} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Nome da Playlist</label>
                <input
                  type="text"
                  placeholder="Ex: Treino, Favoritas, Relax..."
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Descrição (opcional)</label>
                <textarea
                  placeholder="Descrição da playlist..."
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewPlaylistModal(false)}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim() || isCreatingPL}
                  className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg"
                >
                  {isCreatingPL ? 'Criando...' : 'Criar Playlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!selectedAlbum && !selectedPlaylist && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-zinc-500 text-sm">
              Carregando biblioteca...
            </div>
          ) : activeTab === 'tracks' ? (
            (!tracks || tracks.length === 0) ? (
              <div className="text-center py-20 text-zinc-500 text-sm">
                Nenhuma música encontrada. Clique no ícone de atualização para escanear a pasta ou baixe uma música pela aba Downloads!
              </div>
            ) : (
              <TrackList tracks={tracks} />
            )
          ) : activeTab === 'albums' ? (
            (!albums || albums.length === 0) ? (
              <div className="text-center py-20 text-zinc-500 text-sm">Nenhum álbum indexado.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {albums.map((album) => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    onClick={() => handleSelectAlbum(album)}
                  />
                ))}
              </div>
            )
          ) : activeTab === 'playlists' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-400">Playlists Salvas</h3>
                <button
                  onClick={() => setShowNewPlaylistModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold rounded-lg shadow transition-colors"
                >
                  <Plus size={14} />
                  Nova Playlist
                </button>
              </div>

              {(!playlists || playlists.length === 0) ? (
                <div className="text-center py-16 text-zinc-500 text-sm bg-zinc-900/20 border border-zinc-800/40 rounded-2xl">
                  <ListMusic className="mx-auto text-zinc-600 mb-2 w-10 h-10" />
                  <p>Nenhuma playlist criada ainda.</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    Crie uma playlist manual ou clique no "+" em qualquer música para gerar um Mix Inteligente!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {playlists.map((pl) => (
                    <PlaylistCard
                      key={pl.id}
                      playlist={pl}
                      onClick={() => handleSelectPlaylist(pl)}
                      onDelete={handleDeletePlaylist}
                      onPlay={handlePlayPlaylist}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            (!offlineTracks || offlineTracks.length === 0) ? (
              <div className="text-center py-20 text-zinc-500 text-sm">
                Nenhuma música salva offline ainda. Clique no ícone de download ao lado de qualquer música para torná-la disponível sem internet!
              </div>
            ) : (
              <TrackList tracks={offlineTracks} />
            )
          )}
        </>
      )}
    </div>
  );
};
