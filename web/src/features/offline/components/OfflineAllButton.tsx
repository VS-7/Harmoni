import React from 'react';
import { ArrowDownToLine, Check, X } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import { GlassButton } from '../../../shared/ui/glass/index.ts';
import { useOfflineStore } from '../store/offlineStore.ts';

interface OfflineAllButtonProps {
  /** Identifica o lote, para que o progresso mostrado seja o desta tela. */
  id: string;
  tracks: Track[];
}

/** "Baixar tudo no aparelho" com progresso n/N (RF11.2). */
export const OfflineAllButton: React.FC<OfflineAllButtonProps> = ({ id, tracks }) => {
  const batch = useOfflineStore((s) => s.batch);
  const offlineIds = useOfflineStore((s) => s.offlineIds);
  const downloadMany = useOfflineStore((s) => s.downloadMany);
  const cancelBatch = useOfflineStore((s) => s.cancelBatch);

  const pending = tracks.filter((track) => !offlineIds.has(track.id));
  const isRunning = batch?.id === id;

  if (tracks.length === 0) return null;

  if (isRunning) {
    return (
      <GlassButton size="md" shape="label" variant="light" onClick={cancelBatch}>
        <X size={16} />
        {batch.done}/{batch.total}
      </GlassButton>
    );
  }

  if (pending.length === 0) {
    return (
      <GlassButton size="md" shape="label" variant="light" disabled aria-label="Tudo no aparelho">
        <Check size={16} /> No aparelho
      </GlassButton>
    );
  }

  return (
    <GlassButton
      size="md"
      shape="label"
      variant="light"
      onClick={() => void downloadMany(id, tracks)}
      disabled={batch !== null}
      aria-label="Baixar tudo no aparelho"
    >
      <ArrowDownToLine size={16} /> Baixar ({pending.length})
    </GlassButton>
  );
};
