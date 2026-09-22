import React from 'react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** Verde com o pontinho embaixo, como o aleatório e o repetir ligados. */
  active?: boolean;
  showDot?: boolean;
  size?: 'sm' | 'md' | 'lg';
  tooltip?: boolean;
  tooltipPosition?: 'top' | 'bottom';
}

const SIZES = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' };

/** Botão de ícone cinza que fica branco no hover. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      label,
      active = false,
      showDot = false,
      size = 'sm',
      tooltip = true,
      tooltipPosition = 'top',
      className = '',
      children,
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      data-tip={tooltip ? label : undefined}
      data-tip-pos={tooltipPosition === 'bottom' ? 'bottom' : undefined}
      className={[
        'relative flex shrink-0 items-center justify-center rounded-full transition-[color,transform] duration-100',
        'disabled:pointer-events-none disabled:opacity-40 active:scale-95',
        active ? 'text-sp-green hover:text-sp-green-hover' : 'text-sp-subdued hover:text-white',
        SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
      {active && showDot && (
        <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sp-green" />
      )}
    </button>
  ),
);

IconButton.displayName = 'IconButton';
