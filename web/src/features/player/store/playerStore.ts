import { create } from 'zustand';
import type { Track } from '../../../domain/track.ts';
import type { PlaybackStatus, RepeatMode } from '../../../domain/player.ts';
import { audioEngine } from '../../../adapters/audio/audio_engine.ts';
import { mediaSessionAdapter } from '../../../adapters/audio/media_session.ts';
import { apiClient } from '../../../adapters/api/client.ts';

interface PlayerStore {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  isPlayingOffline: boolean;
  isRadioMode: boolean;

  playTrack: (track: Track, newQueue?: Track[]) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  startRadio: (seedTrack: Track) => Promise<void>;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  checkAutoContinuation: () => Promise<void>;
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  // Initialize audio callbacks
  audioEngine.setCallbacks({
    onTimeUpdate: (currentTime, duration) => {
      set({ currentTime, duration });
      mediaSessionAdapter.updatePosition(duration, currentTime);
    },
    onPlay: () => {
      set({ status: 'playing' });
      mediaSessionAdapter.updatePlaybackState(true);
    },
    onPause: () => {
      set({ status: 'paused' });
      mediaSessionAdapter.updatePlaybackState(false);
    },
    onLoading: () => set({ status: 'loading' }),
    onError: () => set({ status: 'error' }),
    onEnded: () => {
      const { repeat, cycleRepeat: _, next, currentTrack } = get();
      if (repeat === 'one' && currentTrack) {
        audioEngine.seek(0);
        audioEngine.play();
      } else {
        next();
      }
    },
  });

  // Initialize media session hardware handlers
  mediaSessionAdapter.setupHandlers({
    onPlay: () => get().togglePlay(),
    onPause: () => get().togglePlay(),
    onPrevious: () => get().previous(),
    onNext: () => get().next(),
    onSeek: (details) => {
      if (details.seekTime !== undefined) {
        get().seek(details.seekTime);
      } else if (details.seekOffset) {
        get().seek(get().currentTime + details.seekOffset);
      }
    },
  });

  return {
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    status: 'idle',
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    shuffle: false,
    repeat: 'off',
    isPlayingOffline: false,
    isRadioMode: false,

    async playTrack(track: Track, newQueue?: Track[]) {
      let queue = get().queue;
      let queueIndex = get().queueIndex;

      if (newQueue) {
        queue = newQueue;
        queueIndex = newQueue.findIndex((t) => t.id === track.id);
        if (queueIndex === -1) {
          queue = [track, ...newQueue];
          queueIndex = 0;
        }
      } else {
        const found = queue.findIndex((t) => t.id === track.id);
        if (found !== -1) {
          queueIndex = found;
        } else {
          queue = [...queue, track];
          queueIndex = queue.length - 1;
        }
      }

      set({
        currentTrack: track,
        queue,
        queueIndex,
        currentTime: 0,
        duration: track.duration_sec,
      });

      mediaSessionAdapter.updateMetadata(track);
      const isOffline = await audioEngine.loadTrack(track);
      set({ isPlayingOffline: isOffline });
      await audioEngine.play();

      // Check if queue needs auto-continuation (RF3.3)
      get().checkAutoContinuation();
    },

    async togglePlay() {
      const { status, currentTrack } = get();
      if (!currentTrack) return;

      if (status === 'playing') {
        audioEngine.pause();
      } else {
        await audioEngine.play();
      }
    },

    async next() {
      const { queue, queueIndex, repeat, shuffle } = get();
      if (queue.length === 0) return;

      let nextIndex = queueIndex + 1;
      if (shuffle) {
        nextIndex = Math.floor(Math.random() * queue.length);
      } else if (nextIndex >= queue.length) {
        if (repeat === 'all') {
          nextIndex = 0;
        } else {
          audioEngine.pause();
          set({ status: 'idle', currentTime: 0 });
          return;
        }
      }

      const nextTrack = queue[nextIndex];
      if (nextTrack) {
        await get().playTrack(nextTrack);
      }
    },

    async previous() {
      const { queue, queueIndex, currentTime } = get();
      if (currentTime > 3) {
        audioEngine.seek(0);
        return;
      }
      if (queueIndex > 0) {
        const prevTrack = queue[queueIndex - 1];
        await get().playTrack(prevTrack);
      }
    },

    seek(seconds: number) {
      audioEngine.seek(seconds);
      set({ currentTime: seconds });
    },

    setVolume(volume: number) {
      audioEngine.setVolume(volume);
      set({ volume, isMuted: false });
    },

    toggleMute() {
      const isMuted = !get().isMuted;
      audioEngine.setMuted(isMuted);
      set({ isMuted });
    },

    toggleShuffle() {
      set({ shuffle: !get().shuffle });
    },

    cycleRepeat() {
      const modes: RepeatMode[] = ['off', 'all', 'one'];
      const current = get().repeat;
      const nextMode = modes[(modes.indexOf(current) + 1) % modes.length];
      set({ repeat: nextMode });
    },

    async startRadio(seedTrack: Track) {
      set({ isRadioMode: true, status: 'loading' });
      try {
        const similar = await apiClient.getRadio(seedTrack.id, 20);
        const radioQueue = [seedTrack, ...similar];
        await get().playTrack(seedTrack, radioQueue);
      } catch {
        await get().playTrack(seedTrack);
      }
    },

    addToQueue(track: Track) {
      set({ queue: [...get().queue, track] });
    },

    // Insere logo após a faixa atual, sem interromper o que está tocando (RF11.2).
    playNext(track: Track) {
      const { queue, queueIndex } = get();
      const next = [...queue];
      next.splice(queueIndex + 1, 0, track);
      set({ queue: next });
    },

    removeFromQueue(index: number) {
      const { queue, queueIndex } = get();
      const updated = queue.filter((_, i) => i !== index);
      let newIdx = queueIndex;
      if (index < queueIndex) newIdx--;
      set({ queue: updated, queueIndex: newIdx });
    },

    clearQueue() {
      set({ queue: [], queueIndex: -1 });
    },

    // Autoplay infinito (RF3.3): quando restarem 2 músicas na fila
    async checkAutoContinuation() {
      const { isRadioMode, queue, queueIndex, currentTrack } = get();
      if (!isRadioMode || !currentTrack) return;

      const remaining = queue.length - 1 - queueIndex;
      if (remaining <= 2) {
        try {
          const recentArtists = queue.slice(Math.max(0, queueIndex - 5), queueIndex + 1).map((t) => t.artist_id);
          const recentTracks = queue.slice(Math.max(0, queueIndex - 10), queueIndex + 1).map((t) => t.id);

          const moreTracks = await apiClient.getRadio(currentTrack.id, 15, recentArtists, recentTracks);
          if (moreTracks.length > 0) {
            set({ queue: [...get().queue, ...moreTracks] });
          }
        } catch {
          // Silent fallback
        }
      }
    },
  };
});
