import React, { useState } from 'react';
import { ArrowDownToLine, CheckSquare, Search, X } from 'lucide-react';
import type { RemoteItem, SearchType } from '../../../domain/discovery.ts';
import type { Track } from '../../../domain/track.ts';
import { GlassButton, GlassSurface } from '../../../shared/ui/glass/index.ts';
import { GlassField } from '../../../shared/ui/GlassField.tsx';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl.tsx';
import { EmptyState } from '../../../shared/ui/EmptyState.tsx';
import { TrackList } from '../../library/components/TrackList.tsx';
import { TrackActionsMenu } from '../../library/components/TrackActionsMenu.tsx';
import { AddToPlaylistSheet } from '../../library/components/AddToPlaylistSheet.tsx';
import { useDiscoverSearch } from '../hooks/useDiscoverSearch.ts';
import { RemoteItemRow } from './RemoteItemRow.tsx';
import { RemoteActionsMenu } from './RemoteActionsMenu.tsx';
import { apiClient } from '../../../adapters/api/client.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useOfflineStore } from '../../offline/store/offlineStore.ts';

interface SearchViewProps {
  onOpenRemotePlaylist: (id: string) => void;
  onOpenRemoteArtist: (id: string) => void;
}

const KIND_LABEL: Record<string, string> = {
  track: 'Músicas',
  playlist: 'Playlists',
  artist: 'Artistas',
};

export const SearchView: React.FC<SearchViewProps> = ({
  onOpenRemotePlaylist,
  onOpenRemoteArtist,
}) => {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SearchType>('all');
  const [menuItem, setMenuItem] = useState<RemoteItem | null>(null);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [pickerTrack, setPickerTrack] = useState<Track | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Multi-seleção alimenta POST /downloads/batch (RF8.1).
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const { localTracks, remoteItems, loadingLocal, loadingRemote, error } = useDiscoverSearch(query, type);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const downloadOffline = useOfflineStore((s) => s.download);

  const remoteTracks = remoteItems.filter((i) => i.kind === 'track');
  const remotePlaylists = remoteItems.filter((i) => i.kind === 'playlist');
  const remoteArtists = remoteItems.filter((i) => i.kind === 'artist');

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendBatch() {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const jobs = await apiClient.submitBatch(
        [...selected].map((id) => ({ provider: 'youtube', kind: 'track' as const, id })),
      );
      setNotice(`${jobs.length} ${jobs.length === 1 ? 'faixa entrou' : 'faixas entraram'} na fila`);
      setSelected(new Set());
      setSelectMode(false);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function handleRemotePrimary(item: RemoteItem) {
    if (selectMode && item.kind === 'track') {
      toggleSelected(item.id);
      return;
    }
    if (item.kind === 'playlist') onOpenRemotePlaylist(item.id);
    else if (item.kind === 'artist') onOpenRemoteArtist(item.id);
    else setMenuItem(item);
  }

  const hasQuery = query.trim().length >= 2;

  return (
    <div className="space-y-4">
      <GlassField
        icon={<Search size={16} />}
        placeholder="Artistas, músicas e playlists"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
        aria-label="Buscar"
        trailing={
          query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca" className="opacity-60">
              <X size={16} />
            </button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2">
        <SegmentedControl
          className="flex-1"
          value={type}
          onChange={setType}
          segments={[
            { value: 'all', label: 'Tudo' },
            { value: 'track', label: 'Músicas' },
            { value: 'playlist', label: 'Playlists' },
            { value: 'artist', label: 'Artistas' },
          ]}
        />
        <GlassButton
          size="md"
          variant="light"
          active={selectMode}
          onClick={() => {
            setSelectMode((v) => !v);
            setSelected(new Set());
          }}
          aria-label="Selecionar vários"
          aria-pressed={selectMode}
        >
          <CheckSquare size={16} />
        </GlassButton>
      </div>

      {notice && (
        <GlassSurface radius="sm" variant="light">
          <p className="px-4 py-2.5 text-footnote">{notice}</p>
        </GlassSurface>
      )}

      {!hasQuery && (
        <EmptyState
          icon={<Search size={40} />}
          title="Busque no YouTube e na sua biblioteca"
          description="Digite pelo menos duas letras. Os resultados locais aparecem primeiro."
        />
      )}

      {hasQuery && (
        <>
          <section className="space-y-2">
            <h2 className="text-headline">Na biblioteca</h2>
            {loadingLocal ? (
              <p className="py-4 text-footnote text-[color:var(--fg-secondary)]">Buscando…</p>
            ) : (
              <TrackList
                tracks={localTracks}
                emptyMessage="Nada na biblioteca com esse termo"
                onOpenActions={setMenuTrack}
              />
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-headline">No YouTube</h2>
            {error && <p className="text-footnote text-[#ff6961]">{error}</p>}
            {loadingRemote && remoteItems.length === 0 && (
              <p className="py-4 text-footnote text-[color:var(--fg-secondary)]">Consultando o YouTube…</p>
            )}

            {[
              { kind: 'track', items: remoteTracks },
              { kind: 'playlist', items: remotePlaylists },
              { kind: 'artist', items: remoteArtists },
            ]
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <div key={group.kind} className="space-y-1">
                  <h3 className="pt-2 text-footnote uppercase tracking-wide text-[color:var(--fg-tertiary)]">
                    {KIND_LABEL[group.kind]}
                  </h3>
                  <ul className="divide-y divide-[color:var(--separator)]">
                    {group.items.map((item) => (
                      <RemoteItemRow
                        key={`${item.kind}-${item.id}`}
                        item={item}
                        selectable={selectMode && item.kind === 'track'}
                        selected={selected.has(item.id)}
                        onPrimary={() => handleRemotePrimary(item)}
                        onOpenActions={() => setMenuItem(item)}
                      />
                    ))}
                  </ul>
                </div>
              ))}

            {!loadingRemote && !error && remoteItems.length === 0 && (
              <p className="py-4 text-footnote text-[color:var(--fg-secondary)]">
                Nenhum resultado no YouTube
              </p>
            )}
          </section>
        </>
      )}

      {/* Barra de ação da multi-seleção */}
      {selectMode && selected.size > 0 && (
        <div className="sticky bottom-2 z-10 flex justify-center">
          <GlassButton size="md" shape="pill" onClick={() => void sendBatch()} disabled={sending}>
            <ArrowDownToLine size={16} />
            {sending ? 'Enviando…' : `Baixar ${selected.size}`}
          </GlassButton>
        </div>
      )}

      <RemoteActionsMenu
        item={menuItem}
        onClose={() => setMenuItem(null)}
        onOpenRemote={(item) =>
          item.kind === 'playlist' ? onOpenRemotePlaylist(item.id) : onOpenRemoteArtist(item.id)
        }
        onEnqueued={setNotice}
        onPlayLocal={(item) => {
          const local = localTracks.find((t) => t.title === item.title);
          if (local) void playTrack(local, localTracks);
        }}
        onSaveOffline={(item) => {
          const local = localTracks.find((t) => t.title === item.title);
          if (local) void downloadOffline(local);
        }}
      />

      <TrackActionsMenu
        track={menuTrack}
        open={menuTrack !== null}
        onClose={() => setMenuTrack(null)}
        onAddToPlaylist={setPickerTrack}
      />
      <AddToPlaylistSheet track={pickerTrack} onClose={() => setPickerTrack(null)} />
    </div>
  );
};
