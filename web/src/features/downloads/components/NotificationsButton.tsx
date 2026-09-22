import React, { useEffect, useRef, useState } from 'react';
import { Bell, Download } from 'lucide-react';
import type { DownloadJob } from '../../../domain/download.ts';
import { Link } from '../../../app/router/Link.tsx';
import { navigate } from '../../../app/router/router.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { formatRelativeTime } from '../../../shared/utils/formatters.ts';
import { useIsMobile } from '../../../shared/hooks/useMediaQuery.ts';
import { useDownloadsStore } from '../store/downloadsStore.ts';
import { JobProgress, describeJob } from './JobStatus.tsx';

const NotificationRow: React.FC<{ job: DownloadJob; unread: boolean; onPick: () => void }> = ({ job, unread, onPick }) => (
  <button
    type="button"
    onClick={() => {
      onPick();
      navigate(job.status === 'completed' && job.playlist_id ? { name: 'playlist', id: job.playlist_id } : { name: 'downloads' });
    }}
    className="flex w-full items-start gap-3 rounded-md p-2 text-left hover:bg-white/10"
  >
    <Cover src={job.thumbnail_url || null} icon={Download} className="h-12 w-12" iconSize={18} />
    <span className="min-w-0 flex-1">
      <span className={`line-clamp-2 text-sm ${job.status === 'failed' ? 'text-sp-negative' : 'text-white'}`}>{describeJob(job)}</span>
      <span className="mt-0.5 block text-xs text-sp-subdued">{formatRelativeTime(job.updated_at)}</span>
      <JobProgress job={job} />
    </span>
    {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#3d91f4]" aria-label="Nova" />}
  </button>
);

/** O sino "Novidades" da barra superior: acompanha a fila de downloads do servidor. */
export const NotificationsButton: React.FC = () => {
  const jobs = useDownloadsStore((s) => s.jobs);
  const seenAt = useDownloadsStore((s) => s.seenAt);
  const markSeen = useDownloadsStore((s) => s.markSeen);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(seenAt);
  const rootRef = useRef<HTMLDivElement>(null);

  const unread = jobs.filter((job) => Date.parse(job.updated_at) > seenAt).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (isMobile) {
      markSeen();
      navigate({ name: 'downloads' });
      return;
    }
    if (!open) {
      // Guarda o "visto até" anterior para marcar as novas enquanto o painel está aberto.
      setLastSeen(seenAt);
      markSeen();
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Novidades (${unread})` : 'Novidades'}
        aria-expanded={open}
        data-tip={open ? undefined : 'Novidades'}
        data-tip-pos="bottom"
        className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors ${open ? 'text-white' : 'text-sp-subdued hover:text-white'}`}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-black bg-[#3d91f4]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[400px] max-w-[calc(100vw-16px)] animate-sp-pop rounded-lg bg-sp-menu p-2 shadow-[0_16px_24px_rgba(0,0,0,0.3),0_6px_8px_rgba(0,0,0,0.2)]">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <h2 className="text-xl font-bold">Novidades</h2>
            <Link to={{ name: 'downloads' }} onClick={() => setOpen(false)} className="text-sm font-bold text-sp-subdued hover:text-white hover:underline">
              Ver downloads
            </Link>
          </div>
          <div className="max-h-[min(480px,70dvh)] overflow-y-auto">
            {jobs.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-sp-subdued">
                Nada por aqui ainda. Downloads do YouTube aparecem aqui quando entram na fila e quando terminam.
              </p>
            ) : (
              jobs.slice(0, 20).map((job) => (
                <NotificationRow
                  key={job.id}
                  job={job}
                  unread={Date.parse(job.updated_at) > lastSeen}
                  onPick={() => setOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
