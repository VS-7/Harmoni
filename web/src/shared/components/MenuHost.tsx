import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useMenuStore,
  type MenuActionItem,
  type MenuAnchor,
  type MenuEntry,
  type MenuHeader,
} from '../store/menuStore.ts';
import { useIsMobile } from '../hooks/useMediaQuery.ts';
import { Cover } from './Cover.tsx';

const MARGIN = 8;

/** Posição do painel dentro da viewport, virando para cima/esquerda quando falta espaço. */
function place(anchor: MenuAnchor, width: number, height: number, align: 'start' | 'end') {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left: number;
  let top: number;

  if ('width' in anchor) {
    left = align === 'end' ? anchor.right - width : anchor.left;
    top = anchor.bottom + 4;
    if (top + height > vh - MARGIN) top = anchor.top - height - 4;
  } else {
    left = anchor.x;
    top = anchor.y;
    if (left + width > vw - MARGIN) left = anchor.x - width;
    if (top + height > vh - MARGIN) top = anchor.y - height;
  }

  left = Math.min(Math.max(MARGIN, left), vw - width - MARGIN);
  top = Math.min(Math.max(MARGIN, top), vh - height - MARGIN);
  return { left, top };
}

function isAction(entry: MenuEntry): entry is MenuActionItem {
  return entry.kind === undefined || entry.kind === 'item';
}

/** Setas movem o foco entre os itens, como num menu nativo. */
function onArrowKeys(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-menu-item]:not([disabled])'));
  if (items.length === 0) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
  items[next]?.focus();
}

interface PanelProps {
  entries: MenuEntry[];
  onClose: () => void;
  onRun: (item: MenuActionItem) => void;
  style: React.CSSProperties;
  panelRef?: React.Ref<HTMLDivElement>;
}

const DesktopPanel: React.FC<PanelProps> = ({ entries, onClose, onRun, style, panelRef }) => {
  const [openSub, setOpenSub] = useState<{ id: string; rect: DOMRect } | null>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [subStyle, setSubStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const hoverTimer = useRef<number | null>(null);

  const subEntries = openSub
    ? (entries.find((e) => isAction(e) && e.id === openSub.id) as MenuActionItem | undefined)?.submenu
    : undefined;

  useLayoutEffect(() => {
    if (!openSub || !subRef.current) return;
    const { width, height } = subRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = openSub.rect.right - 4;
    if (left + width > vw - MARGIN) left = openSub.rect.left - width + 4;
    const top = Math.min(Math.max(MARGIN, openSub.rect.top - 4), vh - height - MARGIN);
    setSubStyle({ left: Math.max(MARGIN, left), top });
  }, [openSub, subEntries]);

  const scheduleSub = (next: { id: string; rect: DOMRect } | null) => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setSubStyle({ visibility: 'hidden' });
      setOpenSub(next);
    }, next ? 120 : 250);
  };

  return (
    <>
      <div
        ref={panelRef}
        role="menu"
        tabIndex={-1}
        onKeyDown={onArrowKeys}
        style={style}
        className="fixed z-[90] min-w-[196px] max-w-[350px] animate-sp-pop overflow-y-auto rounded bg-sp-menu p-1 text-sm shadow-[0_16px_24px_rgba(0,0,0,0.3),0_6px_8px_rgba(0,0,0,0.2)] outline-none"
      >
        {entries.map((entry) => {
          if (entry.kind === 'separator') return <div key={entry.id} className="mx-1 my-1 h-px bg-white/10" />;
          if (entry.kind === 'custom') return <React.Fragment key={entry.id}>{entry.render(onClose)}</React.Fragment>;
          const item = entry;
          const Icon = item.icon;
          const hasSub = Boolean(item.submenu?.length);
          const expanded = openSub?.id === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-menu-item
              disabled={item.disabled}
              aria-haspopup={hasSub || undefined}
              aria-expanded={hasSub ? expanded : undefined}
              onMouseEnter={(event) =>
                scheduleSub(hasSub ? { id: item.id, rect: event.currentTarget.getBoundingClientRect() } : null)
              }
              onClick={(event) => {
                if (hasSub) {
                  setSubStyle({ visibility: 'hidden' });
                  setOpenSub({ id: item.id, rect: event.currentTarget.getBoundingClientRect() });
                  return;
                }
                onRun(item);
              }}
              onKeyDown={(event) => {
                if (hasSub && event.key === 'ArrowRight') {
                  setSubStyle({ visibility: 'hidden' });
                  setOpenSub({ id: item.id, rect: event.currentTarget.getBoundingClientRect() });
                }
              }}
              className={[
                'flex h-10 w-full items-center gap-3 rounded-sm pl-3 pr-2 text-left outline-none',
                'hover:bg-white/10 focus-visible:bg-white/10 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
                expanded ? 'bg-white/10' : '',
                item.active ? 'text-sp-green' : 'text-white/90',
              ].join(' ')}
            >
              {Icon && <Icon size={16} className={item.active ? 'text-sp-green' : 'text-sp-subdued'} />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint && <span className="shrink-0 text-xs text-sp-subdued">{item.hint}</span>}
              {hasSub && <ChevronRight size={16} className="shrink-0 text-sp-subdued" />}
            </button>
          );
        })}
      </div>

      {openSub && subEntries && (
        <div
          ref={subRef}
          role="menu"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') setOpenSub(null);
            onArrowKeys(event);
          }}
          onMouseEnter={() => {
            if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
          }}
          style={subStyle}
          className="fixed z-[91] max-h-[min(480px,calc(100dvh-16px))] min-w-[196px] max-w-[350px] overflow-y-auto rounded bg-sp-menu p-1 text-sm shadow-[0_16px_24px_rgba(0,0,0,0.3),0_6px_8px_rgba(0,0,0,0.2)] outline-none"
        >
          <PanelEntries entries={subEntries} onClose={onClose} onRun={onRun} />
        </div>
      )}
    </>
  );
};

