import React, { useState, useEffect } from 'react';
import { DownloadCloud, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import type { DownloadJob } from '../../../domain/download.ts';
import { apiClient } from '../../../adapters/api/client.ts';

export const DownloadsView: React.FC = () => {
  const [url, setUrl] = useState('');
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadJobs() {
    try {
      const data = await apiClient.listDownloads(25);
      setJobs(data);
    } catch {
      // Ignored if offline
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await apiClient.submitDownload(url.trim());
      setUrl('');
      await loadJobs();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Download Ingestion Form (RF4.1) */}
      <div className="bg-zinc-900/60 border border-zinc-800 p-6 rounded-2xl shadow-lg space-y-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <DownloadCloud className="text-emerald-400" size={20} />
            Aquisição e Download de Mídia
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Cole um link de música ou playlist do YouTube ou YouTube Music. Links de música dentro de uma playlist baixam a playlist inteira. O servidor baixará o áudio em alta qualidade, extrairá a capa e indexará com embeddings vetoriais.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button
            type="submit"
            disabled={isSubmitting || !url.trim()}
            className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Enviando...
              </>
            ) : (
              'Baixar'
            )}
          </button>
        </form>

        {errorMsg && (
          <p className="text-xs text-rose-400 flex items-center gap-1.5 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
            <AlertCircle size={14} />
            {errorMsg}
          </p>
        )}
      </div>

      {/* Download Jobs Queue (RF4.2) */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
          Fila de Processamento (Single-Worker)
        </h3>

        {(!jobs || jobs.length === 0) ? (
          <div className="text-center py-12 text-zinc-500 text-sm bg-zinc-900/30 rounded-xl border border-zinc-800/40">
            Nenhum download registrado recentemente
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50 bg-zinc-900/40 rounded-xl border border-zinc-800 overflow-hidden">
            {(jobs || []).map((job) => {
              let statusBadge = null;
              if (job.Status === 'completed') {
                statusBadge = (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
                    <CheckCircle2 size={12} /> Concluído
                  </span>
                );
              } else if (job.Status === 'processing') {
                statusBadge = (
                  <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium animate-pulse">
                    <Loader2 size={12} className="animate-spin" /> Baixando...
                  </span>
                );
              } else if (job.Status === 'failed') {
                statusBadge = (
                  <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full font-medium">
                    <AlertCircle size={12} /> Falhou
                  </span>
                );
              } else {
                statusBadge = (
                  <span className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full font-medium">
                    <Clock size={12} /> Na Fila
                  </span>
                );
              }

              return (
                <div key={job.ID} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{job.SourceURL}</p>
                    {job.ErrorMessage && (
                      <p className="text-xs text-rose-400 truncate mt-0.5">{job.ErrorMessage}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">{statusBadge}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
