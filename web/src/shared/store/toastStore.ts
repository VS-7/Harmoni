import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
const DURATION_MS = 3000;

/** O aviso azul do rodapé ("Adicionado à playlist"). */
export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show(message) {
    const id = nextId++;
    // Um aviso por vez, como no Spotify: o novo substitui o anterior.
    set({ toasts: [{ id, message }] });
    window.setTimeout(() => get().dismiss(id), DURATION_MS);
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

export const toast = (message: string) => useToastStore.getState().show(message);
