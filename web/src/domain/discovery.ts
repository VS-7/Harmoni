/** Remote catalog browsing (YouTube / YouTube Music), Module 7 of the PRD v2. */
export type RemoteKind = 'track' | 'playlist' | 'artist';

export type SearchType = 'all' | RemoteKind;

export interface RemoteItem {
  id: string;
  kind: RemoteKind;
  title: string;
  artist: string;
  duration_sec: number;
  thumbnail_url: string;
  item_count: number;
  /** True when a track with this source id is already indexed locally (RF7.1). */
  in_library: boolean;
}

export interface RemotePlaylist {
  id: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  item_count: number;
  tracks: RemoteItem[];
}

export interface RemoteArtist {
  id: string;
  name: string;
  thumbnail_url: string;
  top_tracks: RemoteItem[];
  playlists: RemoteItem[];
}
