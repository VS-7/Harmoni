const DB_NAME = 'harmoni_db';
const DB_VERSION = 1;
export const STORE_OFFLINE_TRACKS = 'offline_tracks';

export interface StoredOfflineTrack {
  id: string;
  metadata: import('../../domain/track.ts').Track;
  blob: Blob;
  saved_at: number;
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB não é suportado neste navegador'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_OFFLINE_TRACKS)) {
        db.createObjectStore(STORE_OFFLINE_TRACKS, { keyPath: 'id' });
      }
    };
  });
}
