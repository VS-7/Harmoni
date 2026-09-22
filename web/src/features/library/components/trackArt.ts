import type { Track } from '../../../domain/track.ts';
import { apiClient } from '../../../adapters/api/client.ts';

/** URL da capa de uma faixa (a arte embutida ou a do álbum, resolvida pelo servidor). */
export function apiCoverFor(track: Pick<Track, 'id'>): string {
  return apiClient.getCoverUrl(track.id);
}
