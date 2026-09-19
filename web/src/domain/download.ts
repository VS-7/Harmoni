// Resolves links that point to a track inside a playlist (watch?v=...&list=...).
export type DownloadMode = 'track' | 'playlist';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';

export type JobItemStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'skipped' | 'canceled';

export type SourceKind = 'track' | 'playlist' | 'track_in_playlist' | 'channel';

/** A validated reference to a remote catalog item, as the API expects it. */
export interface SourceRef {
  provider: string;
  kind: 'track' | 'playlist';
  id: string;
}

export interface DownloadJob {
  id: string;
  source_url: string;
  kind: SourceKind;
  provider: string;
  source_id: string;
  title: string;
  thumbnail_url: string;
  playlist_id?: string;
  status: JobStatus;
  error_message?: string;
  total_items: number;
  done_items: number;
  failed_items: number;
  created_at: string;
  updated_at: string;
}

/** One video inside a job: a playlist is expanded into one item per track (RF8.2). */
export interface DownloadJobItem {
  id: string;
  position: number;
  source_id: string;
  title: string;
  status: JobItemStatus;
  track_id?: string;
  error_message?: string;
  updated_at: string;
}

/** Preview of a pasted link, used to ask "just this track or the whole playlist?" (RF6.2). */
export interface LinkInspection {
  provider: string;
  kind: SourceKind;
  video_id?: string;
  playlist_id?: string;
  channel_id?: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  item_count: number;
  is_mix: boolean;
  ambiguous: boolean;
  in_library: boolean;
}

/** Live update pushed by GET /downloads/events (RF8.5). */
export interface DownloadEvent {
  type: 'job_updated' | 'item_updated' | 'job_deleted';
  job_id: string;
  job?: DownloadJob;
  item?: DownloadJobItem;
  total_items: number;
  done_items: number;
  failed_items: number;
}
