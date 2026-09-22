import React from 'react';
import { X } from 'lucide-react';

interface ChipProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  /** Chips de filtro ativos ganham o "x" para limpar, como na Sua Biblioteca. */
  clearable?: boolean;
}

export const Chip: React.FC<ChipProps> = ({ label, active = false, onClick, clearable = false }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={[
      'inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-sm transition-colors duration-100',
      active ? 'bg-white text-black hover:bg-[#f0f0f0]' : 'bg-white/[0.07] text-white hover:bg-white/[0.1]',
    ].join(' ')}
  >
    {label}
    {active && clearable && <X size={14} className="-mr-1" />}
  </button>
);
