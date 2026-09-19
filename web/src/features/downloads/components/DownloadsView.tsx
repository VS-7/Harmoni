import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ListMusic,
  Loader2,
  Music,
  RotateCcw,
  Trash2,
  XCircle,
  Link2,
} from 'lucide-react';
import type { DownloadJob, LinkInspection } from '../../../domain/download.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { GlassButton, GlassSurface } from '../../../shared/ui/glass/index.ts';
import { GlassField } from '../../../shared/ui/GlassField.tsx';
import { EmptyState } from '../../../shared/ui/EmptyState.tsx';
import { useDownloadQueue } from '../hooks/useDownloadQueue.ts';

export const DownloadsView: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Preenchido quando um link watch?v=...&list=... precisa da escolha do usuário (RF6.2).
  const [pending, setPending] = useState<LinkInspection | null>(null);

  const { jobs, live, refresh } = useDownloadQueue(25);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const link = url.trim();
    if (!link) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const inspection = await apiClient.inspectLink(link);
      if (inspection.ambiguous) {
        setPending(inspection);
        return;
      }
      await apiClient.submitDownload(link);
      setUrl('');
      await refresh();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resolveAmbiguity(kind: 'track' | 'playlist') {
    if (!pending) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const id = kind === 'track' ? pending.video_id : pending.playlist_id;
      if (!id) throw new Error('Link sem identificador válido');
      await apiClient.submitSource({ provider: 'youtube', kind, id });
      setUrl('');
      setPending(null);
      await refresh();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runAction(action: () => Promise<unknown>) {
    setErrorMsg(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <GlassField
          className="flex-1"
          icon={<Link2 size={16} />}
          placeholder="Cole um link do YouTube"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setPending(null);
          }}
          type="url"
          inputMode="url"
          aria-label="Link do YouTube"
        />
        <GlassButton size="md" shape="label" type="submit" disabled={isSubmitting || !url.trim()}>
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Baixar'}
        </GlassButton>
      </form>

      {/* Link ambíguo: faixa ou playlist inteira? (RF6.2) */}
      {pending && (
        <GlassSurface radius="md" variant="light">
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              {pending.thumbnail_url && (
                <img src={pending.thumbnail_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
              )}
              <div className="min-w-0">
                <p className="truncate text-body">{pending.title || 'Link do YouTube'}</p>
                <p className="truncate text-footnote text-[color:var(--fg-secondary)]">{pending.artist}</p>
              </div>
            </div>
            <p className="text-footnote text-[color:var(--fg-secondary)]">
              Este link está dentro de uma playlist. O que você quer baixar?
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <GlassButton
                size="md"
                shape="label"
                variant="light"
                className="flex-1"
                onClick={() => void resolveAmbiguity('track')}
                disabled={isSubmitting}
              >
                <Music size={15} /> Só esta música
              </GlassButton>
              <GlassButton
                size="md"
                shape="label"
                variant="light"
                className="flex-1"
                onClick={() => void resolveAmbiguity('playlist')}
                disabled={isSubmitting}
              >
                <ListMusic size={15} />
                {pending.item_count > 0 ? `Playlist (${pending.item_count})` : 'Playlist inteira'}
              </GlassButton>
            </div>
          </div>
        </GlassSurface>
      )}

      {errorMsg && (
        <GlassSurface radius="sm" variant="light">
          <p className="flex items-center gap-2 px-4 py-2.5 text-footnote text-[#ff6961]">
            <AlertCircle size={14} /> {errorMsg}
          </p>
        </GlassSurface>
      )}

      <div className="flex items-center justify-between pt-1">
        <h2 className="text-headline">Fila</h2>
        <span className="text-caption uppercase tracking-wide text-[color:var(--fg-tertiary)]">
          {live ? 'tempo real' : 'a cada 3s'}
        </span>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={<Clock size={40} />}
          title="Nenhum download recente"
          description="Cole um link acima ou baixe direto da aba Buscar."
        />
      ) : (
        <ul className="divide-y divide-[color:var(--separator)]">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onAction={runAction} />
          ))}
        </ul>
      )}
    </div>
  );
};

const JobRow: React.FC<{
  job: DownloadJob;
  onAction: (action: () => Promise<unknown>) => Promise<void>;
}> = ({ job, onAction }) => {
  const isActive = job.status === 'queued' || job.status === 'processing';
  const showProgress = job.total_items > 1;
  const percent = job.total_items > 0 ? Math.round((job.done_items / job.total_items) * 100) : 0;

  return (
    <li className="list-row">
      <div className="flex items-center gap-3 py-2.5">
        {job.thumbnail_url ? (
          <img src={job.thumbnail_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--glass-scrim)] opacity-50">
            {job.kind === 'playlist' ? <ListMusic size={18} /> : <Music size={18} />}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-body">{job.title || job.source_url}</p>
          {showProgress && (
            <div className="mt-1.5 space-y-1">
              <div className="h-1 overflow-hidden rounded-full bg-[color:var(--separator)]">
                <div
                  className="h-full bg-[color:var(--fg)] opacity-70 transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-caption text-[color:var(--fg-tertiary)]">
                {job.done_items}/{job.total_items} faixas
                {job.failed_items > 0 && ` · ${job.failed_items} com falha`}
              </p>
            </div>
          )}
          {job.error_message && (
            <p className="truncate text-footnote text-[#ff6961]">{job.error_message}</p>
          )}
        </div>

        <StatusIcon status={job.status} />

        {isActive ? (
          <GlassButton
            size="sm"
            variant="light"
            onClick={() => void onAction(() => apiClient.cancelDownload(job.id))}
            aria-label="Cancelar download"
          >
            <XCircle size={16} />
          </GlassButton>
        ) : (
          <>
            {(job.status === 'failed' || job.status === 'canceled' || job.failed_items > 0) && (
              <GlassButton
                size="sm"
                variant="light"
                onClick={() => void onAction(() => apiClient.retryDownload(job.id))}
                aria-label="Tentar novamente"
              >
                <RotateCcw size={16} />
              </GlassButton>
            )}
            <GlassButton
              size="sm"
              variant="light"
              onClick={() => void onAction(() => apiClient.deleteDownload(job.id))}
              aria-label="Remover do histórico"
            >
              <Trash2 size={16} />
            </GlassButton>
          </>
        )}
      </div>
    </li>
  );
};

/** Estado semântico aparece só como ícone, nunca como preenchimento (RF9.2). */
const StatusIcon: React.FC<{ status: DownloadJob['status'] }> = ({ status }) => {
  const common = 'shrink-0 opacity-70';
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={16} className={common} aria-label="Concluído" />;
    case 'processing':
      return <Loader2 size={16} className={`${common} animate-spin`} aria-label="Baixando" />;
    case 'failed':
      return <AlertCircle size={16} className="shrink-0 text-[#ff6961]" aria-label="Falhou" />;
    case 'canceled':
      return <XCircle size={16} className={common} aria-label="Cancelado" />;
    default:
      return <Clock size={16} className={common} aria-label="Na fila" />;
  }
};
