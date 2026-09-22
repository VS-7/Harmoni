import type { Track } from './track.ts';
import type { FolderID } from './folder.ts';

export type PlaylistID = string;

export interface Playlist {
  id: PlaylistID;
  name: string;
  description?: string;
  coverPath?: string;
  isSmart: boolean;
  /** Ausente ou null enquanto a playlist está na raiz da biblioteca. */
  folderId?: FolderID | null;
  /** Faixas cujas capas compõem o mosaico 2×2 (uma por álbum, na ordem da playlist). */
  coverTrackIds?: string[];
  trackCount: number;
  duration: number; // seconds
  tracks?: Track[];
  createdAt?: string;
  updatedAt?: string;
}
