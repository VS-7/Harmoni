import type React from 'react';
import { create } from 'zustand';

export type IconComponent = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export interface MenuActionItem {
  kind?: 'item';
  id: string;
  label: string;
  icon?: IconComponent;
  onSelect?: () => void | Promise<void>;
  disabled?: boolean;
  /** Destaque em verde para o estado ligado (ex.: "Baixado"). */
  active?: boolean;
  /** Texto à direita (atalho, contagem). */
  hint?: string;
  submenu?: MenuEntry[];
  /** Mantém o menu aberto depois do clique. */
  keepOpen?: boolean;
}

export interface MenuSeparator {
  kind: 'separator';
  id: string;
}

/** Conteúdo livre, como o campo "Buscar uma playlist" do submenu. */
export interface MenuCustom {
  kind: 'custom';
  id: string;
  render: (close: () => void) => React.ReactNode;
}

export type MenuEntry = MenuActionItem | MenuSeparator | MenuCustom;

export interface MenuHeader {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  round?: boolean;
}

export type MenuAnchor = { x: number; y: number } | DOMRect;

export interface MenuRequest {
  anchor: MenuAnchor;
  entries: MenuEntry[];
  /** Mostrado no topo da versão bottom sheet (mobile). */
  header?: MenuHeader;
  /** Alinha o menu pela direita do botão que o abriu. */
  align?: 'start' | 'end';
}

interface MenuStore {
  request: MenuRequest | null;
  /** Muda a cada abertura, para o menu novo não herdar o estado do anterior. */
  seq: number;
  open: (request: MenuRequest) => void;
  close: () => void;
}

export const useMenuStore = create<MenuStore>((set) => ({
  request: null,
  seq: 0,
  open: (request) => set((state) => ({ request, seq: state.seq + 1 })),
  close: () => set({ request: null }),
}));

/** Abre um menu ancorado no botão clicado ou na posição do clique direito. */
export function openMenu(
  event: React.MouseEvent | { currentTarget: Element; clientX?: number; clientY?: number; type?: string },
  entries: MenuEntry[],
  options: { header?: MenuHeader; align?: 'start' | 'end' } = {},
) {
  const isContextMenu = event.type === 'contextmenu';
  if ('preventDefault' in event && typeof event.preventDefault === 'function') event.preventDefault();
  if ('stopPropagation' in event && typeof event.stopPropagation === 'function') event.stopPropagation();

  const anchor: MenuAnchor = isContextMenu && event.clientX !== undefined && event.clientY !== undefined
    ? { x: event.clientX, y: event.clientY }
    : event.currentTarget.getBoundingClientRect();

  useMenuStore.getState().open({ anchor, entries, header: options.header, align: options.align });
}
