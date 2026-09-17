import type { Track } from '../../domain/track.ts';
import { apiClient } from '../api/client.ts';

export interface MediaSessionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (details: MediaSessionActionDetails) => void;
}

export const mediaSessionAdapter = {
  updateMetadata(track: Track | null) {
    if (!('mediaSession' in navigator) || !track) {
      return;
    }

    const coverUrl = apiClient.getCoverUrl(track.id);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist_name,
      album: track.album_title || 'Harmoni',
      artwork: [
        { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: coverUrl, sizes: '192x192', type: 'image/jpeg' },
        { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
      ],
    });
  },

  updatePlaybackState(isPlaying: boolean) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  },

  updatePosition(duration: number, currentTime: number) {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: 1,
          position: Math.min(Math.max(0, currentTime), duration),
        });
      } catch {
        // Ignored if position update errors during seek
      }
    }
  },

  setupHandlers(handlers: MediaSessionHandlers) {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', handlers.onPlay);
      navigator.mediaSession.setActionHandler('pause', handlers.onPause);
      navigator.mediaSession.setActionHandler('previoustrack', handlers.onPrevious);
      navigator.mediaSession.setActionHandler('nexttrack', handlers.onNext);
      navigator.mediaSession.setActionHandler('seekto', handlers.onSeek);
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        handlers.onSeek({ action: 'seekbackward', seekOffset: 10 });
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        handlers.onSeek({ action: 'seekforward', seekOffset: 10 });
      });
    } catch {
      // Ignored if browser does not support specific actions
    }
  },
};
