import React from 'react';
import { useToastStore } from '../store/toastStore.ts';

/** Aviso azul centralizado acima do player. */
export const Toaster: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 bottom-[calc(var(--mobile-nav-h)+var(--mobile-player-h)+var(--safe-bottom)+20px)] md:bottom-[calc(var(--player-h)+24px)]"
    >
      {toasts.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => dismiss(item.id)}
          className="pointer-events-auto max-w-[min(92vw,520px)] animate-sp-pop rounded-lg bg-sp-announce px-4 py-3 text-center text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        >
          {item.message}
        </button>
      ))}
    </div>
  );
};
