import React from 'react';
import { GlassSurface } from './glass/index.ts';

interface GlassFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}

/** Campo de texto sobre vidro, sem borda colorida de foco (RF9.2). */
export const GlassField: React.FC<GlassFieldProps> = ({ icon, trailing, className = '', ...rest }) => (
  <GlassSurface radius="pill" variant="light" className={className}>
    <div className="flex min-h-11 items-center gap-2 px-4">
      {icon && <span className="shrink-0 opacity-60">{icon}</span>}
      <input
        {...rest}
        className="min-w-0 flex-1 bg-transparent text-body text-[color:var(--fg)] outline-none placeholder:text-[color:var(--fg-tertiary)]"
      />
      {trailing}
    </div>
  </GlassSurface>
);
