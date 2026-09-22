import React, { useRef, useState } from 'react';

interface SliderProps {
  value: number;
  max: number;
  label: string;
  /** Valor ao vivo durante o arrasto (volume muda enquanto arrasta). */
  onChange?: (value: number) => void;
  /** Valor final ao soltar (a posição da faixa só muda ao soltar, como no Spotify). */
  onCommit: (value: number) => void;
  /** Passo das setas do teclado. */
  step?: number;
  valueText?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * A barra do Spotify: trilho cinza de 4px, preenchimento branco que fica verde e ganha
 * a bolinha no hover ou durante o arrasto.
 */
export const Slider: React.FC<SliderProps> = ({
  value,
  max,
  label,
  onChange,
  onCommit,
  step,
  valueText,
  className = '',
  disabled = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const valueAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * max;
  };

  const shown = dragValue ?? value;
  const percent = max > 0 ? Math.min(100, Math.max(0, (shown / max) * 100)) : 0;
  const keyStep = step ?? max / 20;

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(shown * 100) / 100}
      aria-valuetext={valueText}
      aria-disabled={disabled}
      className={`group relative flex h-3 touch-none items-center ${disabled ? 'opacity-50' : ''} ${className}`}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const next = valueAt(event.clientX);
        setDragValue(next);
        onChange?.(next);
      }}
      onPointerMove={(event) => {
        if (dragValue === null) return;
        const next = valueAt(event.clientX);
        setDragValue(next);
        onChange?.(next);
      }}
      onPointerUp={(event) => {
        if (dragValue === null) return;
        const next = valueAt(event.clientX);
        setDragValue(null);
        onCommit(next);
      }}
      onPointerCancel={() => setDragValue(null)}
      onKeyDown={(event) => {
        if (disabled) return;
        let next: number | null = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(max, value + keyStep);
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, value - keyStep);
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = max;
        if (next !== null) {
          event.preventDefault();
          onCommit(next);
        }
      }}
    >
      <div ref={trackRef} className="relative h-1 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className={[
            'absolute inset-y-0 left-0 rounded-full',
            dragValue !== null ? 'bg-sp-green' : 'bg-white group-hover:bg-sp-green group-focus-visible:bg-sp-green',
          ].join(' ')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.5)]',
          dragValue !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        ].join(' ')}
        style={{ left: `${percent}%` }}
      />
    </div>
  );
};
