// Resolves links that point to a track inside a playlist (watch?v=...&list=...).
export type DownloadMode = 'track' | 'playlist';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface DownloadJob {
  ID: string;
  SourceURL: string;
  Status: JobStatus;
  ErrorMessage?: string;
  CreatedAt: string;
  UpdatedAt: string;
}
