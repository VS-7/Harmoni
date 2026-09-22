import React, { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import type { IconComponent } from '../store/menuStore.ts';

interface CoverProps {
  src?: string | null;
  alt?: string;
  /** Ícone mostrado enquanto não há imagem (ou quando ela falha). */
  icon?: IconComponent;
  iconSize?: number;
  round?: boolean;
  className?: string;
  /** Sombra forte dos cabeçalhos e cards. */
  shadow?: boolean;
  loading?: 'lazy' | 'eager';
}

/** Capa com fallback: fundo #282828 e ícone cinza, como os quadrados vazios do Spotify. */
export const Cover: React.FC<CoverProps> = ({
  src,
  alt = '',
  icon: Icon = Music,
  iconSize = 24,
  round = false,
  className = '',
  shadow = false,
  loading = 'lazy',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  return (
    <div
      className={[
        'relative shrink-0 overflow-hidden bg-sp-menu',
        round ? 'rounded-full' : 'rounded-[4px]',
        shadow ? 'shadow-[0_8px_24px_rgba(0,0,0,0.5)]' : '',
        className,
      ].join(' ')}
    >
      {(!src || failed) && (
        <span className="absolute inset-0 flex items-center justify-center text-sp-subdued">
          <Icon size={iconSize} strokeWidth={1.75} />
        </span>
      )}
      {src && !failed && (
        <img
          src={src}
          alt={alt}
          loading={loading}
          draggable={false}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
};
