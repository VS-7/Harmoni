import React from 'react';
import { LiquidGlass, type GlassRadius, type GlassVariant } from './LiquidGlass.tsx';

export interface GlassSurfaceProps {
  children: React.ReactNode;
  radius?: GlassRadius;
  variant?: GlassVariant;
  className?: string;
  contentClassName?: string;
  style?: React.CSSProperties;
}

/** Base de cards, sheets, tab bar, mini player e header (RF9.1). */
export const GlassSurface: React.FC<GlassSurfaceProps> = ({
  children,
  radius = 'md',
  variant = 'full',
  className = '',
  contentClassName = '',
  style,
}) => (
  <LiquidGlass
    radius={radius}
    variant={variant}
    className={className}
    contentClassName={contentClassName}
    style={style}
  >
    {children}
  </LiquidGlass>
);
