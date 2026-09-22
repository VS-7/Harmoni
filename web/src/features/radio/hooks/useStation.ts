import { useCallback, useEffect, useState } from 'react';
import type { Station, StationKind } from '../../../domain/station.ts';
import type { Track } from '../../../domain/track.ts';
import { extendStation, forgetStation, loadStation } from '../stationService.ts';

interface StationState {
  station: Station | null;
  error: string | null;
  adding: boolean;
  addMore: () => Promise<Track[]>;
  regenerate: () => void;
}

export function useStation(kind: StationKind, id: string, title?: string): StationState {
  const [station, setStation] = useState<Station | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setStation(null);
    setError(null);
    loadStation(kind, id, title)
      .then((result) => alive && setStation(result))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [kind, id, title, nonce]);

  const addMore = useCallback(async () => {
    setAdding(true);
    try {
      const fresh = await extendStation(kind, id);
      setStation(await loadStation(kind, id, title));
      return fresh;
    } finally {
      setAdding(false);
    }
  }, [kind, id, title]);

  const regenerate = useCallback(() => {
    forgetStation(kind, id);
    setNonce((n) => n + 1);
  }, [kind, id]);

  return { station, error, adding, addMore, regenerate };
}
