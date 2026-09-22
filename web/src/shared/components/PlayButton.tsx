import React from 'react';
import { Loader2, Pause, Play } from 'lucide-react';

interface PlayButtonProps {
  playing: boolean;
  loading?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  size?: 'sm' | 'md' | 'lg';
  label: string;
  className?: string;
  disabled?: boolean;
}

const SIZES = {
  sm: { box: 'h-8 w-8', icon: 14 },
  md: { box: 'h-12 w-12', icon: 20 },
  lg: { box: 'h-14 w-14', icon: 24 },
};

/** O botão verde redondo do Spotify. */
export const PlayButton: React.FC<PlayButtonProps> = ({
  playing,
  loading = false,
  onClick,
  size = 'md',
  label,
  className = '',
  disabled = false,
}) => {
  const { box, icon } = SIZES[size];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={playing ? `Pausar ${label}` : `Tocar ${label}`}
      className={[
        'flex shrink-0 items-center justify-center rounded-full bg-sp-green text-black',
        'shadow-[0_8px_8px_rgba(0,0,0,0.3)] transition-[transform,background-color] duration-100',
        'hover:scale-[1.04] hover:bg-sp-green-hover active:scale-100 active:bg-sp-green-press',
        'disabled:pointer-events-none disabled:opacity-50',
        box,
        className,
      ].join(' ')}
    >
      {loading ? (
        <Loader2 size={icon} className="animate-spin" />
      ) : playing ? (
        <Pause size={icon} fill="currentColor" strokeWidth={0} />
      ) : (
        <Play size={icon} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />
      )}
    </button>
  );
};
