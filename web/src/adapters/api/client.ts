import { endpoints } from './endpoints.ts';
import type { Track } from '../../domain/track.ts';
import type { Album, Artist } from '../../domain/album.ts';
import type {
  DownloadJob,
  DownloadJobItem,
  DownloadMode,
  LinkInspection,
  SourceRef,
} from '../../domain/download.ts';
import type { RemoteArtist, RemoteItem, RemotePlaylist, SearchType } from '../../domain/discovery.ts';
import type { Playlist } from '../../domain/playlist.ts';
import type { PlaylistFolder } from '../../domain/folder.ts';

/** sendJson centralizes the error shape the API returns ({"error": "..."}). */
async function sendJson<T>(method: string, url: string, body: unknown, fallbackMessage: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ error: fallbackMessage }));
    throw new Error(errJson.error || fallbackMessage);
  }
  if (res.status === 204) return undefined as T;
  // Some routes answer 201 with an empty body (e.g. adding a track to a playlist).
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function postJson<T>(url: string, body: unknown, fallbackMessage: string): Promise<T> {
  return sendJson<T>('POST', url, body, fallbackMessage);
}

export const apiClient = {
  async listTracks(offset = 0, limit = 50, query = ''): Promise<{ data: Track[]; total: number }> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (query) params.set('q', query);
    const res = await fetch(`${endpoints.tracks}?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao buscar músicas');
    const json = await res.json();
    return { data: json.data || [], total: json.total || 0 };
  },

  async getTrack(id: string): Promise<Track> {
    const res = await fetch(endpoints.track(id));
    if (!res.ok) throw new Error('Faixa não encontrada');
    return res.json();
  },

  async listAlbums(offset = 0, limit = 50): Promise<{ data: Album[]; total: number }> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    const res = await fetch(`${endpoints.albums}?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao buscar álbuns');
    const json = await res.json();
    return { data: json.data || [], total: json.total || 0 };
  },

  async getAlbum(id: string): Promise<{ album: Album; tracks: Track[] }> {
    const res = await fetch(endpoints.album(id));
    if (!res.ok) throw new Error('Álbum não encontrado');
    const json = await res.json();
    return { album: json.album, tracks: json.tracks || [] };
  },

  async listArtists(offset = 0, limit = 50): Promise<{ data: Artist[]; total: number }> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    const res = await fetch(`${endpoints.artists}?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao buscar artistas');
    const json = await res.json();
    return { data: json.data || [], total: json.total || 0 };
  },

  async getArtist(id: string): Promise<{ artist: Artist; albums: Album[]; tracks: Track[] }> {
    const res = await fetch(endpoints.artist(id));
    if (!res.ok) throw new Error('Artista não encontrado');
    const json = await res.json();
    return { artist: json.artist, albums: json.albums || [], tracks: json.tracks || [] };
  },

  async getRadio(seedId: string, limit = 20, recentArtists: string[] = [], recentTracks: string[] = []): Promise<Track[]> {
    const params = new URLSearchParams({
      seed_track_id: seedId,
      limit: String(limit),
    });
    if (recentArtists.length > 0) params.set('recent_artist_ids', recentArtists.join(','));
    if (recentTracks.length > 0) params.set('recent_track_ids', recentTracks.join(','));

    const res = await fetch(`${endpoints.radio}?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao obter faixas recomendadas');
    const json = await res.json();
    return json.data || [];
  },

  async listPlaylists(): Promise<Playlist[]> {
    const res = await fetch(endpoints.playlists);
    if (!res.ok) throw new Error('Falha ao buscar playlists');
    const json = await res.json();
    return json.data || [];
  },

  async getPlaylist(id: string): Promise<Playlist> {
    const res = await fetch(endpoints.playlist(id));
    if (!res.ok) throw new Error('Falha ao buscar playlist');
    return res.json();
  },

  async createPlaylist(name: string, description = ''): Promise<Playlist> {
    const res = await fetch(endpoints.playlists, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro ao criar playlist' }));
      throw new Error(err.error || 'Falha ao criar playlist');
    }
    return res.json();
  },

  async createSmartPlaylist(seedTrackId: string, name?: string, limit = 25): Promise<Playlist> {
    const res = await fetch(endpoints.smartPlaylist, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seedTrackId, name, limit }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro ao gerar playlist inteligente' }));
      throw new Error(err.error || 'Falha ao gerar playlist inteligente');
    }
    return res.json();
  },

  /** "Editar detalhes": o servidor sempre recebe nome e descrição juntos. */
  async updatePlaylist(id: string, name: string, description: string): Promise<Playlist> {
    return sendJson<Playlist>('PATCH', endpoints.playlist(id), { name, description }, 'Falha ao editar playlist');
  },

  /** Move a playlist para uma pasta, ou de volta à raiz com null. */
  async movePlaylist(id: string, folderId: string | null): Promise<void> {
    await sendJson<void>('PUT', endpoints.playlistFolder(id), { folderId }, 'Falha ao mover playlist');
  },

  async listFolders(): Promise<PlaylistFolder[]> {
    const res = await fetch(endpoints.folders);
    if (!res.ok) throw new Error('Falha ao buscar pastas');
    const json = await res.json();
    return json.data || [];
  },

  async createFolder(name: string): Promise<PlaylistFolder> {
    return postJson<PlaylistFolder>(endpoints.folders, { name }, 'Falha ao criar pasta');
  },

  async renameFolder(id: string, name: string): Promise<PlaylistFolder> {
    return sendJson<PlaylistFolder>('PATCH', endpoints.folder(id), { name }, 'Falha ao renomear pasta');
  },

  async deleteFolder(id: string): Promise<void> {
    await sendJson<void>('DELETE', endpoints.folder(id), undefined, 'Falha ao excluir pasta');
  },

  async deletePlaylist(id: string): Promise<void> {
    const res = await fetch(endpoints.playlist(id), { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao remover playlist');
  },

  async addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    const res = await fetch(endpoints.playlistTracks(playlistId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId }),
    });
    if (!res.ok) throw new Error('Falha ao adicionar música à playlist');
  },

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const res = await fetch(endpoints.playlistTrack(playlistId, trackId), { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao remover música da playlist');
  },

  async submitDownload(url: string, mode?: DownloadMode): Promise<DownloadJob> {
    return postJson<DownloadJob>(endpoints.downloads, { url, mode }, 'Falha ao enfileirar download');
  },

  /** Enqueues an item picked in the search screen, with no URL parsing involved (RF8.1). */
  async submitSource(source: SourceRef): Promise<DownloadJob> {
    return postJson<DownloadJob>(endpoints.downloads, { source }, 'Falha ao enfileirar download');
  },

  /** Enqueues a multi-selection in one request (RF8.1). */
  async submitBatch(items: SourceRef[]): Promise<DownloadJob[]> {
    const json = await postJson<{ data: DownloadJob[] }>(
      endpoints.downloadBatch,
      { items },
      'Falha ao enfileirar downloads',
    );
    return json.data || [];
  },

  /** Asks what is behind a pasted link before enqueuing anything (RF6.2). */
  async inspectLink(url: string): Promise<LinkInspection> {
    return postJson<LinkInspection>(endpoints.downloadInspect, { url }, 'Não foi possível analisar o link');
  },

  async listDownloads(limit = 20): Promise<DownloadJob[]> {
    const res = await fetch(`${endpoints.downloads}?limit=${limit}`);
    if (!res.ok) throw new Error('Falha ao buscar downloads');
    const json = await res.json();
    return json.data || [];
  },

  async listDownloadItems(jobId: string): Promise<DownloadJobItem[]> {
    const res = await fetch(endpoints.downloadItems(jobId));
    if (!res.ok) throw new Error('Falha ao buscar itens do download');
    const json = await res.json();
    return json.data || [];
  },

  async cancelDownload(jobId: string): Promise<void> {
    const res = await fetch(endpoints.downloadCancel(jobId), { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao cancelar download');
  },

  async retryDownload(jobId: string): Promise<DownloadJob> {
    return postJson<DownloadJob>(endpoints.downloadRetry(jobId), undefined, 'Falha ao reenviar download');
  },

  async deleteDownload(jobId: string): Promise<void> {
    const res = await fetch(endpoints.downloadJob(jobId), { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao remover download do histórico');
  },

  /** Searches the remote catalog (RF7.1). */
  async searchRemote(query: string, type: SearchType = 'all', limit = 20): Promise<RemoteItem[]> {
    const params = new URLSearchParams({ q: query, type, limit: String(limit) });
    const res = await fetch(`${endpoints.discoverSearch}?${params.toString()}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({ error: 'Erro na busca' }));
      throw new Error(errJson.error || 'Falha ao buscar no YouTube');
    }
    const json = await res.json();
    return json.data || [];
  },

  async getRemotePlaylist(id: string): Promise<RemotePlaylist> {
    const res = await fetch(endpoints.discoverPlaylist(id));
    if (!res.ok) throw new Error('Falha ao carregar playlist remota');
    return res.json();
  },

  async getRemoteArtist(id: string): Promise<RemoteArtist> {
    const res = await fetch(endpoints.discoverArtist(id));
    if (!res.ok) throw new Error('Falha ao carregar artista remoto');
    return res.json();
  },

  async triggerScan(): Promise<void> {
    await fetch(endpoints.scan, { method: 'POST' });
  },

  getStreamUrl(trackId: string): string {
    return endpoints.stream(trackId);
  },

  getCoverUrl(trackId: string): string {
    return endpoints.cover(trackId);
  },

  getAlbumCoverUrl(albumId: string): string {
    return endpoints.albumCover(albumId);
  },

  getArtistCoverUrl(artistId: string): string {
    return endpoints.artistCover(artistId);
  },
};

