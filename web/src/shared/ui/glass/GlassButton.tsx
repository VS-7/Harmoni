import React from 'react';
import { LiquidGlass, type GlassVariant } from './LiquidGlass.tsx';

/** Alvos de toque de no mínimo 44px no md e lg (RF10.2). */
export type GlassButtonSize = 'sm' | 'md' | 'lg';
export type GlassButtonShape = 'icon' | 'label' | 'pill';

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: GlassButtonSize;
  shape?: GlassButtonShape;
  /** light usa uma camada só: obrigatório nos botões repetidos das listas (RF9.5). */
  variant?: GlassVariant;
  active?: boolean;
  children: React.ReactNode;
}

const SIZE: Record<GlassButtonSize, { box: string; icon: string; label: string }> = {
  sm: { box: 'h-8 min-w-8', icon: 'w-8', label: 'px-3 text-caption' },
  md: { box: 'h-11 min-w-11', icon: 'w-11', label: 'px-4 text-footnote' },
  lg: { box: 'h-14 min-w-14', icon: 'w-14', label: 'px-6 text-headline' },
};

/**
 * Botão do design system. Nunca tem cor de fundo sólida nem gradiente (RF9.2):
 * o conteúdo é `currentColor` e o estado ativo se expressa com mais brilho.
 */
export const GlassButton: React.FC<GlassButtonProps> = ({
  size = 'md',
  shape = 'icon',
  variant = 'full',
  active = false,
  children,
  className = '',
  disabled,
  ...rest
}) => {
  const dimensions = SIZE[size];
  const radius = shape === 'pill' ? 'pill' : size === 'sm' ? 'sm' : 'md';

  return (
    <LiquidGlass
      radius={radius}
      variant={variant}
      className={`inline-flex shrink-0 ${className}`}
      contentClassName="flex"
    >
      <button
        type="button"
        disabled={disabled}
        className={[
          'flex items-center justify-center gap-2 font-semibold',
          'text-[color:var(--fg)] transition-[transform,background-color] duration-150',
          'active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100',
          dimensions.box,
          shape === 'icon' ? dimensions.icon : dimensions.label,
          active ? 'bg-[color:var(--glass-scrim-active)]' : 'bg-transparent',
        ].join(' ')}
        {...rest}
      >
        {children}
      </button>
    </LiquidGlass>
  );
};
