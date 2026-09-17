import React, { useState, useEffect } from 'react';
import { Waves, Library, DownloadCloud, Wifi, WifiOff } from 'lucide-react';
import { LibraryView } from './features/library/components/LibraryView.tsx';
import { DownloadsView } from './features/downloads/components/DownloadsView.tsx';
import { BottomPlayer } from './features/player/components/BottomPlayer.tsx';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'library' | 'downloads'>('library');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Register Service Worker for PWA (RF5.1)
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0e12] text-zinc-100 flex flex-col pb-32">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/60 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-zinc-950">
              <Waves size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                Harmoni
              </h1>
              <span className="text-[10px] text-zinc-500 font-mono block -mt-1">
                Audio Stream Engine
              </span>
            </div>
          </div>

          {/* Navigation & Status */}
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/60">
              <button
                onClick={() => setActiveView('library')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeView === 'library'
                    ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Library size={15} />
                Biblioteca
              </button>

              <button
                onClick={() => setActiveView('downloads')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeView === 'downloads'
                    ? 'bg-zinc-800 text-emerald-400 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <DownloadCloud size={15} />
                Downloads
              </button>
            </nav>

            {/* Online/Offline connectivity indicator */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
              title={isOnline ? 'Conectado ao servidor' : 'Modo Offline (IndexedDB Ativo)'}
            >
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        {activeView === 'library' ? <LibraryView /> : <DownloadsView />}
      </main>

      {/* Persistent Global Player (RF5.5) */}
      <BottomPlayer />
    </div>
  );
};
