import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { GlassButton, GlassSurface, ProgressiveBlur } from '../../shared/ui/glass/index.ts';

interface LargeTitleHeaderProps {
  title: string;
  /** Quanto o conteúdo já rolou; acima do limiar o título vira compacto (RF10.1). */
  scrollY: number;
  onBack?: () => void;
  actions?: React.ReactNode;
}

/** A partir daqui o título grande dá lugar ao compacto, como no Apple Music. */
const COLLAPSE_AT = 28;

export const LargeTitleHeader: React.FC<LargeTitleHeaderProps> = ({
  title,
  scrollY,
  onBack,
  actions,
}) => {
  const collapsed = scrollY > COLLAPSE_AT;

  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-30"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      {/* Progressive Blur atrás do header (Apêndice B). */}
      <ProgressiveBlur
        edge="top"
        height="calc(var(--safe-top) + var(--header-height) + 24px)"
        className="-z-10"
      />

      <div
        className="pointer-events-auto flex items-center gap-2 px-4"
        style={{ height: 'var(--header-height)' }}
      >
        {onBack && (
          <GlassButton size="sm" shape="icon" onClick={onBack} aria-label="Voltar">
            <ChevronLeft size={18} />
          </GlassButton>
        )}

        {/* Título compacto dentro de uma GlassSurface quando a lista rola. */}
        <div
          className="min-w-0 flex-1 transition-opacity duration-200"
          style={{ opacity: collapsed ? 1 : 0 }}
        >
          <GlassSurface radius="pill" variant="light" className="inline-flex max-w-full">
            <span className="block truncate px-4 py-1.5 text-headline text-on-glass">{title}</span>
          </GlassSurface>
        </div>

        {actions && <div className="pointer-events-auto flex items-center gap-2">{actions}</div>}
      </div>

      {/* Título grande: some ao rolar, exatamente como o compacto aparece. */}
      <div
        className="pointer-events-none px-4 pb-1 transition-[opacity,transform] duration-200"
        style={{
          opacity: collapsed ? 0 : 1,
          transform: collapsed ? 'translateY(-8px)' : 'none',
        }}
      >
        <h1 className="text-large-title text-on-glass truncate">{title}</h1>
      </div>
    </header>
  );
};
