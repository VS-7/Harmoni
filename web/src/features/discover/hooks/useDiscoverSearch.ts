import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../adapters/api/client.ts';
import type { RemoteItem, SearchType } from '../../../domain/discovery.ts';
import type { Track } from '../../../domain/track.ts';

/** Debounce exigido pelo RF7.4, casado com o rate limit de 1 req/s do servidor. */
const DEBOUNCE_MS = 400;

interface DiscoverSearch {
  localTracks: Track[];
  remoteItems: RemoteItem[];
  loadingLocal: boolean;
  loadingRemote: boolean;
  error: string | null;
}

/** Busca local e remota na mesma tela (RF7.6): a biblioteca responde primeiro. */
export function useDiscoverSearch(query: string, type: SearchType): DiscoverSearch {
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [remoteItems, setRemoteItems] = useState<RemoteItem[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Descarta respostas de buscas que já foram substituídas por uma mais nova.
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setLocalTracks([]);
      setRemoteItems([]);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      setLoadingLocal(true);
      setLoadingRemote(true);
      setError(null);

      void apiClient
        .listTracks(0, 20, term)
        .then((res) => {
          if (id === requestId.current) setLocalTracks(res.data);
        })
        .catch(() => {
          if (id === requestId.current) setLocalTracks([]);
        })
        .finally(() => {
          if (id === requestId.current) setLoadingLocal(false);
        });

      void apiClient
        .searchRemote(term, type, 20)
        .then((items) => {
          if (id === requestId.current) setRemoteItems(items);
        })
        .catch((err: Error) => {
          if (id !== requestId.current) return;
          setRemoteItems([]);
          setError(err.message);
        })
        .finally(() => {
          if (id === requestId.current) setLoadingRemote(false);
        });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, type]);

  return { localTracks, remoteItems, loadingLocal, loadingRemote, error };
}
