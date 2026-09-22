import { create } from 'zustand';
import type { Album, Artist } from '../../../domain/album.ts';
import type { Playlist } from '../../../domain/playlist.ts';
import type { PlaylistFolder } from '../../../domain/folder.ts';
import type { Track } from '../../../domain/track.ts';
import { apiClient } from '../../../adapters/api/client.ts';

interface LibraryStore {
  playlists: Playlist[];
  folders: PlaylistFolder[];
  albums: Album[];
  artists: Artist[];
  loaded: boolean;
  /** Muda sempre que o conteúdo de alguma playlist muda, para as telas abertas recarregarem. */
  version: number;

  refresh: () => Promise<void>;
  /** "Criar > Playlist": cria "Minha playlist nº N" na hora, como o Spotify. */
  createPlaylist: (options?: { folderId?: string | null; tracks?: Track[] }) => Promise<Playlist>;
  updatePlaylist: (id: string, name: string, description: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  movePlaylist: (id: string, folderId: string | null) => Promise<void>;
  addTracks: (playlistId: string, tracks: Track[]) => Promise<number>;
  removeTrack: (playlistId: string, trackId: string) => Promise<void>;
  createFolder: (name: string) => Promise<PlaylistFolder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

const LIST_LIMIT = 500;

function nextPlaylistName(playlists: Playlist[]): string {
  const taken = new Set(playlists.map((pl) => pl.name));
  let n = playlists.length + 1;
  while (taken.has(`Minha playlist nº ${n}`)) n++;
  return `Minha playlist nº ${n}`;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  playlists: [],
  folders: [],
  albums: [],
  artists: [],
  loaded: false,
  version: 0,

  async refresh() {
    const [playlists, folders, albums, artists] = await Promise.all([
      apiClient.listPlaylists().catch(() => get().playlists),
      // Um servidor antigo, sem pastas, simplesmente mostra a biblioteca sem elas.
      apiClient.listFolders().catch(() => get().folders),
      apiClient.listAlbums(0, LIST_LIMIT).then((r) => r.data).catch(() => get().albums),
      apiClient.listArtists(0, LIST_LIMIT).then((r) => r.data).catch(() => get().artists),
    ]);
    set({ playlists, folders, albums, artists, loaded: true });
  },

  async createPlaylist(options = {}) {
    const created = await apiClient.createPlaylist(nextPlaylistName(get().playlists));
    if (options.folderId) await apiClient.movePlaylist(created.id, options.folderId);
    if (options.tracks?.length) await get().addTracks(created.id, options.tracks);
    await get().refresh();
    return created;
  },

  async updatePlaylist(id, name, description) {
    await apiClient.updatePlaylist(id, name, description);
    await get().refresh();
    set((state) => ({ version: state.version + 1 }));
  },

  async deletePlaylist(id) {
    await apiClient.deletePlaylist(id);
    set((state) => ({ playlists: state.playlists.filter((pl) => pl.id !== id) }));
    await get().refresh();
  },

  async movePlaylist(id, folderId) {
    await apiClient.movePlaylist(id, folderId);
    set((state) => ({
      playlists: state.playlists.map((pl) => (pl.id === id ? { ...pl, folderId } : pl)),
    }));
  },

  // Sequencial: a API recebe uma faixa por vez e a ordem de adição vira a ordem da playlist.
  async addTracks(playlistId, tracks) {
    let added = 0;
    for (const track of tracks) {
      try {
        await apiClient.addTrackToPlaylist(playlistId, track.id);
        added++;
      } catch {
        // Uma faixa que falha não impede as demais.
      }
    }
    set((state) => ({ version: state.version + 1 }));
    void get().refresh();
    return added;
  },

  async removeTrack(playlistId, trackId) {
    await apiClient.removeTrackFromPlaylist(playlistId, trackId);
    set((state) => ({ version: state.version + 1 }));
    void get().refresh();
  },

  async createFolder(name) {
    const folder = await apiClient.createFolder(name);
    set((state) => ({ folders: [...state.folders, folder] }));
    return folder;
  },

  async renameFolder(id, name) {
    const folder = await apiClient.renameFolder(id, name);
    set((state) => ({ folders: state.folders.map((f) => (f.id === id ? folder : f)) }));
  },

  async deleteFolder(id) {
    await apiClient.deleteFolder(id);
    // As playlists da pasta voltam para a raiz (ON DELETE SET NULL no servidor).
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      playlists: state.playlists.map((pl) => (pl.folderId === id ? { ...pl, folderId: null } : pl)),
    }));
  },
}));
