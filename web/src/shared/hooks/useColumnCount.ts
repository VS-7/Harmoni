import { useEffect, useRef, useState } from 'react';

/**
 * Quantas colunas de cards cabem na largura do container. As estantes do Spotify mostram
 * sempre uma única linha, então o resto fica para o "Mostrar tudo".
 */
export function useColumnCount<T extends HTMLElement>(minWidth = 180, gap = 24, min = 2) {
  const ref = useRef<T>(null);
  const [columns, setColumns] = useState(5);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      setColumns(Math.max(min, Math.floor((width + gap) / (minWidth + gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [minWidth, gap, min]);

  return { ref, columns };
}
