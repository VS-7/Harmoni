import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** Atualização otimista local, sem refazer a requisição. */
  setData: (updater: (current: T | undefined) => T | undefined) => void;
}

/** Busca dados de uma tela descartando respostas que chegam depois de uma troca de rota. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (id === requestId.current) setDataState(result);
      })
      .catch((err: unknown) => {
        if (id === requestId.current) setError(err instanceof Error ? err.message : 'Algo deu errado');
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // `load` muda a cada render; as dependências explícitas controlam quando buscar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((updater: (current: T | undefined) => T | undefined) => {
    setDataState((current) => updater(current));
  }, []);

  return { data, error, loading, reload, setData };
}
