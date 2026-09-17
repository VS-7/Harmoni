export type TrackID = string;

export interface Track {
  id: TrackID;
  title: string;
  artist_id: string;
  artist_name: string;
  album_id?: string;
  album_title?: string;
  track_number: number;
  duration_sec: number;
  format: string;
  file_size: number;
  bitrate: number;
  genre: string;
  is_offline?: boolean;
}
