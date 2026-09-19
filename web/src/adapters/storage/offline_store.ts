import { openDatabase, STORE_OFFLINE_TRACKS, type StoredOfflineTrack } from './db.ts';
import type { Track } from '../../domain/track.ts';
import { apiClient } from '../api/client.ts';

export const offlineStorage = {
  // Request storage persistence (RF5.2)
  async requestPersistence(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    }
    return false;
  },

  async saveTrack(track: Track, blob: Blob): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_TRACKS, 'readwrite');
      const store = tx.objectStore(STORE_OFFLINE_TRACKS);

      const item: StoredOfflineTrack = {
        id: track.id,
        metadata: { ...track, is_offline: true },
        blob,
        saved_at: Date.now(),
      };

      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getTrack(id: string): Promise<StoredOfflineTrack | null> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_TRACKS, 'readonly');
      const store = tx.objectStore(STORE_OFFLINE_TRACKS);
      const req = store.get(id);

      req.onsuccess = () => {
        resolve(req.result || null);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async isTrackOffline(id: string): Promise<boolean> {
    const item = await this.getTrack(id);
    return item !== null;
  },

  async deleteTrack(id: string): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_TRACKS, 'readwrite');
      const store = tx.objectStore(STORE_OFFLINE_TRACKS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async listOfflineTracks(): Promise<Track[]> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_TRACKS, 'readonly');
      const store = tx.objectStore(STORE_OFFLINE_TRACKS);
      const req = store.getAll();

      req.onsuccess = () => {
        const items = (req.result as StoredOfflineTrack[]) || [];
        resolve(items.map((item) => item.metadata));
      };
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Baixa a faixa para o aparelho lendo o corpo como stream, para informar progresso,
   * e aceitando um AbortSignal para cancelar no meio (RF11.4).
   */
  async downloadTrackForOffline(
    track: Track,
    options: { onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
  ): Promise<void> {
    const { onProgress, signal } = options;
    await this.requestPersistence();

    const res = await fetch(apiClient.getStreamUrl(track.id), { signal });
    if (!res.ok) throw new Error('Falha ao baixar áudio para modo offline');

    const declaredLength = Number(res.headers.get('Content-Length') ?? 0);
    const contentType = res.headers.get('Content-Type') ?? 'audio/mpeg';

    // Sem stream legível (ou sem tamanho), cai no caminho simples: só não há progresso.
    if (!res.body || declaredLength <= 0) {
      const blob = await res.blob();
      onProgress?.(1);
      await this.saveTrack(track, blob);
      return;
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          onProgress?.(Math.min(1, received / declaredLength));
        }
      }
    } catch (err) {
      // Um cancelamento não deixa nada gravado no IndexedDB.
      await reader.cancel().catch(() => undefined);
      throw err;
    }

    await this.saveTrack(track, new Blob(chunks as BlobPart[], { type: contentType }));
    onProgress?.(1);
  },

  /** Espaço usado pelo app, para a aba No Aparelho (RF11.3). */
  async estimateUsage(): Promise<{ usage: number; quota: number }> {
    if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  },
};
