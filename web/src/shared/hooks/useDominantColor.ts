import { useEffect, useState } from 'react';
import { pickAccent, rgbToCss } from '../utils/color.ts';

const cache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

/** Amostra a capa num canvas minúsculo: barato o bastante para cada cabeçalho. */
function extract(url: string): Promise<string | null> {
  const known = inFlight.get(url);
  if (known) return known;

  const task = new Promise<string | null>((resolve) => {
    const img = new Image();
    // Capas do YouTube vêm de outra origem; sem CORS o canvas fica "sujo" e cai no fallback.
    if (!url.startsWith('/')) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const accent = pickAccent(ctx.getImageData(0, 0, size, size).data);
        resolve(accent ? rgbToCss(accent) : null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  }).then((color) => {
    cache.set(url, color);
    inFlight.delete(url);
    return color;
  });

  inFlight.set(url, task);
  return task;
}

/** Cor de destaque da imagem (ou o fallback, enquanto carrega ou se não houver capa). */
export function useDominantColor(url: string | null | undefined, fallback: string): string {
  const [color, setColor] = useState<string | null>(() => (url ? (cache.get(url) ?? null) : null));

  useEffect(() => {
    if (!url) {
      setColor(null);
      return;
    }
    if (cache.has(url)) {
      setColor(cache.get(url) ?? null);
      return;
    }
    let alive = true;
    setColor(null);
    void extract(url).then((result) => {
      if (alive) setColor(result);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  return color ?? fallback;
}
