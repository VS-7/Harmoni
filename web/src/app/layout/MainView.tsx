import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from '../router/router.ts';
import { useMainScroll } from './scrollStore.ts';

/** Posição de rolagem por entrada do histórico, para o "voltar" devolver onde estava. */
const saved = new Map<number, number>();

/** Área principal rolável: publica a rolagem e restaura a posição ao voltar. */
export const MainView: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => {
  const ref = useRef<HTMLElement>(null);
  const index = useRouter((s) => s.index);
  const route = useRouter((s) => s.route);
  const lastAction = useRouter((s) => s.lastAction);
  const setY = useMainScroll((s) => s.setY);
  const setElement = useMainScroll((s) => s.setElement);
  const frame = useRef<number | null>(null);
  const previousIndex = useRef(index);

  useEffect(() => {
    setElement(ref.current);
    return () => setElement(null);
  }, [setElement]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (lastAction === 'replace') return;

    const target = lastAction === 'pop' ? (saved.get(index) ?? 0) : 0;
    element.scrollTop = target;
    setY(element.scrollTop);

    // O conteúdo chega depois (fetch); insiste por um instante até a página ter altura.
    if (target > 0) {
      const started = performance.now();
      const retry = () => {
        if (!ref.current) return;
        ref.current.scrollTop = target;
        if (ref.current.scrollTop < target - 2 && performance.now() - started < 800) {
          requestAnimationFrame(retry);
        } else {
          setY(ref.current.scrollTop);
        }
      };
      requestAnimationFrame(retry);
    }
    previousIndex.current = index;
    // A rota muda junto com o índice; o índice sozinho não muda num "replace".
  }, [index, route, lastAction, setY]);

  const onScroll = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const y = ref.current?.scrollTop ?? 0;
      saved.set(previousIndex.current, y);
      setY(y);
    });
  }, [setY]);

  return (
    <main ref={ref} onScroll={onScroll} className={`sp-scroll relative ${className}`}>
      {children}
    </main>
  );
};
