import { create } from 'zustand';

interface MainScrollStore {
  y: number;
  /** O container rolável da área principal, raiz dos IntersectionObservers das páginas. */
  element: HTMLElement | null;
  setY: (y: number) => void;
  setElement: (element: HTMLElement | null) => void;
}

/** Posição de rolagem da área principal, para o cabeçalho fixo e o fundo da Início. */
export const useMainScroll = create<MainScrollStore>((set) => ({
  y: 0,
  element: null,
  setY: (y) => set({ y }),
  setElement: (element) => set({ element }),
}));
