import { create } from 'zustand';
import { preferences } from '../../adapters/storage/preferences.ts';

export type RightPanel = 'queue' | 'now-playing' | null;

interface LayoutStore {
  /** Painel à direita no desktop: fila ou "Tocando agora". */
  rightPanel: RightPanel;
  sidebarCollapsed: boolean;
  /** Player em tela cheia do celular. */
  nowPlayingOpen: boolean;
  toggleRightPanel: (panel: Exclude<RightPanel, null>) => void;
  closeRightPanel: () => void;
  toggleSidebar: () => void;
  setNowPlayingOpen: (open: boolean) => void;
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  rightPanel: preferences.get<RightPanel>('right-panel', null),
  sidebarCollapsed: preferences.get<boolean>('sidebar-collapsed', false),
  nowPlayingOpen: false,

  toggleRightPanel(panel) {
    const rightPanel = get().rightPanel === panel ? null : panel;
    set({ rightPanel });
    preferences.set('right-panel', rightPanel);
  },
  closeRightPanel() {
    set({ rightPanel: null });
    preferences.set('right-panel', null);
  },
  toggleSidebar() {
    const sidebarCollapsed = !get().sidebarCollapsed;
    set({ sidebarCollapsed });
    preferences.set('sidebar-collapsed', sidebarCollapsed);
  },
  setNowPlayingOpen(open) {
    set({ nowPlayingOpen: open });
  },
}));
