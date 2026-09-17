import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, Music2, Disc3, HardDriveDownload } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import type { Album } from '../../../domain/album.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { offlineStorage } from '../../../adapters/storage/offline_store.ts';
import { TrackList } from './TrackList.tsx';
import { AlbumCard } from './AlbumCard.tsx';

type Tab = 'tracks' | 'albums' | 'offline';

export const LibraryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [searchQuery, setSearchQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<{ album: Album; tracks: Track[] } | null>(null);

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  async function loadData() {
    setLoading(true);
    try {
      // 1. Fetch tracks and albums from server
      const [tracksRes, albumsRes, offlineList] = await Promise.all([
        apiClient.listTracks(0, 100, searchQuery).catch(() => ({ data: [], total: 0 })),
        apiClient.listAlbums(0, 50).catch(() => ({ data: [], total: 0 })),
        offlineStorage.listOfflineTracks().catch(() => []),
      ]);
      setTracks(tracksRes?.data || []);
      setAlbums(albumsRes?.data || []);
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
    } catch (err) {
      alert('Falha ao abrir álbum: ' + (err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Search and Scan */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => {
              setActiveTab('tracks');
              setSelectedAlbum(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'tracks'
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
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'albums'
                ? 'bg-emerald-500 text-zinc-950 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Disc3 size={16} />
            Álbuns ({(albums || []).length})
          </button>

          <button
            onClick={() => {
              setActiveTab('offline');
              setSelectedAlbum(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'offline'
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
              placeholder="Buscar faixas, artistas..."
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

      {/* Album Modal / Detail View */}
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

      {/* Main Content Area */}
      {!selectedAlbum && (
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