/** Itens simples (sem submenu aninhado de segundo nível). */
const PanelEntries: React.FC<Omit<PanelProps, 'style' | 'panelRef'>> = ({ entries, onClose, onRun }) => (
  <>
    {entries.map((entry) => {
      if (entry.kind === 'separator') return <div key={entry.id} className="mx-1 my-1 h-px bg-white/10" />;
      if (entry.kind === 'custom') return <React.Fragment key={entry.id}>{entry.render(onClose)}</React.Fragment>;
      const Icon = entry.icon;
      return (
        <button
          key={entry.id}
          type="button"
          role="menuitem"
          data-menu-item
          disabled={entry.disabled}
          onClick={() => onRun(entry)}
          className={[
            'flex h-10 w-full items-center gap-3 rounded-sm pl-3 pr-2 text-left outline-none',
            'hover:bg-white/10 focus-visible:bg-white/10 disabled:cursor-default disabled:opacity-40',
            entry.active ? 'text-sp-green' : 'text-white/90',
          ].join(' ')}
        >
          {Icon && <Icon size={16} className={entry.active ? 'text-sp-green' : 'text-sp-subdued'} />}
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          {entry.hint && <span className="shrink-0 text-xs text-sp-subdued">{entry.hint}</span>}
        </button>
      );
    })}
  </>
);

