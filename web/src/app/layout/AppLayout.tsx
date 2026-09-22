import React from 'react';
import { useIsDesktop, useIsMobile } from '../../shared/hooks/useMediaQuery.ts';
import { DialogHost } from '../../shared/components/Modal.tsx';
import { MenuHost } from '../../shared/components/MenuHost.tsx';
import { Toaster } from '../../shared/components/Toaster.tsx';
import { LibraryPanel } from '../../features/library/components/LibraryPanel.tsx';
import { PlayerBar } from '../../features/player/components/PlayerBar.tsx';
import { RightPanel } from '../../features/player/components/RightPanel.tsx';
import { MobilePlayer } from '../../features/player/components/MobilePlayer.tsx';
import { NowPlayingView } from '../../features/player/components/NowPlayingView.tsx';
import { usePlayerStore } from '../../features/player/store/playerStore.ts';
import { useLayoutStore } from './layoutStore.ts';
import { MainView } from './MainView.tsx';
import { MobileNav } from './MobileNav.tsx';
import { RouteView } from './RouteView.tsx';
import { Topbar } from './Topbar.tsx';
import { useAppEffects } from './useAppEffects.ts';

/**
 * Estrutura do Spotify: barra superior, Sua Biblioteca à esquerda, conteúdo no centro,
 * fila à direita e o player fixo na base. No celular: conteúdo em tela cheia, mini player
 * flutuante e navegação inferior.
 */
export const AppLayout: React.FC = () => {
  useAppEffects();
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const rightPanel = useLayoutStore((s) => s.rightPanel);
  const hasTrack = usePlayerStore((s) => s.currentTrack !== null);

  const overlays = (
    <>
      <MenuHost />
      <DialogHost />
      <Toaster />
    </>
  );

  if (isMobile) {
    return (
      <div className="relative h-[100dvh] overflow-hidden bg-sp-base">
        <MainView className="h-full">
          {/* Reserva o espaço do mini player e da navegação para o fim da lista não ficar escondido. */}
          <div
            className="pt-[var(--safe-top)]"
            style={{
              paddingBottom: `calc(var(--mobile-nav-h) + var(--safe-bottom) + ${hasTrack ? 'var(--mobile-player-h) + 16px' : '8px'})`,
            }}
          >
            <RouteView />
          </div>
        </MainView>
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-[linear-gradient(transparent,rgba(0,0,0,0.85)_45%,#000)] pt-8">
          <div className="pointer-events-auto">
            <MobilePlayer />
            <MobileNav />
          </div>
        </div>
        <NowPlayingView />
        {overlays}
      </div>
    );
  }

  // Entre 768 e 1023px a biblioteca fica sempre recolhida, como no Spotify estreito.
  const collapsed = !isDesktop || sidebarCollapsed;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-black">
      <Topbar />
      <div className="flex min-h-0 flex-1 gap-2 px-2">
        <div className={`shrink-0 ${collapsed ? 'w-[72px]' : 'w-[clamp(280px,24vw,420px)]'}`}>
          <LibraryPanel collapsed={collapsed} onToggleCollapsed={isDesktop ? toggleSidebar : undefined} />
        </div>
        <MainView className="min-w-0 flex-1 overflow-x-hidden rounded-lg bg-sp-base">
          <RouteView />
        </MainView>
        {rightPanel && (
          <div className="w-[clamp(280px,22vw,420px)] shrink-0">
            <RightPanel />
          </div>
        )}
      </div>
      <PlayerBar />
      {overlays}
    </div>
  );
};
