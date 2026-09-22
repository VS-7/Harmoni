export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type RepeatMode = 'off' | 'all' | 'one';

export interface PlayerState {
  currentTrack: import('./track.ts').Track | null;
  queue: import('./track.ts').Track[];
  queueIndex: number;
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  isOfflineMode: boolean;
}

/** De onde a fila atual veio: é o que acende a playlist/álbum na biblioteca. */
export type PlaybackContextType =
  | 'playlist'
  | 'album'
  | 'artist'
  | 'station'
  | 'offline'
  | 'search'
  | 'queue';

export interface PlaybackContext {
  type: PlaybackContextType;
  id: string;
  name: string;
}

export function contextKey(context: Pick<PlaybackContext, 'type' | 'id'> | null | undefined): string | null {
  return context ? `${context.type}:${context.id}` : null;
}
