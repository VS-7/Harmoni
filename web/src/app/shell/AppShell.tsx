import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ProgressiveBlur } from '../../shared/ui/glass/index.ts';
import { usePlayerStore } from '../../features/player/store/playerStore.ts';
import { apiClient } from '../../adapters/api/client.ts';
import { CoverBackdrop } from './CoverBackdrop.tsx';
import { LargeTitleHeader } from './LargeTitleHeader.tsx';
import { MiniPlayer } from './MiniPlayer.tsx';
import { NowPlayingSheet } from './NowPlayingSheet.tsx';
import { TabBar } from './TabBar.tsx';
import type { TabKey } from '../navigation/routes.ts';

interface AppShellProps {
  title: string;
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  onBack?: () => void;
  headerActions?: React.ReactNode;
  /** Capa que colore o fundo desta tela; sem ela, vale a da faixa atual (RF9.4). */
  backdropUrl?: string | null;
  children: React.ReactNode;
}

/**
 * Estrutura estilo Apple Music (RF10.1): header com título grande, conteúdo rolável,
 * mini player e tab bar flutuantes. No desktop a tab bar vira sidebar.
 */
export const AppShell: React.FC<AppShellProps> = ({
  title,
  activeTab,
  onSelectTab,
  onBack,
  headerActions,
  backdropUrl,
  children,
}) => {
  const [scrollY, setScrollY] = useState(0);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);

  const currentTrack = usePlayerStore((s) => s.currentTrack);

  // Cada troca de tela volta ao topo, como a navegação nativa faz.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollY(0);
  }, [title]);

  const onScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    setScrollY(event.currentTarget.scrollTop);
  }, []);

  const backdrop =
    backdropUrl !== undefined
      ? backdropUrl
      : currentTrack
        ? apiClient.getCoverUrl(currentTrack.id)
        : null;

  return (
    <div className="relative flex h-[100dvh] overflow-hidden">
      <CoverBackdrop imageUrl={backdrop} />

      {/* Sidebar de vidro no desktop (RF10.1). */}
      <aside
        className="hidden w-[248px] shrink-0 p-4 lg:block"
        style={{ paddingTop: 'calc(var(--safe-top) + 16px)' }}
      >
        <TabBar active={activeTab} onSelect={onSelectTab} orientation="vertical" />
      </aside>

      <div className="relative min-w-0 flex-1">
        <LargeTitleHeader
          title={title}
          scrollY={scrollY}
          onBack={onBack}
          actions={headerActions}
        />

        <main
          ref={scrollRef}
          onScroll={onScroll}
          className="app-scroll h-full px-4"
          style={{
            paddingTop: 'calc(var(--safe-top) + var(--header-height) + 48px)',
            paddingBottom: 'var(--chrome-bottom)',
          }}
        >
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>

        {/* Chrome flutuante da base: blur em degradê, mini player e tab bar. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
          <ProgressiveBlur
            edge="bottom"
            height="calc(var(--chrome-bottom) + 16px)"
            className="-z-10"
          />
          <div
            className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col gap-2 px-3"
            style={{ paddingBottom: 'max(var(--safe-bottom), 8px)' }}
          >
            <MiniPlayer onExpand={() => setNowPlayingOpen(true)} />
            <div className="lg:hidden">
              <TabBar active={activeTab} onSelect={onSelectTab} />
            </div>
          </div>
        </div>
      </div>

      <NowPlayingSheet open={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
    </div>
  );
};
