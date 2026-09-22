import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { toast } from '../../../shared/store/toastStore.ts';
import { formatDuration } from '../../../shared/utils/formatters.ts';
import { useLibraryStore } from '../store/libraryStore.ts';

const AddRow: React.FC<{ track: Track; onAdd: (track: Track) => Promise<void> }> = ({ track, onAdd }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="group flex h-14 items-center gap-3 rounded-[4px] px-2 hover:bg-white/10 md:px-4">
      <Cover src={apiClient.getCoverUrl(track.id)} className="h-10 w-10" iconSize={16} />
      <div className="min-w-0 flex-1">
        <p className="truncate">{track.title}</p>
        <p className="truncate text-sm text-sp-subdued">{track.artist_name}</p>
      </div>
      <span className="hidden min-w-0 flex-1 truncate text-sm text-sp-subdued lg:block">{track.album_title}</span>
      <span className="hidden w-12 text-right text-sm tabular-nums text-sp-subdued sm:block">{formatDuration(track.duration_sec)}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onAdd(track);
          } finally {
            setBusy(false);
          }
        }}
        className="h-8 shrink-0 rounded-full border border-sp-muted px-4 text-sm font-bold transition-transform hover:scale-[1.04] hover:border-white disabled:opacity-50"
      >
        Adicionar
      </button>
    </div>
  );
};

interface PlaylistExtrasProps {
  playlistId: string;
  tracks: Track[];
}

/**
 * Abaixo da playlist, como no Spotify: busca "Vamos procurar algo para sua playlist" e
 * "Recomendadas", que usa a rádio da primeira faixa para sugerir parecidas.
 */
export const PlaylistExtras: React.FC<PlaylistExtrasProps> = ({ playlistId, tracks }) => {
  const addTracks = useLibraryStore((s) => s.addTracks);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searchOpen, setSearchOpen] = useState(tracks.length === 0);
  const [recommended, setRecommended] = useState<Track[]>([]);
  const [nonce, setNonce] = useState(0);

  const inPlaylist = new Set(tracks.map((t) => t.id));
  const seedId = tracks[0]?.id;

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void apiClient
        .listTracks(0, 12, term)
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!seedId) {
      setRecommended([]);
      return;
    }
    let alive = true;
    const exclude = tracks.slice(0, 60).map((t) => t.id);
    void apiClient
      .getRadio(seedId, 10, [], exclude)
      .then((list) => alive && setRecommended(list))
      .catch(() => alive && setRecommended([]));
    return () => {
      alive = false;
    };
    // Recalcula ao trocar a semente ou ao pedir "Atualizar"; mudar a lista não dispara nova busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedId, nonce]);

  async function add(track: Track) {
    const added = await addTracks(playlistId, [track]);
    if (added > 0) {
      toast('Adicionada a esta playlist');
      setRecommended((list) => list.filter((t) => t.id !== track.id));
    } else {
      toast('Não foi possível adicionar');
    }
  }

  const freshRecommended = recommended.filter((t) => !inPlaylist.has(t.id));

  return (
    <div className="mt-10 px-2 md:px-4">
      {tracks.length > 0 && freshRecommended.length > 0 && (
        <section className="mb-10">
          <div className="px-2 md:px-4">
            <h2 className="text-2xl font-bold">Recomendadas</h2>
            <p className="text-sm text-sp-subdued">Com base no que está nesta playlist</p>
          </div>
          <div className="mt-4">
            {freshRecommended.map((track) => (
              <AddRow key={track.id} track={track} onAdd={add} />
            ))}
          </div>
          <div className="mt-2 flex justify-end px-2 md:px-4">
            <button type="button" onClick={() => setNonce((n) => n + 1)} className="flex items-center gap-2 text-sm font-bold text-sp-subdued hover:text-white">
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </section>
      )}

      {searchOpen ? (
        <section className="border-t border-white/10 pt-6">
          <div className="flex items-start justify-between gap-4 px-2 md:px-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold">Vamos procurar algo para sua playlist</h2>
              <label className="mt-4 flex h-10 max-w-[364px] items-center gap-2 rounded bg-white/10 px-3 focus-within:ring-1 focus-within:ring-white/50">
                <Search size={18} className="shrink-0 text-sp-subdued" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar músicas na biblioteca"
                  aria-label="Buscar músicas para adicionar"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca" className="text-sp-subdued hover:text-white">
                    <X size={16} />
                  </button>
                )}
              </label>
            </div>
            {tracks.length > 0 && (
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="Fechar busca" className="text-sp-subdued hover:text-white">
                <X size={24} />
              </button>
            )}
          </div>
          <div className="mt-4">
            {results.map((track) =>
              inPlaylist.has(track.id) ? null : <AddRow key={track.id} track={track} onAdd={add} />,
            )}
          </div>
        </section>
      ) : (
        <div className="flex justify-end px-2 md:px-4">
          <button type="button" onClick={() => setSearchOpen(true)} className="text-sm font-bold text-sp-subdued hover:text-white hover:underline">
            Procurar mais
          </button>
        </div>
      )}
    </div>
  );
};
