import React from 'react';
import { ArrowDown, CircleArrowDown } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import { ConfirmDialog } from '../../../shared/components/Modal.tsx';
import { openDialog } from '../../../shared/store/dialogStore.ts';
import { toast } from '../../../shared/store/toastStore.ts';
import { useOfflineStore } from '../store/offlineStore.ts';

interface DownloadToggleProps {
  /** Identifica o lote, para mostrar o progresso desta tela e não o de outra. */
  batchId: string;
  tracks: Track[];
  label: string;
}

/**
 * O "baixar" circular do Spotify: contorno cinza, anel verde de progresso enquanto baixa
 * e seta verde preenchida quando tudo já está no aparelho.
 */
export const DownloadToggle: React.FC<DownloadToggleProps> = ({ batchId, tracks, label }) => {
  const batch = useOfflineStore((s) => s.batch);
  const offlineIds = useOfflineStore((s) => s.offlineIds);
  const downloadMany = useOfflineStore((s) => s.downloadMany);
  const cancelBatch = useOfflineStore((s) => s.cancelBatch);
  const remove = useOfflineStore((s) => s.remove);

  if (tracks.length === 0) return null;
  const downloaded = tracks.filter((t) => offlineIds.has(t.id));
  const allDone = downloaded.length === tracks.length;
  const running = batch?.id === batchId;
  const busyElsewhere = batch !== null && !running;

  if (running && batch) {
    const ratio = batch.total > 0 ? batch.done / batch.total : 0;
    const circumference = 2 * Math.PI * 13;
    return (
      <button
        type="button"
        onClick={() => {
          cancelBatch();
          toast('Download no aparelho interrompido');
        }}
        aria-label={`Parar download (${batch.done} de ${batch.total})`}
        data-tip={`Baixando ${batch.done}/${batch.total}`}
        className="relative flex h-8 w-8 items-center justify-center text-sp-green"
      >
        <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
          <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" />
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
          />
        </svg>
        <span className="h-2.5 w-2.5 rounded-[1px] bg-current" />
      </button>
    );
  }

  if (allDone) {
    return (
      <button
        type="button"
        aria-label={`Remover ${label} do aparelho`}
        data-tip="Remover do aparelho"
        onClick={() =>
          openDialog((close) => (
            <ConfirmDialog
              title="Remover dos downloads?"
              message={<>As músicas de <b>{label}</b> deixam de tocar sem internet neste aparelho.</>}
              confirmLabel="Remover"
              onClose={close}
              onConfirm={async () => {
                for (const track of tracks) await remove(track.id).catch(() => undefined);
                toast('Removido do aparelho');
              }}
            />
          ))
        }
        className="flex h-8 w-8 items-center justify-center rounded-full bg-sp-green text-black transition-transform hover:scale-[1.04]"
      >
        <ArrowDown size={18} strokeWidth={3} />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busyElsewhere}
      aria-label={`Baixar ${label} no aparelho`}
      data-tip={busyElsewhere ? 'Outro download em andamento' : 'Baixar no aparelho'}
      onClick={() => {
        toast(`Baixando ${tracks.length - downloaded.length} músicas no aparelho`);
        void downloadMany(batchId, tracks);
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full text-sp-subdued transition-[color,transform] hover:scale-[1.04] hover:text-white disabled:opacity-40"
    >
      <CircleArrowDown size={32} strokeWidth={1.5} />
    </button>
  );
};
