import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../adapters/api/client.ts';
import { endpoints } from '../../../adapters/api/endpoints.ts';
import type { DownloadEvent, DownloadJob } from '../../../domain/download.ts';

/** Polling interval used only while the event stream is unavailable (RF8.5). */
const FALLBACK_POLL_MS = 3000;

interface DownloadQueue {
  jobs: DownloadJob[];
  live: boolean;
  refresh: () => Promise<void>;
}

/**
 * Keeps the download queue in sync through Server-Sent Events, falling back to polling
 * when the stream cannot be established (RF8.5).
 */
export function useDownloadQueue(limit = 25): DownloadQueue {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [live, setLive] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setJobs(await apiClient.listDownloads(limit));
    } catch {
      // Offline or server restarting: the next tick tries again.
    }
  }, [limit]);

  const applyEvent = useCallback((event: DownloadEvent) => {
    setJobs((current) => {
      if (event.type === 'job_deleted') {
        return current.filter((job) => job.id !== event.job_id);
      }

      const index = current.findIndex((job) => job.id === event.job_id);
      const progress = {
        total_items: event.total_items,
        done_items: event.done_items,
        failed_items: event.failed_items,
      };

      if (index === -1) {
        return event.job ? [{ ...event.job, ...progress }, ...current] : current;
      }

      const updated = [...current];
      updated[index] = { ...updated[index], ...(event.job ?? {}), ...progress };
      return updated;
    });
  }, []);

  useEffect(() => {
    void refresh();

    const startPolling = () => {
      if (pollRef.current !== null) return;
      pollRef.current = window.setInterval(() => void refresh(), FALLBACK_POLL_MS);
    };
    const stopPolling = () => {
      if (pollRef.current === null) return;
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    };

    let source: EventSource | null = null;
    try {
      source = new EventSource(endpoints.downloadEvents);
    } catch {
      startPolling();
      return () => stopPolling();
    }

    const onMessage = (raw: MessageEvent<string>) => {
      try {
        applyEvent(JSON.parse(raw.data) as DownloadEvent);
      } catch {
        // A malformed frame is skipped; the next one carries the full state.
      }
    };

    source.addEventListener('open', () => {
      setLive(true);
      stopPolling();
      // A job may have changed while the stream was down.
      void refresh();
    });
    source.addEventListener('job_updated', onMessage as EventListener);
    source.addEventListener('item_updated', onMessage as EventListener);
    source.addEventListener('job_deleted', onMessage as EventListener);
    source.addEventListener('error', () => {
      setLive(false);
      // EventSource reconnects on its own; polling covers the gap meanwhile.
      startPolling();
    });

    return () => {
      source?.close();
      stopPolling();
    };
  }, [applyEvent, refresh]);

  return { jobs, live, refresh };
}
