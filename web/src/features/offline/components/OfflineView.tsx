import React, { useEffect, useState } from 'react';
import { Play, Smartphone, Trash2 } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import { offlineStorage } from '../../../adapters/storage/offline_store.ts';
import { GlassButton, GlassSurface } from '../../../shared/ui/glass/index.ts';
import { EmptyState } from '../../../shared/ui/EmptyState.tsx';
import { formatBytes, formatDuration } from '../../../shared/utils/formatters.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useOfflineStore } from '../store/offlineStore.ts';

/** Aba No Aparelho: faixas gravadas, espaço usado e remoção (RF11.3). */
export const OfflineView: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const usage = useOfflineStore((s) => s.usage);
  const quota = useOfflineStore((s) => s.quota);
  const offlineIds = useOfflineStore((s) => s.offlineIds);
  const refresh = useOfflineStore((s) => s.refresh);
  const remove = useOfflineStore((s) => s.remove);

  const playTrack = usePlayerStore((s) => s.playTrack);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const list = await offlineStorage.listOfflineTracks().catch(() => [] as Track[]);
      setTracks(list);
      await refresh();
      setLoading(false);
    })();
    // offlineIds muda quando uma faixa é baixada ou removida em qualquer tela.
  }, [refresh, offlineIds.size]);

  if (loading) {
    return <p className="py-16 text-center text-body text-[color:var(--fg-secondary)]">Carregando…</p>;
  }

  if (tracks.length === 0) {
    return (
      <EmptyState
        icon={<Smartphone size={40} />}
        title="Nenhuma faixa no aparelho"
        description="Use o menu … de qualquer música e escolha “Baixar no aparelho” para ouvir sem rede."
      />
    );
  }

  return (
    <div className="space-y-4">
      <GlassSurface radius="sm" variant="light">
        <div className="px-4 py-3">
          <p className="text-footnote text-[color:var(--fg-secondary)]">
            {tracks.length} {tracks.length === 1 ? 'faixa' : 'faixas'} · {formatBytes(usage)} usados
            {quota > 0 ? ` de ${formatBytes(quota)}` : ''}
          </p>
          {quota > 0 && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[color:var(--separator)]">
              <div
                className="h-full bg-[color:var(--fg)] opacity-60"
                style={{ width: `${Math.min(100, (usage / quota) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </GlassSurface>

      <ul className="divide-y divide-[color:var(--separator)]">
        {tracks.map((track) => (
          <li key={track.id} className="list-row">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void playTrack(track, tracks)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
              >
                <Play size={14} className="shrink-0 opacity-50" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">{track.title}</span>
                  <span className="block truncate text-footnote text-[color:var(--fg-secondary)]">
                    {track.artist_name}
                  </span>
                </span>
                <span className="shrink-0 text-footnote tabular-nums text-[color:var(--fg-tertiary)]">
                  {formatDuration(track.duration_sec)}
                </span>
              </button>

              <GlassButton
                size="sm"
                variant="light"
                onClick={() => {
                  void remove(track.id);
                  setTracks((current) => current.filter((t) => t.id !== track.id));
                }}
                aria-label={`Remover ${track.title} do aparelho`}
              >
                <Trash2 size={16} />
              </GlassButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
