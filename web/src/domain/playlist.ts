import { Track } from './track';

export type PlaylistID = string;

export interface Playlist {
  id: PlaylistID;
  name: string;
  description?: string;
  coverPath?: string;
  isSmart: boolean;
  trackCount: number;
  duration: number; // seconds
  tracks?: Track[];
  createdAt?: string;
  updatedAt?: string;
}
