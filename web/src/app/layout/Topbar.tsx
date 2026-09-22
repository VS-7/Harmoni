import React, { useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleArrowDown,
  Download,
  FolderPlus,
  House,
  LayoutGrid,
  ListMusic,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { apiClient } from '../../adapters/api/client.ts';
import { Link } from '../router/Link.tsx';
import { navigate, useRouter } from '../router/router.ts';
import { LogoMark } from '../../shared/components/Logo.tsx';
import { openMenu } from '../../shared/store/menuStore.ts';
import { toast } from '../../shared/store/toastStore.ts';
import { NotificationsButton } from '../../features/downloads/components/NotificationsButton.tsx';
import { useLibraryStore } from '../../features/library/store/libraryStore.ts';
import { createMenu } from '../../features/library/menus.tsx';

const NavArrow: React.FC<{ direction: 'back' | 'forward'; disabled: boolean; onClick: () => void }> = ({ direction, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={direction === 'back' ? 'Voltar' : 'Avançar'}
    data-tip={direction === 'back' ? 'Voltar' : 'Avançar'}
    data-tip-pos="bottom"
    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
  >
    {direction === 'back' ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
  </button>
);

/** Barra superior global do Spotify: navegação, Início, busca e notificações. */
export const Topbar: React.FC = () => {
  const route = useRouter((s) => s.route);
  const index = useRouter((s) => s.index);
  const maxIndex = useRouter((s) => s.maxIndex);
  const back = useRouter((s) => s.back);
  const forward = useRouter((s) => s.forward);
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSearch = route.name === 'search';
  const query = onSearch ? route.query : '';

  // Ctrl/⌘+K leva à busca, como no Spotify.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openUserMenu = (event: React.MouseEvent) =>
    openMenu(
      event,
      [
        { id: 'downloads', label: 'Downloads do servidor', icon: Download, onSelect: () => navigate({ name: 'downloads' }) },
        { id: 'offline', label: 'Músicas baixadas no aparelho', icon: CircleArrowDown, onSelect: () => navigate({ name: 'offline' }) },
        { kind: 'separator', id: 'sep-create' },
        { id: 'create', label: 'Criar', icon: FolderPlus, submenu: createMenu(null) },
        { id: 'library', label: 'Sua Biblioteca', icon: ListMusic, onSelect: () => navigate({ name: 'library' }) },
        { kind: 'separator', id: 'sep-scan' },
        {
          id: 'scan',
          label: 'Varrer pasta de músicas',
          icon: RefreshCw,
          onSelect: async () => {
            await apiClient.triggerScan();
            toast('Varredura iniciada no servidor');
            // A varredura roda no servidor; recarrega a biblioteca depois de um tempo.
            window.setTimeout(() => void refreshLibrary(), 4000);
          },
        },
      ],
      { align: 'end', header: { title: 'Harmoni' } },
    );

  return (
    <header className="grid h-[var(--topbar-h)] shrink-0 grid-cols-[1fr_minmax(0,560px)_1fr] items-center gap-2 px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Link to={{ name: 'home' }} aria-label="Harmoni" className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center text-white">
          <LogoMark size={32} />
        </Link>
        <NavArrow direction="back" disabled={index === 0 && route.name === 'home'} onClick={back} />
        <NavArrow direction="forward" disabled={index >= maxIndex} onClick={forward} />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Link
          to={{ name: 'home' }}
          aria-label="Início"
          data-tip="Início"
          data-tip-pos="bottom"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sp-elevated text-sp-subdued transition-[color,transform] hover:scale-[1.04] hover:text-white"
        >
          <House size={24} className={route.name === 'home' ? 'fill-white text-white' : ''} />
        </Link>
        <label className="group flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-sp-elevated px-3 ring-white transition-colors hover:bg-sp-highlight hover:ring-1 hover:ring-white/20 focus-within:!ring-2 focus-within:!ring-white">
          <Search size={24} className="shrink-0 text-sp-subdued group-focus-within:text-white group-hover:text-white" />
          <input
            ref={inputRef}
            value={query}
            onFocus={() => !onSearch && navigate({ name: 'search', query: '' })}
            onChange={(e) => navigate({ name: 'search', query: e.target.value }, { replace: onSearch })}
            type="search"
            placeholder="O que você quer ouvir?"
            aria-label="O que você quer ouvir?"
            className="min-w-0 flex-1 bg-transparent text-base text-white outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                navigate({ name: 'search', query: '' }, { replace: true });
                inputRef.current?.focus();
              }}
              aria-label="Limpar busca"
              className="shrink-0 text-sp-subdued hover:text-white"
            >
              <X size={22} />
            </button>
          ) : (
            <span className="flex shrink-0 items-center gap-3">
              <span className="h-6 w-px bg-sp-subdued/50" />
              <button
                type="button"
                onClick={() => navigate({ name: 'search', query: '' })}
                aria-label="Navegar"
                data-tip="Navegar"
                data-tip-pos="bottom"
                className={`${onSearch ? 'text-white' : 'text-sp-subdued'} hover:scale-[1.04] hover:text-white`}
              >
                <LayoutGrid size={22} />
              </button>
            </span>
          )}
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        <NotificationsButton />
        <button
          type="button"
          onClick={openUserMenu}
          aria-label="Harmoni"
          data-tip="Harmoni"
          data-tip-pos="bottom"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-sp-elevated transition-transform hover:scale-[1.04]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sp-green text-sm font-bold text-black">H</span>
        </button>
      </div>
    </header>
  );
};
