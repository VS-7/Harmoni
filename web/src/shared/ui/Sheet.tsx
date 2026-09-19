import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GlassSurface } from './glass/index.ts';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** full ocupa a tela (player expandido); auto se ajusta ao conteúdo (menu de ações). */
  size?: 'full' | 'auto';
  label: string;
  className?: string;
}

/** Arrastar mais do que isso para baixo fecha a sheet, como num app nativo (RF10.3). */
const DISMISS_DISTANCE = 120;

/**
 * Sheet que sobe da base, com fechar por swipe-down, Esc e toque no fundo.
 * A superfície é de vidro; nada aqui usa cor sólida (RF9.2).
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  children,
  size = 'auto',
  label,
  className = '',
}) => {
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    dragStart.current = event.clientY;
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (dragStart.current === null) return;
    // Só o arrasto para baixo move a sheet; para cima ela fica presa.
    setDragY(Math.max(0, event.clientY - dragStart.current));
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    setDragY((current) => {
      if (current > DISMISS_DISTANCE) onClose();
      return 0;
    });
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={label}>
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 animate-fade-in"
      />

      <div
        ref={panelRef}
        className={[
          'relative animate-sheet-up',
          size === 'full' ? 'h-[100dvh]' : 'max-h-[85dvh]',
          className,
        ].join(' ')}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? 'none' : 'transform 320ms var(--ease-ios)',
        }}
      >
        <GlassSurface
          radius="md"
          className="h-full"
          contentClassName={`h-full flex flex-col ${size === 'full' ? 'rounded-b-none' : ''}`}
        >
          {/* Alça: a área que responde ao swipe-down. */}
          <div
            className="flex shrink-0 cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span className="h-1 w-9 rounded-full bg-[color:var(--fg-tertiary)]" />
          </div>

          <div
            className="app-scroll min-h-0 flex-1"
            style={{ paddingBottom: 'max(var(--safe-bottom), 12px)' }}
          >
            {children}
          </div>
        </GlassSurface>
      </div>
    </div>
  );
};
