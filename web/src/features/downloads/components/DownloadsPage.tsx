import React, { useState } from 'react';
import { CircleAlert, Clock3, Download, Link2, ListMusic, Loader2, Music, RotateCcw, Trash2, X } from 'lucide-react';
import type { DownloadJob, LinkInspection } from '../../../domain/download.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { Cover } from '../../../shared/components/Cover.tsx';
import { EmptyPage } from '../../../shared/components/EmptyPage.tsx';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { PillButton } from '../../../shared/components/Modal.tsx';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { formatRelativeTime } from '../../../shared/utils/formatters.ts';
import { useDownloadQueue } from '../hooks/useDownloadQueue.ts';
import { JobProgress, describeStatus } from './JobStatus.tsx';

/** Fila de downloads do servidor: colar link do YouTube e acompanhar em tempo real (RF6, RF8). */
export const DownloadsPage: React.FC = () => {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preenchido quando um link watch?v=...&list=... precisa da escolha do usuário (RF6.2).
  const [pending, setPending] = useState<LinkInspection | null>(null);
  const { jobs, live, refresh } = useDownloadQueue(30);
  useDocumentTitle('Downloads');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const link = url.trim();
    if (!link) return;
    setSubmitting(true);
    setError(null);
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
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function resolveAmbiguity(kind: 'track' | 'playlist') {
    if (!pending) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = kind === 'track' ? pending.video_id : pending.playlist_id;
      if (!id) throw new Error('Link sem identificador válido');
      await apiClient.submitSource({ provider: 'youtube', kind, id });
      setUrl('');
      setPending(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="px-4 pb-10 pt-6 md:px-6">
      <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.04em]">Downloads</h1>
      <p className="mt-1 text-sm text-sp-subdued">
        Cole um link do YouTube para baixar para o servidor. Para achar músicas, use a{' '}
        <Link to={{ name: 'search', query: '' }} className="font-bold text-white hover:underline">
          busca
        </Link>
        .
      </p>

      <form onSubmit={(e) => void submit(e)} className="mt-6 flex max-w-2xl gap-2 max-sm:flex-col">
        <label className="flex h-12 flex-1 items-center gap-3 rounded-full bg-sp-elevated px-4 ring-white transition-colors hover:bg-sp-highlight focus-within:ring-2">
          <Link2 size={20} className="shrink-0 text-sp-subdued" />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setPending(null);
            }}
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            aria-label="Link do YouTube"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </label>
        <PillButton type="submit" variant="green" disabled={submitting || !url.trim()}>
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          Baixar
        </PillButton>
      </form>

      {pending && (
        <div className="mt-4 max-w-2xl rounded-lg bg-sp-elevated p-4">
          <div className="flex items-center gap-3">
            <Cover src={pending.thumbnail_url || null} className="h-14 w-14" />
            <div className="min-w-0">
              <p className="truncate font-bold">{pending.title || 'Link do YouTube'}</p>
              <p className="truncate text-sm text-sp-subdued">{pending.artist}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-sp-subdued">Este link está dentro de uma playlist. O que você quer baixar?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PillButton variant="outline" onClick={() => void resolveAmbiguity('track')} disabled={submitting}>
              <Music size={16} /> Só esta música
            </PillButton>
            <PillButton variant="outline" onClick={() => void resolveAmbiguity('playlist')} disabled={submitting}>
              <ListMusic size={16} />
              {pending.item_count > 0 ? `Playlist inteira (${pending.item_count})` : 'Playlist inteira'}
            </PillButton>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 flex max-w-2xl items-center gap-2 rounded bg-[#e91429] px-3 py-2 text-sm font-medium">
          <CircleAlert size={16} /> {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between border-b border-white/10 pb-2">
        <h2 className="text-2xl font-bold">Fila</h2>
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sp-subdued">
          <span className={`h-2 w-2 rounded-full ${live ? 'bg-sp-green' : 'bg-sp-muted'}`} />
          {live ? 'Ao vivo' : 'Atualiza a cada 3 s'}
        </span>
      </div>

      {jobs.length === 0 ? (
        <EmptyPage icon={Clock3} title="Nenhum download recente" description="Cole um link acima ou baixe direto da busca." />
      ) : (
        <ul className="mt-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onAction={run} />
          ))}
        </ul>
      )}
    </div>
  );
};

const JobRow: React.FC<{ job: DownloadJob; onAction: (action: () => Promise<unknown>) => Promise<void> }> = ({ job, onAction }) => {
  const active = job.status === 'queued' || job.status === 'processing';
  const canRetry = job.status === 'failed' || job.status === 'canceled' || job.failed_items > 0;

  return (
    <li className="lazy-row group flex items-center gap-3 rounded-md p-2 hover:bg-white/10">
      <Cover
        src={job.thumbnail_url || null}
        icon={job.kind === 'playlist' ? ListMusic : Music}
        className="h-12 w-12"
        iconSize={18}
      />
      <div className="min-w-0 flex-1">
        {job.status === 'completed' && job.playlist_id ? (
          <Link to={{ name: 'playlist', id: job.playlist_id }} className="block truncate hover:underline">
            {job.title || job.source_url}
          </Link>
        ) : (
          <p className="truncate">{job.title || job.source_url}</p>
        )}
        <p className={`truncate text-sm ${job.status === 'failed' ? 'text-sp-negative' : 'text-sp-subdued'}`}>
          {job.error_message || describeStatus(job)} · {formatRelativeTime(job.updated_at)}
        </p>
        <JobProgress job={job} />
      </div>
      {job.status === 'processing' && <Loader2 size={16} className="shrink-0 animate-spin text-sp-green" aria-label="Baixando" />}
      {active ? (
        <IconButton label="Cancelar download" onClick={() => void onAction(() => apiClient.cancelDownload(job.id))}>
          <X size={18} />
        </IconButton>
      ) : (
        <>
          {canRetry && (
            <IconButton label="Tentar novamente" onClick={() => void onAction(() => apiClient.retryDownload(job.id))}>
              <RotateCcw size={16} />
            </IconButton>
          )}
          <IconButton label="Remover do histórico" onClick={() => void onAction(() => apiClient.deleteDownload(job.id))}>
            <Trash2 size={16} />
          </IconButton>
        </>
      )}
    </li>
  );
};
