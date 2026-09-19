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

/** postJson centralizes the error shape the API returns ({"error": "..."}). */
async function postJson<T>(url: string, body: unknown, fallbackMessage: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ error: fallbackMessage }));
    throw new Error(errJson.error || fallbackMessage);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
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
};