/** Versão bottom sheet do app móvel, com o cabeçalho de capa e título. */
const MobileSheet: React.FC<{
  entries: MenuEntry[];
  header?: MenuHeader;
  onClose: () => void;
  onRun: (item: MenuActionItem) => void;
}> = ({ entries, header, onClose, onRun }) => {
  const [stack, setStack] = useState<{ title: string; entries: MenuEntry[] }[]>([]);
  const current = stack.length > 0 ? stack[stack.length - 1] : null;
  const shown = current ? current.entries : entries;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 animate-sp-fade bg-black/60" />
      <div
        className="relative max-h-[85dvh] animate-sp-up overflow-y-auto rounded-t-xl bg-sp-menu pb-[max(var(--safe-bottom),12px)]"
        onKeyDown={onArrowKeys}
      >
        <div className="flex justify-center pt-2 pb-1">
          <span className="h-1 w-10 rounded-full bg-white/30" />
        </div>

        {current ? (
          <button
            type="button"
            onClick={() => setStack((s) => s.slice(0, -1))}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-base font-bold"
          >
            <ChevronLeft size={22} />
            {current.title}
          </button>
        ) : (
          header && (
            <div className="flex items-center gap-3 border-b border-white/10 px-4 pb-4 pt-2">
              {header.imageUrl !== undefined && (
                <Cover src={header.imageUrl} round={header.round} className="h-12 w-12" iconSize={20} />
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-bold">{header.title}</p>
                {header.subtitle && <p className="truncate text-sm text-sp-subdued">{header.subtitle}</p>}
              </div>
            </div>
          )
        )}

        <div className="py-2">
          {shown.map((entry) => {
            if (entry.kind === 'separator') return <div key={entry.id} className="my-1 h-px bg-white/10" />;
            if (entry.kind === 'custom') return <div key={entry.id} className="px-2">{entry.render(onClose)}</div>;
            const Icon = entry.icon;
            const hasSub = Boolean(entry.submenu?.length);
            return (
              <button
                key={entry.id}
                type="button"
                data-menu-item
                disabled={entry.disabled}
                onClick={() => {
                  if (hasSub && entry.submenu) {
                    setStack((s) => [...s, { title: entry.label, entries: entry.submenu as MenuEntry[] }]);
                    return;
                  }
                  onRun(entry);
                }}
                className={[
                  'flex min-h-[52px] w-full items-center gap-4 px-4 text-left text-base active:bg-white/10 disabled:opacity-40',
                  entry.active ? 'text-sp-green' : 'text-white',
                ].join(' ')}
              >
                {Icon && <Icon size={22} className={entry.active ? 'text-sp-green' : 'text-sp-subdued'} />}
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {entry.hint && <span className="text-sm text-sp-subdued">{entry.hint}</span>}
                {hasSub && <ChevronRight size={20} className="text-sp-subdued" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Renderiza o menu aberto via openMenu(). */
export const MenuHost: React.FC = () => {
  const request = useMenuStore((s) => s.request);
  const seq = useMenuStore((s) => s.seq);
  const close = useMenuStore((s) => s.close);
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  const run = useCallback(
    (item: MenuActionItem) => {
      if (item.disabled) return;
      if (!item.keepOpen) close();
      void item.onSelect?.();
    },
    [close],
  );

  useLayoutEffect(() => {
    if (!request || isMobile || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const maxHeight = window.innerHeight - MARGIN * 2;
    const height = Math.min(rect.height, maxHeight);
    setStyle({ ...place(request.anchor, rect.width, height, request.align ?? 'start'), maxHeight });
    panelRef.current.focus({ preventScroll: true });
  }, [request, isMobile]);

  useEffect(() => {
    if (!request) {
      // Esconde até o próximo menu ser medido e posicionado pelo layout effect.
      setStyle({ visibility: 'hidden' });
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onScrollOrResize = (event: Event) => {
      // Rolar dentro do próprio menu (lista longa de playlists) não o fecha.
      if (event.target instanceof Node && panelRef.current?.parentElement?.contains(event.target)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [request, close]);

  if (!request) return null;

  if (isMobile) {
    return createPortal(
      <MobileSheet key={seq} entries={request.entries} header={request.header} onClose={close} onRun={run} />,
      document.body,
    );
  }

  return createPortal(
    <div>
      <div
        className="fixed inset-0 z-[89]"
        onMouseDown={close}
        onContextMenu={(event) => {
          event.preventDefault();
          close();
        }}
      />
      <DesktopPanel key={seq} entries={request.entries} onClose={close} onRun={run} style={style} panelRef={panelRef} />
    </div>,
    document.body,
  );
};
