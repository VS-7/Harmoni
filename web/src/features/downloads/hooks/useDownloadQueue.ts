import { useEffect } from 'react';
import type { DownloadJob } from '../../../domain/download.ts';
import { useDownloadsStore } from '../store/downloadsStore.ts';

interface DownloadQueue {
  jobs: DownloadJob[];
  live: boolean;
  refresh: () => Promise<void>;
}

/**
 * Fila de downloads sincronizada por Server-Sent Events, com polling de reserva (RF8.5).
 * Todas as telas compartilham a mesma conexão, mantida pela store.
 */
export function useDownloadQueue(limit = 25): DownloadQueue {
  const jobs = useDownloadsStore((s) => s.jobs);
  const live = useDownloadsStore((s) => s.live);
  const refresh = useDownloadsStore((s) => s.refresh);
  const connect = useDownloadsStore((s) => s.connect);

  useEffect(() => connect(), [connect]);

  return { jobs: jobs.slice(0, limit), live, refresh };
}
