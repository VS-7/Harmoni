import { create } from 'zustand';
import type { Track } from '../../../domain/track.ts';
import type { PlaybackContext, PlaybackStatus, RepeatMode } from '../../../domain/player.ts';
import { audioEngine } from '../../../adapters/audio/audio_engine.ts';
import { mediaSessionAdapter } from '../../../adapters/audio/media_session.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { preferences } from '../../../adapters/storage/preferences.ts';
import { shuffled } from '../../../shared/utils/random.ts';
import { useRecentsStore } from './recentsStore.ts';

export interface PlayQueueOptions {
  startIndex?: number;
  context?: PlaybackContext | null;
  /** Força o aleatório ligado ou desligado para esta fila; sem ele, vale o estado atual. */
  shuffle?: boolean;
  /** Estação: a fila se estende sozinha com faixas parecidas (RF3.3). */
  radio?: boolean;
}

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
  /** De onde a fila veio (playlist, álbum, estação...). */
  context: PlaybackContext | null;
  /** Ordem original do contexto, guardada enquanto o aleatório embaralha a fila. */
  unshuffledQueue: Track[] | null;
  /** Faixas postas com "Adicionar à fila" logo depois da atual ("Próximas na fila"). */
  queuedAhead: number;

  playTrack: (track: Track, newQueue?: Track[], context?: PlaybackContext | null) => Promise<void>;
  playQueue: (tracks: Track[], options?: PlayQueueOptions) => Promise<void>;
  playFromQueue: (index: number) => Promise<void>;
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
  addManyToQueue: (tracks: Track[]) => void;
  /** Estende o fim do contexto atual (ex.: "Adicionar mais músicas" na rádio que está tocando). */
  extendQueue: (tracks: Track[]) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  checkAutoContinuation: () => Promise<void>;
}

const VOLUME_KEY = 'volume';

/** Cada pedido de reprodução invalida os anteriores ainda carregando (cliques rápidos em "próxima"). */
let loadToken = 0;
let continuing = false;

