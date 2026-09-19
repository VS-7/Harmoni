import { useCallback, useEffect, useRef, useState } from 'react';
import { pathToRoute, routeToPath, tabOf, type Route, type TabKey } from './routes.ts';

interface Navigation {
  route: Route;
  activeTab: TabKey;
  /** Empilha uma tela; o gesto de voltar do sistema a desfaz (RF10.4). */
  push: (route: Route) => void;
  /** Troca de aba sem empilhar histórico infinito. */
  selectTab: (tab: TabKey) => void;
  back: () => void;
}

/**
 * Navegação sobre a History API, sem dependência nova (RF10.4): o botão voltar do
 * Android e o gesto de voltar do iOS funcionam porque cada tela é uma entrada real
 * do histórico.
 */
export function useNavigation(): Navigation {
  const [route, setRoute] = useState<Route>(() => pathToRoute(window.location.pathname));
  // Aba que o detalhe "pertence", para manter o item certo aceso na tab bar.
  const lastTab = useRef<TabKey>(tabOf(route, 'library'));
  // Profundidade empilhada por nós, para saber se dá para voltar dentro do app.
  const [depth, setDepth] = useState(0);

  if (route.name === 'tab') {
    lastTab.current = route.tab;
  }

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const next = (event.state?.route as Route | undefined) ?? pathToRoute(window.location.pathname);
      setRoute(next);
      setDepth((current) => Math.max(0, current - 1));
    };

    window.addEventListener('popstate', onPopState);
    // Garante que a entrada inicial carregue a rota ao voltar até ela.
    window.history.replaceState({ route }, '', routeToPath(route));
    return () => window.removeEventListener('popstate', onPopState);
    // Registrado uma única vez: o estado inicial já cobre a primeira entrada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = useCallback((next: Route) => {
    window.history.pushState({ route: next }, '', routeToPath(next));
    setRoute(next);
    setDepth((current) => current + 1);
  }, []);

  const selectTab = useCallback((tab: TabKey) => {
    const next: Route = { name: 'tab', tab };
    // Trocar de aba substitui a entrada atual: o voltar sai do app, como num app nativo.
    window.history.replaceState({ route: next }, '', routeToPath(next));
    setRoute(next);
    setDepth(0);
  }, []);

  const back = useCallback(() => {
    if (depth > 0) {
      window.history.back();
      return;
    }
    const fallback: Route = { name: 'tab', tab: lastTab.current };
    window.history.replaceState({ route: fallback }, '', routeToPath(fallback));
    setRoute(fallback);
  }, [depth]);

  return {
    route,
    activeTab: tabOf(route, lastTab.current),
    push,
    selectTab,
    back,
  };
}
