export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface DownloadJob {
  ID: string;
  SourceURL: string;
  Status: JobStatus;
  ErrorMessage?: string;
  CreatedAt: string;
  UpdatedAt: string;
}