/** Embaralha a fila mantendo a faixa atual na frente, como o aleatório do Spotify. */
function shuffleAround(queue: Track[], index: number): Track[] {
  if (queue.length === 0) return queue;
  const current = queue[index];
  const others = queue.filter((_, i) => i !== index);
  return [current, ...shuffled(others)];
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  const initialVolume = preferences.get<number>(VOLUME_KEY, 1);
  audioEngine.setVolume(initialVolume);

  async function loadAndPlay(queue: Track[], index: number, patch: Partial<PlayerStore> = {}) {
    const track = queue[index];
    if (!track) return;
    const token = ++loadToken;

    set({
      ...patch,
      currentTrack: track,
      queue,
      queueIndex: index,
      currentTime: 0,
      duration: track.duration_sec,
    });

    mediaSessionAdapter.updateMetadata(track);
    const isOffline = await audioEngine.loadTrack(track);
    if (token !== loadToken) return;
    set({ isPlayingOffline: isOffline });
    await audioEngine.play();

    // Autoplay infinito da estação (RF3.3).
    void get().checkAutoContinuation();
  }

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
      const { repeat, currentTrack } = get();
      if (repeat === 'one' && currentTrack) {
        audioEngine.seek(0);
        void audioEngine.play();
      } else {
        void get().next();
      }
    },
  });

  mediaSessionAdapter.setupHandlers({
    onPlay: () => void get().togglePlay(),
    onPause: () => void get().togglePlay(),
    onPrevious: () => void get().previous(),
    onNext: () => void get().next(),
    onSeek: (details) => {
      if (details.seekTime !== undefined) {
        get().seek(details.seekTime);
      } else if (details.seekOffset) {
        const offset = details.action === 'seekbackward' ? -details.seekOffset : details.seekOffset;
        get().seek(Math.max(0, get().currentTime + offset));
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
    volume: initialVolume,
    isMuted: false,
    shuffle: false,
    repeat: 'off',
    isPlayingOffline: false,
    isRadioMode: false,
    context: null,
    unshuffledQueue: null,
    queuedAhead: 0,

    async playTrack(track, newQueue, context) {
      if (newQueue) {
        const index = newQueue.findIndex((t) => t.id === track.id);
        const tracks = index === -1 ? [track, ...newQueue] : newQueue;
        await get().playQueue(tracks, { startIndex: Math.max(0, index), context: context ?? null });
        return;
      }

      const { queue } = get();
      const found = queue.findIndex((t) => t.id === track.id);
      if (found !== -1) {
        await get().playFromQueue(found);
        return;
      }
      const appended = [...queue, track];
      await loadAndPlay(appended, appended.length - 1, { queuedAhead: 0 });
    },

    async playQueue(tracks, options = {}) {
      if (tracks.length === 0) return;
      const startIndex = Math.min(Math.max(0, options.startIndex ?? 0), tracks.length - 1);
      const shuffle = options.shuffle ?? get().shuffle;
      const context = options.context ?? null;

      // Sem faixa escolhida, o aleatório começa por uma qualquer (botão play do cabeçalho).
      const first = shuffle && options.startIndex === undefined
        ? Math.floor(Math.random() * tracks.length)
        : startIndex;
      const queue = shuffle ? shuffleAround(tracks, first) : tracks;

      if (context) useRecentsStore.getState().record(context);

      await loadAndPlay(queue, shuffle ? 0 : first, {
        shuffle,
        context,
        unshuffledQueue: shuffle ? tracks : null,
        isRadioMode: options.radio ?? false,
        queuedAhead: 0,
      });
    },

    async playFromQueue(index) {
      const { queue, queueIndex, queuedAhead } = get();
      if (!queue[index]) return;
      const jumped = index - queueIndex;
      await loadAndPlay(queue, index, {
        queuedAhead: jumped > 0 ? Math.max(0, queuedAhead - jumped) : 0,
      });
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
      const { queue, queueIndex, repeat, queuedAhead } = get();
      if (queue.length === 0) return;

      let nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeat !== 'all') {
          // Fim do contexto: para na última faixa, do começo, como o Spotify.
          audioEngine.pause();
          audioEngine.seek(0);
          set({ currentTime: 0 });
          return;
        }
        nextIndex = 0;
      }

      await loadAndPlay(queue, nextIndex, { queuedAhead: Math.max(0, queuedAhead - 1) });
    },

    async previous() {
      const { queue, queueIndex, currentTime } = get();
      if (currentTime > 3 || queueIndex <= 0) {
        get().seek(0);
        return;
      }
      await loadAndPlay(queue, queueIndex - 1, { queuedAhead: 0 });
    },

    seek(seconds: number) {
      audioEngine.seek(seconds);
      set({ currentTime: seconds });
    },

    setVolume(volume: number) {
      const clamped = Math.min(1, Math.max(0, volume));
      audioEngine.setVolume(clamped);
      if (get().isMuted) audioEngine.setMuted(false);
      set({ volume: clamped, isMuted: false });
      preferences.set(VOLUME_KEY, clamped);
    },

    toggleMute() {
      const isMuted = !get().isMuted;
      audioEngine.setMuted(isMuted);
      set({ isMuted });
    },

    toggleShuffle() {
      const { shuffle, queue, queueIndex, unshuffledQueue, currentTrack } = get();

      if (!shuffle) {
        set({
          shuffle: true,
          unshuffledQueue: queue,
          queue: queueIndex >= 0 ? shuffleAround(queue, queueIndex) : queue,
          queueIndex: queueIndex >= 0 ? 0 : queueIndex,
          queuedAhead: 0,
        });
        return;
      }

      // Desligar devolve a ordem original do contexto, a partir da faixa atual.
      const original = unshuffledQueue ?? queue;
      const restoredIndex = currentTrack ? original.findIndex((t) => t.id === currentTrack.id) : -1;
      set({
        shuffle: false,
        unshuffledQueue: null,
        queue: original,
        queueIndex: restoredIndex === -1 ? queueIndex : restoredIndex,
        queuedAhead: 0,
      });
    },

    cycleRepeat() {
      const modes: RepeatMode[] = ['off', 'all', 'one'];
      const current = get().repeat;
      const nextMode = modes[(modes.indexOf(current) + 1) % modes.length];
      set({ repeat: nextMode });
    },

    async startRadio(seedTrack: Track) {
      const context: PlaybackContext = {
        type: 'station',
        id: `track:${seedTrack.id}`,
        name: `Rádio de ${seedTrack.title}`,
      };
      try {
        const similar = await apiClient.getRadio(seedTrack.id, 20);
        const tracks = [seedTrack, ...similar.filter((t) => t.id !== seedTrack.id)];
        await get().playQueue(tracks, { startIndex: 0, context, shuffle: false, radio: true });
      } catch {
        await get().playQueue([seedTrack], { context, shuffle: false, radio: true });
      }
    },

    addToQueue(track: Track) {
      get().addManyToQueue([track]);
    },

    // "Adicionar à fila": entra depois da atual e das já enfileiradas, antes do resto do contexto.
    addManyToQueue(tracks: Track[]) {
      if (tracks.length === 0) return;
      const { queue, queueIndex, queuedAhead, unshuffledQueue, currentTrack } = get();
      if (queueIndex < 0) {
        set({ queue: [...queue, ...tracks] });
        return;
      }
      const at = queueIndex + 1 + queuedAhead;
      const updated = [...queue.slice(0, at), ...tracks, ...queue.slice(at)];

      let original = unshuffledQueue;
      if (original && currentTrack) {
        const pos = original.findIndex((t) => t.id === currentTrack.id) + 1;
        original = [...original.slice(0, pos), ...tracks, ...original.slice(pos)];
      }

      set({ queue: updated, queuedAhead: queuedAhead + tracks.length, unshuffledQueue: original });
    },

    extendQueue(tracks: Track[]) {
      if (tracks.length === 0) return;
      set((state) => ({
        queue: [...state.queue, ...tracks],
        unshuffledQueue: state.unshuffledQueue ? [...state.unshuffledQueue, ...tracks] : null,
      }));
    },

    // Insere logo após a faixa atual, sem interromper o que está tocando (RF11.2).
    playNext(track: Track) {
      const { queue, queueIndex, queuedAhead } = get();
      const updated = [...queue];
      updated.splice(queueIndex + 1, 0, track);
      set({ queue: updated, queuedAhead: queueIndex >= 0 ? queuedAhead + 1 : queuedAhead });
    },

    removeFromQueue(index: number) {
      const { queue, queueIndex, queuedAhead, unshuffledQueue } = get();
      if (index === queueIndex || !queue[index]) return;
      const removed = queue[index];
      const updated = queue.filter((_, i) => i !== index);
      const inManual = index > queueIndex && index <= queueIndex + queuedAhead;

      let original = unshuffledQueue;
      if (original) {
        const pos = original.findIndex((t) => t.id === removed.id);
        if (pos !== -1) original = original.filter((_, i) => i !== pos);
      }

      set({
        queue: updated,
        queueIndex: index < queueIndex ? queueIndex - 1 : queueIndex,
        queuedAhead: inManual ? queuedAhead - 1 : queuedAhead,
        unshuffledQueue: original,
      });
    },

    clearQueue() {
      set({ queue: [], queueIndex: -1, queuedAhead: 0, unshuffledQueue: null });
    },

    // Autoplay infinito (RF3.3): quando restarem 2 músicas na fila
    async checkAutoContinuation() {
      const { isRadioMode, queue, queueIndex, currentTrack } = get();
      if (!isRadioMode || !currentTrack || continuing) return;

      const remaining = queue.length - 1 - queueIndex;
      if (remaining > 2) return;

      continuing = true;
      try {
        const recentArtists = queue.slice(Math.max(0, queueIndex - 5), queueIndex + 1).map((t) => t.artist_id);
        const recentTracks = queue.slice(Math.max(0, queueIndex - 10), queueIndex + 1).map((t) => t.id);

        const moreTracks = await apiClient.getRadio(currentTrack.id, 15, recentArtists, recentTracks);
        const known = new Set(get().queue.map((t) => t.id));
        const fresh = moreTracks.filter((t) => !known.has(t.id));
        if (fresh.length > 0) {
          set((state) => ({
            queue: [...state.queue, ...fresh],
            unshuffledQueue: state.unshuffledQueue ? [...state.unshuffledQueue, ...fresh] : null,
          }));
        }
      } catch {
        // Sem rede ou sem recomendações: a fila termina normalmente.
      } finally {
        continuing = false;
      }
    },
  };
});
