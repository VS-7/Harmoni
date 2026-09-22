import type { PlaybackContext } from '../../domain/player.ts';
import type { Track } from '../../domain/track.ts';
import type { Route } from '../../app/router/routes.ts';
import { apiClient } from '../../adapters/api/client.ts';
import { offlineStorage } from '../../adapters/storage/offline_store.ts';
import { loadStation, stationRouteFromContextId } from '../radio/stationService.ts';
import { usePlayerStore } from './store/playerStore.ts';

/** Busca as faixas de um contexto a partir só do seu id (botões play de cards e da biblioteca). */
export async function loadContextTracks(context: PlaybackContext): Promise<Track[]> {
  switch (context.type) {
    case 'playlist':
      return (await apiClient.getPlaylist(context.id)).tracks ?? [];
    case 'album':
      return (await apiClient.getAlbum(context.id)).tracks;
    case 'artist':
      return (await apiClient.getArtist(context.id)).tracks;
    case 'offline':
      return offlineStorage.listOfflineTracks();
    case 'station': {
      const separator = context.id.indexOf(':');
      const kind = context.id.slice(0, separator);
      if (kind !== 'artist' && kind !== 'track') return [];
      return (await loadStation(kind, context.id.slice(separator + 1), context.name)).tracks;
    }
    default:
      return [];
  }
}

/** Toca um contexto inteiro, ou alterna play/pause se ele já é o que está tocando. */
export async function toggleContext(context: PlaybackContext, tracks?: Track[]): Promise<void> {
  const player = usePlayerStore.getState();
  if (player.context?.type === context.type && player.context.id === context.id && player.currentTrack) {
    await player.togglePlay();
    return;
  }
  const list = tracks ?? (await loadContextTracks(context));
  await player.playQueue(list, { context, radio: context.type === 'station' });
}

/** Para onde o nome do contexto (no player e na fila) leva. */
export function routeForContext(context: PlaybackContext): Route | null {
  switch (context.type) {
    case 'playlist':
      return { name: 'playlist', id: context.id };
    case 'album':
      return { name: 'album', id: context.id };
    case 'artist':
      return { name: 'artist', id: context.id };
    case 'offline':
      return { name: 'offline' };
    case 'station':
      return stationRouteFromContextId(context.id, context.name);
    default:
      return null;
  }
}
