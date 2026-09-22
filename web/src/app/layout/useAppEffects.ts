import { useEffect } from 'react';
import { useLibraryStore } from '../../features/library/store/libraryStore.ts';
import { useOfflineStore } from '../../features/offline/store/offlineStore.ts';
import { onJobChange, useDownloadsStore } from '../../features/downloads/store/downloadsStore.ts';
import { usePlayerStore } from '../../features/player/store/playerStore.ts';
import { toast } from '../../shared/store/toastStore.ts';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Carga inicial, sincronia com a fila de downloads e atalhos globais de teclado. */
export function useAppEffects(): void {
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const refreshOffline = useOfflineStore((s) => s.refresh);
  const connectDownloads = useDownloadsStore((s) => s.connect);

  useEffect(() => {
    void refreshLibrary();
    void refreshOffline();

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
    }
  }, [refreshLibrary, refreshOffline]);

  // Uma conexão SSE para o app todo (sino de notificações e página de downloads).
  useEffect(() => connectDownloads(), [connectDownloads]);

  // Download concluído no servidor: a biblioteca ganha playlists e álbuns novos.
  useEffect(() => {
    let timer: number | null = null;
    const unsubscribe = onJobChange((job, previous) => {
      if (!previous) return;
      if (job.status === 'completed' && previous.status !== 'completed') {
        toast(`Download concluído: ${job.title || 'nova música'}`);
      } else if (job.status === 'failed' && previous.status !== 'failed') {
        toast(`Falha ao baixar ${job.title || 'o link'}`);
      }
      const progressed = job.done_items !== previous.done_items || job.status !== previous.status;
      if (progressed) {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => void refreshLibrary(), 1500);
      }
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [refreshLibrary]);

  // Espaço toca/pausa, como no Spotify, fora de campos de texto.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isTyping(event.target)) return;
      if (event.target instanceof HTMLElement && ['BUTTON', 'A'].includes(event.target.tagName)) return;
      event.preventDefault();
      void usePlayerStore.getState().togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
