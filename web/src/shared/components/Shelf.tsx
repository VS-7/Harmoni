import React from 'react';
import { Link } from '../../app/router/Link.tsx';
import type { Route } from '../../app/router/routes.ts';
import { useColumnCount } from '../hooks/useColumnCount.ts';
import { useIsMobile } from '../hooks/useMediaQuery.ts';

interface ShelfProps {
  title: string;
  /** Destino do título e do "Mostrar tudo". */
  to?: Route;
  eyebrow?: string;
  children: React.ReactNode[];
}

/**
 * Estante da Início: uma única linha de cards que cabe na largura (o restante fica em
 * "Mostrar tudo"). No celular vira uma fileira com rolagem horizontal.
 */
export const Shelf: React.FC<ShelfProps> = ({ title, to, eyebrow, children }) => {
  const isMobile = useIsMobile();
  const { ref, columns } = useColumnCount<HTMLDivElement>(164, 0);
  const items = React.Children.toArray(children);
  if (items.length === 0) return null;
  const hasMore = items.length > columns;

  return (
    <section className="mb-4">
      <div className="mb-1 flex items-end justify-between gap-4 px-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-sm text-sp-subdued">{eyebrow}</p>}
          {to ? (
            <Link to={to} className="block truncate text-2xl font-bold hover:underline">
              {title}
            </Link>
          ) : (
            <h2 className="truncate text-2xl font-bold">{title}</h2>
          )}
        </div>
        {to && (hasMore || isMobile) && (
          <Link to={to} className="shrink-0 pb-1 text-sm font-bold text-sp-subdued hover:underline">
            Mostrar tudo
          </Link>
        )}
      </div>

      {isMobile ? (
        <div className="no-scrollbar -mx-1 flex snap-x overflow-x-auto px-1">
          {items.slice(0, 12).map((item, index) => (
            <div key={index} className="w-[164px] shrink-0 snap-start">
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div ref={ref} className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {items.slice(0, columns)}
        </div>
      )}
    </section>
  );
};

/** Grade completa de cards (páginas "Mostrar tudo", pastas). */
export const CardGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(164px,1fr))]">{children}</div>
);
