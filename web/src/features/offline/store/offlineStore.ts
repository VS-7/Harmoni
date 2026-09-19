import { create } from 'zustand';
import type { Track } from '../../../domain/track.ts';
import { offlineStorage } from '../../../adapters/storage/offline_store.ts';

interface OfflineStore {
  /** Ids das faixas gravadas no aparelho, para o indicador das listas (RF11.3). */
  offlineIds: Set<string>;
  /** Progresso de 0 a 1 por faixa em download (RF11.4). */
  progress: Record<string, number>;
  usage: number;
  quota: number;
  /** Progresso da fila de "baixar tudo no aparelho" de um álbum ou playlist (RF11.2). */
  batch: { id: string; done: number; total: number } | null;

  refresh: () => Promise<void>;
  download: (track: Track) => Promise<void>;
  downloadMany: (id: string, tracks: Track[]) => Promise<void>;
  cancelBatch: () => void;
  cancel: (trackId: string) => void;
  remove: (trackId: string) => Promise<void>;
  isOffline: (trackId: string) => boolean;
}

/** Downloads em andamento; ficam fora do estado porque não são serializáveis. */
const controllers = new Map<string, AbortController>();

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  offlineIds: new Set(),
  progress: {},
  usage: 0,
  quota: 0,
  batch: null,

  async refresh() {
    const [tracks, estimate] = await Promise.all([
      offlineStorage.listOfflineTracks().catch(() => [] as Track[]),
      offlineStorage.estimateUsage().catch(() => ({ usage: 0, quota: 0 })),
    ]);
    set({
      offlineIds: new Set(tracks.map((t) => t.id)),
      usage: estimate.usage,
      quota: estimate.quota,
    });
  },

  async download(track: Track) {
    if (get().offlineIds.has(track.id) || controllers.has(track.id)) return;

    const controller = new AbortController();
    controllers.set(track.id, controller);
    set((state) => ({ progress: { ...state.progress, [track.id]: 0 } }));

    try {
      await offlineStorage.downloadTrackForOffline(track, {
        signal: controller.signal,
        onProgress: (ratio) =>
          set((state) => ({ progress: { ...state.progress, [track.id]: ratio } })),
      });
      set((state) => {
        const offlineIds = new Set(state.offlineIds);
        offlineIds.add(track.id);
        return { offlineIds };
      });
      await get().refresh();
    } finally {
      controllers.delete(track.id);
      set((state) => {
        const progress = { ...state.progress };
        delete progress[track.id];
        return { progress };
      });
    }
  },

  /**
   * Fila sequencial no cliente (RF11.2): uma faixa por vez, para não abrir dezenas de
   * conexões simultâneas nem estourar a memória do aparelho com vários blobs.
   */
  async downloadMany(id: string, tracks: Track[]) {
    const pending = tracks.filter((track) => !get().offlineIds.has(track.id));
    if (pending.length === 0) return;

    set({ batch: { id, done: 0, total: pending.length } });
    try {
      for (const track of pending) {
        // Cancelar o lote interrompe entre as faixas, sem perder o que já baixou.
        if (get().batch?.id !== id) return;
        try {
          await get().download(track);
        } catch {
          // Uma faixa indisponível não derruba o restante da fila.
        }
        set((state) =>
          state.batch?.id === id
            ? { batch: { ...state.batch, done: state.batch.done + 1 } }
            : {},
        );
      }
    } finally {
      if (get().batch?.id === id) set({ batch: null });
    }
  },

  cancelBatch() {
    const current = get().batch;
    if (!current) return;
    set({ batch: null });
  },

  cancel(trackId: string) {
    controllers.get(trackId)?.abort();
    controllers.delete(trackId);
    set((state) => {
      const progress = { ...state.progress };
      delete progress[trackId];
      return { progress };
    });
  },

  async remove(trackId: string) {
    await offlineStorage.deleteTrack(trackId);
    set((state) => {
      const offlineIds = new Set(state.offlineIds);
      offlineIds.delete(trackId);
      return { offlineIds };
    });
    await get().refresh();
  },

  isOffline(trackId: string) {
    return get().offlineIds.has(trackId);
  },
}));
