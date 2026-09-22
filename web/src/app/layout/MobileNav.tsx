import React from 'react';
import { House, Library, Plus, Search } from 'lucide-react';
import { Link } from '../router/Link.tsx';
import { useRouter } from '../router/router.ts';
import type { Route } from '../router/routes.ts';
import { openMenu } from '../../shared/store/menuStore.ts';
import { createMenu } from '../../features/library/menus.tsx';

const ITEMS: { label: string; to: Route; icon: typeof House; match: (route: Route) => boolean }[] = [
  { label: 'Início', to: { name: 'home' }, icon: House, match: (r) => r.name === 'home' || r.name === 'section' },
  { label: 'Buscar', to: { name: 'search', query: '' }, icon: Search, match: (r) => r.name === 'search' },
  { label: 'Sua Biblioteca', to: { name: 'library' }, icon: Library, match: (r) => r.name === 'library' },
];

/** Barra de navegação do app móvel, sobre o degradê preto da base. */
export const MobileNav: React.FC = () => {
  const route = useRouter((s) => s.route);

  return (
    <nav
      aria-label="Navegação principal"
      className="flex h-[var(--mobile-nav-h)] items-stretch justify-around pb-[var(--safe-bottom)] box-content"
    >
      {ITEMS.map(({ label, to, icon: Icon, match }) => {
        const active = match(route);
        return (
          <Link
            key={label}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'text-white' : 'text-sp-subdued'}`}
          >
            <Icon size={24} className={active && Icon !== Search ? 'fill-white' : ''} strokeWidth={active ? 2.5 : 2} />
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={(event) => openMenu(event, createMenu(null), { header: { title: 'Criar' } })}
        className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] text-sp-subdued"
      >
        <Plus size={24} />
        Criar
      </button>
    </nav>
  );
};
