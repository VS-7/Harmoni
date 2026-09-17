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
