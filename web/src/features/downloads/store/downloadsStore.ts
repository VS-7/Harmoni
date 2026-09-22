import { create } from 'zustand';
import { apiClient } from '../../../adapters/api/client.ts';
import { endpoints } from '../../../adapters/api/endpoints.ts';
import { preferences } from '../../../adapters/storage/preferences.ts';
import type { DownloadEvent, DownloadJob } from '../../../domain/download.ts';

/** Polling usado só enquanto o stream de eventos não está disponível (RF8.5). */
const FALLBACK_POLL_MS = 3000;
const LIST_LIMIT = 30;
const SEEN_KEY = 'notifications-seen-at';

interface DownloadsStore {
  jobs: DownloadJob[];
  live: boolean;
  /** Momento em que o painel de notificações foi aberto pela última vez. */
  seenAt: number;
  refresh: () => Promise<void>;
  /** Abre (ou reaproveita) a conexão SSE; devolve a função que a libera. */
  connect: () => () => void;
  markSeen: () => void;
}

type Listener = (job: DownloadJob, previous: DownloadJob | undefined) => void;
const listeners = new Set<Listener>();

/** Avisa quando um job muda, para a biblioteca recarregar ao fim de um download. */
export function onJobChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let subscribers = 0;
let source: EventSource | null = null;
let pollTimer: number | null = null;

function startPolling(refresh: () => Promise<void>) {
  if (pollTimer !== null) return;
  pollTimer = window.setInterval(() => void refresh(), FALLBACK_POLL_MS);
}

function stopPolling() {
  if (pollTimer === null) return;
  window.clearInterval(pollTimer);
  pollTimer = null;
}

export const useDownloadsStore = create<DownloadsStore>((set, get) => {
  function publish(next: DownloadJob[], previous: DownloadJob[]) {
    if (listeners.size === 0) return;
    const before = new Map(previous.map((job) => [job.id, job]));
    for (const job of next) {
      const old = before.get(job.id);
      if (!old || old.status !== job.status || old.done_items !== job.done_items) {
        listeners.forEach((listener) => listener(job, old));
      }
    }
  }

  function applyEvent(event: DownloadEvent) {
    const current = get().jobs;
    if (event.type === 'job_deleted') {
      set({ jobs: current.filter((job) => job.id !== event.job_id) });
      return;
    }

    const progress = {
      total_items: event.total_items,
      done_items: event.done_items,
      failed_items: event.failed_items,
    };
    const index = current.findIndex((job) => job.id === event.job_id);
    let next: DownloadJob[];
    if (index === -1) {
      if (!event.job) return;
      next = [{ ...event.job, ...progress }, ...current];
    } else {
      next = [...current];
      next[index] = { ...next[index], ...(event.job ?? {}), ...progress };
    }
    set({ jobs: next });
    publish(next, current);
  }

  return {
    jobs: [],
    live: false,
    seenAt: preferences.get<number>(SEEN_KEY, 0),

    async refresh() {
      try {
        const previous = get().jobs;
        const jobs = await apiClient.listDownloads(LIST_LIMIT);
        set({ jobs });
        publish(jobs, previous);
      } catch {
        // Offline ou servidor reiniciando: a próxima tentativa resolve.
      }
    },

    connect() {
      subscribers++;
      if (subscribers === 1) {
        void get().refresh();
        try {
          source = new EventSource(endpoints.downloadEvents);
          const onMessage = (raw: MessageEvent<string>) => {
            try {
              applyEvent(JSON.parse(raw.data) as DownloadEvent);
            } catch {
              // Um frame malformado é ignorado; o próximo traz o estado completo.
            }
          };
          source.addEventListener('open', () => {
            set({ live: true });
            stopPolling();
            // Algum job pode ter mudado enquanto o stream estava fora.
            void get().refresh();
          });
          source.addEventListener('job_updated', onMessage as EventListener);
          source.addEventListener('item_updated', onMessage as EventListener);
          source.addEventListener('job_deleted', onMessage as EventListener);
          source.addEventListener('error', () => {
            set({ live: false });
            // O EventSource reconecta sozinho; o polling cobre o intervalo.
            startPolling(get().refresh);
          });
        } catch {
          startPolling(get().refresh);
        }
      }

      let released = false;
      return () => {
        if (released) return;
        released = true;
        subscribers--;
        if (subscribers === 0) {
          source?.close();
          source = null;
          stopPolling();
          set({ live: false });
        }
      };
    },

    markSeen() {
      const seenAt = Date.now();
      set({ seenAt });
      preferences.set(SEEN_KEY, seenAt);
    },
  };
});
