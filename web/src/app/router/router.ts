import { create } from 'zustand';
import { HOME, isSameRoute, routeToUrl, urlToRoute, type Route } from './routes.ts';

type NavAction = 'push' | 'pop' | 'replace' | 'init';

interface HistoryEntryState {
  idx: number;
}

interface RouterStore {
  route: Route;
  /** Posição da entrada atual no histórico, gravada em history.state. */
  index: number;
  /** Maior índice alcançável para frente nesta sessão. */
  maxIndex: number;
  lastAction: NavAction;
  navigate: (route: Route, options?: { replace?: boolean }) => void;
  back: () => void;
  forward: () => void;
}

function readIndex(): number {
  const state = window.history.state as HistoryEntryState | null;
  return typeof state?.idx === 'number' ? state.idx : 0;
}

const initialIndex = readIndex();
window.history.replaceState({ idx: initialIndex } satisfies HistoryEntryState, '');

/**
 * Navegação sobre a History API: cada tela é uma entrada real do histórico, então os
 * botões voltar/avançar da barra superior, o voltar do Android e o gesto do iOS funcionam.
 */
export const useRouter = create<RouterStore>((set, get) => ({
  route: urlToRoute(window.location.pathname, window.location.search),
  index: initialIndex,
  maxIndex: initialIndex,
  lastAction: 'init',

  navigate(route, options) {
    const current = get();
    if (!options?.replace && isSameRoute(route, current.route)) return;

    if (options?.replace) {
      window.history.replaceState({ idx: current.index } satisfies HistoryEntryState, '', routeToUrl(route));
      set({ route, lastAction: 'replace' });
      return;
    }

    const index = current.index + 1;
    window.history.pushState({ idx: index } satisfies HistoryEntryState, '', routeToUrl(route));
    set({ route, index, maxIndex: index, lastAction: 'push' });
  },

  back() {
    if (get().index > 0) {
      window.history.back();
      return;
    }
    // Primeira entrada (link direto): voltar leva à Início em vez de sair do app.
    if (get().route.name !== 'home') get().navigate(HOME, { replace: true });
  },

  forward() {
    if (get().index < get().maxIndex) window.history.forward();
  },
}));

window.addEventListener('popstate', () => {
  const index = readIndex();
  useRouter.setState((state) => ({
    route: urlToRoute(window.location.pathname, window.location.search),
    index,
    maxIndex: Math.max(state.maxIndex, index),
    lastAction: 'pop',
  }));
});

/** Atalho para quem só precisa navegar, fora de componentes (menus, stores). */
export const navigate = (route: Route, options?: { replace?: boolean }) =>
  useRouter.getState().navigate(route, options);
