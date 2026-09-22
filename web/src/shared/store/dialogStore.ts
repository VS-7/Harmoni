import type React from 'react';
import { create } from 'zustand';

type DialogRenderer = (close: () => void) => React.ReactNode;

interface DialogStore {
  render: DialogRenderer | null;
  open: (render: DialogRenderer) => void;
  close: () => void;
}

/** Um diálogo por vez, aberto de qualquer lugar (inclusive de itens de menu). */
export const useDialogStore = create<DialogStore>((set) => ({
  render: null,
  open: (render) => set({ render }),
  close: () => set({ render: null }),
}));

export const openDialog = (render: DialogRenderer) => useDialogStore.getState().open(render);
