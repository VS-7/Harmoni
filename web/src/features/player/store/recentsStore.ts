import { create } from 'zustand';
import { contextKey, type PlaybackContext } from '../../../domain/player.ts';
import { preferences } from '../../../adapters/storage/preferences.ts';

export interface RecentItem extends PlaybackContext {
  playedAt: number;
}

const STORAGE_KEY = 'recents';
const MAX_ITEMS = 40;

interface RecentsStore {
  items: RecentItem[];
  record: (context: PlaybackContext) => void;
  forget: (context: Pick<PlaybackContext, 'type' | 'id'>) => void;
}

/** "Tocadas recentemente" e a ordem "Recentes" da biblioteca, guardadas no aparelho. */
export const useRecentsStore = create<RecentsStore>((set, get) => ({
  items: preferences.get<RecentItem[]>(STORAGE_KEY, []),

  record(context) {
    // A fila avulsa não é um lugar para onde se possa voltar.
    if (context.type === 'queue' || context.type === 'search') return;
    const key = contextKey(context);
    const items = [
      { ...context, playedAt: Date.now() },
      ...get().items.filter((item) => contextKey(item) !== key),
    ].slice(0, MAX_ITEMS);
    set({ items });
    preferences.set(STORAGE_KEY, items);
  },

  forget(context) {
    const key = contextKey(context);
    const items = get().items.filter((item) => contextKey(item) !== key);
    set({ items });
    preferences.set(STORAGE_KEY, items);
  },
}));
