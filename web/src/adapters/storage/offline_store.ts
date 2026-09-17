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

  async downloadTrackForOffline(track: Track): Promise<void> {
    await this.requestPersistence();
    const streamUrl = apiClient.getStreamUrl(track.id);
    const res = await fetch(streamUrl);
    if (!res.ok) throw new Error('Falha ao baixar áudio para modo offline');
    const blob = await res.blob();
    await this.saveTrack(track, blob);
  },
};
