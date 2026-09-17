import { endpoints } from './endpoints.ts';
import type { Track } from '../../domain/track.ts';
import type { Album, Artist } from '../../domain/album.ts';
import type { DownloadJob } from '../../domain/download.ts';

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

  async submitDownload(url: string): Promise<DownloadJob> {
    const res = await fetch(endpoints.downloads, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({ error: 'Erro no download' }));
      throw new Error(errJson.error || 'Falha ao enfileirar download');
    }
    return res.json();
  },

  async listDownloads(limit = 20): Promise<DownloadJob[]> {
    const res = await fetch(`${endpoints.downloads}?limit=${limit}`);
    if (!res.ok) throw new Error('Falha ao buscar downloads');
    const json = await res.json();
    return json.data || [];
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
};
