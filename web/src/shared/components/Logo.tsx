import React from 'react';

/** Marca do Harmoni: as barras de forma de onda do ícone do app. */
export const LogoMark: React.FC<{ size?: number; className?: string }> = ({ size = 32, className }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
    <g fill="currentColor">
      <rect x="4" y="12" width="3" height="8" rx="1.5" />
      <rect x="9.5" y="8" width="3" height="16" rx="1.5" />
      <rect x="14.5" y="3" width="3" height="26" rx="1.5" />
      <rect x="19.5" y="8" width="3" height="16" rx="1.5" />
      <rect x="25" y="12" width="3" height="8" rx="1.5" />
    </g>
  </svg>
);
