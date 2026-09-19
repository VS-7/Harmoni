import React from 'react';

export type GlassRadius = 'sm' | 'md' | 'pill';
/** full = as 7 camadas do Apêndice A; light = 1 camada, para linhas de lista (RF9.5). */
export type GlassVariant = 'full' | 'light';

export interface LiquidGlassProps {
  children: React.ReactNode;
  radius?: GlassRadius;
  /** Intensidade do blur base, em px (--base-strength). */
  strength?: number;
  /** Suavidade das bordas refratadas (--softness). */
  softness?: number;
  /** Matiz opcional do vidro; 0 mantém neutro, que é o padrão do design (RF9.2). */
  tint?: number;
  variant?: GlassVariant;
  className?: string;
  contentClassName?: string;
  style?: React.CSSProperties;
}

const RADIUS_CLASS: Record<GlassRadius, string> = {
  sm: 'GlassContainer--sm',
  md: '',
  pill: 'GlassContainer--pill',
};

/**
 * Implementa o material Liquid Glass do Apêndice A do PRD v2.
 *
 * O contêiner não recebe eventos: quem os recebe é `.GlassContent`, para que as
 * camadas de material nunca roubem o toque dos controles.
 */
export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  radius = 'md',
  strength,
  softness,
  tint,
  variant = 'full',
  className = '',
  contentClassName = '',
  style,
}) => {
  const cssVars: React.CSSProperties = { ...style };
  if (strength !== undefined) {
    (cssVars as Record<string, string>)['--base-strength'] = `${strength}px`;
  }
  if (softness !== undefined) {
    (cssVars as Record<string, string>)['--softness'] = `${softness}px`;
  }
  if (tint !== undefined) {
    (cssVars as Record<string, string>)['--tint-amount'] = String(tint);
  }

  const containerClass = [
    'GlassContainer',
    RADIUS_CLASS[radius],
    variant === 'light' ? 'GlassContainer--light' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClass} style={cssVars}>
      <div className={`GlassContent ${contentClassName}`}>{children}</div>
      {variant === 'full' && (
        <div className="GlassMaterial" aria-hidden="true">
          <div className="GlassEdgeReflection" />
          <div className="GlassEmbossReflection" />
          <div className="GlassRefraction" />
          <div className="GlassBlur" />
          <div className="BlendLayers" />
          <div className="BlendEdge" />
          <div className="Highlight" />
        </div>
      )}
    </div>
  );
};
