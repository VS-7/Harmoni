import React from 'react';
import { Library, Search, ArrowDownToLine, Smartphone } from 'lucide-react';
import { GlassSurface } from '../../shared/ui/glass/index.ts';
import { TAB_KEYS, type TabKey } from '../navigation/routes.ts';

const TABS: Record<TabKey, { label: string; Icon: React.ComponentType<{ size?: number }> }> = {
  library: { label: 'Biblioteca', Icon: Library },
  search: { label: 'Buscar', Icon: Search },
  downloads: { label: 'Downloads', Icon: ArrowDownToLine },
  offline: { label: 'No Aparelho', Icon: Smartphone },
};

interface TabBarProps {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
  /** No desktop a barra vira uma sidebar de vidro à esquerda (RF10.1). */
  orientation?: 'horizontal' | 'vertical';
}

export const TabBar: React.FC<TabBarProps> = ({ active, onSelect, orientation = 'horizontal' }) => {
  const isVertical = orientation === 'vertical';

  return (
    <GlassSurface
      radius={isVertical ? 'md' : 'pill'}
      className={isVertical ? 'w-full' : 'w-full'}
      contentClassName={isVertical ? 'p-2' : ''}
    >
      <nav
        aria-label="Navegação principal"
        className={isVertical ? 'flex flex-col gap-1' : 'flex items-stretch justify-around'}
        style={isVertical ? undefined : { height: 'var(--tab-bar-height)' }}
      >
        {TAB_KEYS.map((key) => {
          const { label, Icon } = TABS[key];
          const isActive = key === active;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-current={isActive ? 'page' : undefined}
              className={[
                'flex items-center transition-[opacity,transform,background-color] duration-150 active:scale-[0.96]',
                isVertical
                  ? 'gap-3 rounded-2xl px-4 py-3 text-body'
                  : 'flex-1 flex-col justify-center gap-1 min-h-11',
                // Estado ativo é opacidade e brilho, nunca preenchimento colorido (RF9.2).
                isActive ? 'opacity-100' : 'opacity-55',
                isVertical && isActive ? 'bg-[color:var(--glass-scrim-active)]' : '',
              ].join(' ')}
            >
              <span className="text-[color:var(--fg)]">
                <Icon size={isVertical ? 20 : 22} />
              </span>
              <span
                className={[
                  'text-[color:var(--fg)] text-on-glass',
                  isVertical ? 'text-body' : 'text-caption',
                  isActive ? 'font-semibold' : 'font-medium',
                ].join(' ')}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </GlassSurface>
  );
};
