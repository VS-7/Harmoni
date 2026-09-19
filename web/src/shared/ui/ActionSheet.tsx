import React from 'react';
import { Sheet } from './Sheet.tsx';
import { GlassSurface } from './glass/index.ts';
import { useIsDesktop } from '../hooks/useMediaQuery.ts';

export interface ActionItem {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  onSelect: () => void | Promise<void>;
  /** Ações destrutivas se distinguem só pelo texto, nunca por preenchimento (RF9.2). */
  destructive?: boolean;
  disabled?: boolean;
  /** 0 a 1 enquanto a ação roda, como o download offline de uma faixa (RF11.4). */
  progress?: number;
  /** Mantém a sheet aberta após o toque (útil durante um download com progresso). */
  keepOpen?: boolean;
}

export interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  thumbnailUrl?: string;
  items: ActionItem[];
}

/**
 * Menu de ações do item (RF11.2): bottom sheet de vidro no mobile e popover no desktop.
 * Nenhum item depende de hover, o que corrige o P5.
 */
export const ActionSheet: React.FC<ActionSheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  thumbnailUrl,
  items,
}) => {
  const isDesktop = useIsDesktop();

  const handleSelect = async (item: ActionItem) => {
    if (item.disabled) return;
    if (!item.keepOpen) onClose();
    await item.onSelect();
  };

  const header = (
    <div className="flex items-center gap-3 px-5 pb-3">
      {thumbnailUrl && (
        <img src={thumbnailUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0">
        <p className="truncate text-headline text-on-glass">{title}</p>
        {subtitle && (
          <p className="truncate text-footnote text-[color:var(--fg-secondary)]">{subtitle}</p>
        )}
      </div>
    </div>
  );

  const list = (
    <ul className="px-2 pb-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => void handleSelect(item)}
            className={[
              'relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3',
              'min-h-11 text-left text-body transition-colors duration-150',
              'active:bg-[color:var(--glass-scrim-active)] disabled:opacity-40',
              item.destructive ? 'text-[#ff6961]' : 'text-[color:var(--fg)]',
            ].join(' ')}
          >
            {/* Barra de progresso ocupa o fundo do próprio item. */}
            {item.progress !== undefined && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-[color:var(--glass-scrim-active)] transition-[width] duration-200"
                style={{ width: `${Math.round(item.progress * 100)}%` }}
              />
            )}
            <span className="relative shrink-0 opacity-80">
              <item.Icon size={18} />
            </span>
            <span className="relative min-w-0 flex-1 truncate">{item.label}</span>
            {item.progress !== undefined && (
              <span className="relative shrink-0 text-footnote text-[color:var(--fg-secondary)]">
                {Math.round(item.progress * 100)}%
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );

  if (!open) return null;

  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
        <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40 animate-fade-in" />
        <GlassSurface radius="md" className="relative w-[min(92vw,360px)] animate-fade-in">
          <div className="py-4">
            {header}
            {list}
          </div>
        </GlassSurface>
      </div>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} label={`Ações de ${title}`}>
      <div className="pb-2">
        {header}
        {list}
      </div>
    </Sheet>
  );
};
