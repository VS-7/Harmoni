import React from 'react';
import type { DownloadJob } from '../../../domain/download.ts';

/** Frase de status de um job, usada nas notificações e na página de downloads. */
export function describeJob(job: DownloadJob): string {
  const title = job.title || 'Link do YouTube';
  switch (job.status) {
    case 'queued':
      return `Na fila: ${title}`;
    case 'processing':
      return job.total_items > 1
        ? `Baixando ${title} (${job.done_items}/${job.total_items})`
        : `Baixando ${title}`;
    case 'completed':
      return job.failed_items > 0
        ? `Pronto: ${title} já está na sua biblioteca (${job.failed_items} ${job.failed_items === 1 ? 'faixa falhou' : 'faixas falharam'})`
        : `Pronto: ${title} já está na sua biblioteca`;
    case 'failed':
      return `Falha ao baixar ${title}`;
    case 'canceled':
      return `Download cancelado: ${title}`;
  }
}

/** Só o estado, para a lista de downloads, onde o título já aparece na linha de cima. */
export function describeStatus(job: DownloadJob): string {
  switch (job.status) {
    case 'queued':
      return 'Na fila';
    case 'processing':
      return job.total_items > 1 ? `Baixando ${job.done_items} de ${job.total_items}` : 'Baixando';
    case 'completed':
      return job.failed_items > 0
        ? `Concluído, ${job.failed_items} ${job.failed_items === 1 ? 'faixa falhou' : 'faixas falharam'}`
        : job.total_items > 1
          ? `Concluído, ${job.total_items} faixas`
          : 'Concluído';
    case 'failed':
      return 'Falhou';
    case 'canceled':
      return 'Cancelado';
  }
}

export const JobProgress: React.FC<{ job: DownloadJob }> = ({ job }) => {
  if (job.status !== 'processing' || job.total_items <= 1) return null;
  const percent = Math.round((job.done_items / job.total_items) * 100);
  return (
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
      <div className="h-full rounded-full bg-sp-green transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
};
