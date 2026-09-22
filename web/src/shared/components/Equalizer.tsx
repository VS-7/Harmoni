import React from 'react';

/** Barrinhas verdes animadas da faixa que está tocando. */
export const Equalizer: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`sp-eq ${className}`} role="img" aria-label="Tocando">
    <span />
    <span />
    <span />
    <span />
  </span>
);
