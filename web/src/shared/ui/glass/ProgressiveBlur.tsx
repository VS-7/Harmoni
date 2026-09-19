import React from 'react';

export interface ProgressiveBlurProps {
  edge: 'top' | 'bottom';
  /** Altura da faixa desfocada; no topo inclui a safe area (Apêndice B). */
  height?: string;
  strength?: number;
  className?: string;
}

/**
 * Desfoque em degradê nas bordas de rolagem (Apêndice B do PRD v2). Sete camadas
 * empilhadas, cada uma com mais blur e uma máscara mais curta, o que evita a linha
 * dura que um único backdrop-filter deixaria.
 */
export const ProgressiveBlur: React.FC<ProgressiveBlurProps> = ({
  edge,
  height,
  strength = 16,
  className = '',
}) => {
  const style: React.CSSProperties = { height };
  (style as Record<string, string>)['--blur-strength'] = `${strength}px`;

  return (
    <div
      aria-hidden="true"
      className={`progressive-blur ${edge === 'bottom' ? 'progressive-blur--bottom' : ''} ${className}`}
      style={style}
    >
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
    </div>
  );
};
