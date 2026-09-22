import React, { useEffect, useMemo, useState } from 'react';
import { CircleArrowDown, Shuffle } from 'lucide-react';
import type { Track } from '../../../domain/track.ts';
import type { PlaybackContext } from '../../../domain/player.ts';
import { offlineStorage } from '../../../adapters/storage/offline_store.ts';
import { EntityPage, Dot } from '../../../shared/components/EntityPage.tsx';
import { EmptyPage, LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { PlayButton } from '../../../shared/components/PlayButton.tsx';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { formatBytes, formatLongDuration, pluralize } from '../../../shared/utils/formatters.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useContextPlayback } from '../../player/hooks/useContextPlayback.ts';
import { TrackTable } from '../../library/components/TrackTable.tsx';
import { OfflineCover } from '../../library/components/Covers.tsx';
import { useOfflineStore } from '../store/offlineStore.ts';

const CONTEXT: PlaybackContext = { type: 'offline', id: 'all', name: 'Músicas baixadas' };

/** "Músicas baixadas": o que toca sem internet neste aparelho (RF11.3). */
export const OfflinePage: React.FC = () => {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const offlineCount = useOfflineStore((s) => s.offlineIds.size);
  const usage = useOfflineStore((s) => s.usage);
  const quota = useOfflineStore((s) => s.quota);
  const refresh = useOfflineStore((s) => s.refresh);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const playback = useContextPlayback(CONTEXT, tracks ?? undefined);
  useDocumentTitle('Músicas baixadas');

  useEffect(() => {
    let alive = true;
    void offlineStorage
      .listOfflineTracks()
      .catch(() => [] as Track[])
      .then((list) => {
        if (alive) setTracks(list.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')));
      });
    void refresh();
    return () => {
      alive = false;
    };
    // Recarrega quando uma faixa é baixada ou removida em qualquer tela.
  }, [offlineCount, refresh]);

  const duration = useMemo(() => (tracks ?? []).reduce((sum, t) => sum + t.duration_sec, 0), [tracks]);

  return (
    <EntityPage
      color="#5038a0"
      image={<OfflineCover className="aspect-square w-full" iconSize={72} shadow />}
      kind="Playlist"
      title="Músicas baixadas"
      description="Músicas guardadas neste aparelho: tocam mesmo sem conexão com o servidor."
      meta={
        <>
          <span className="font-bold">Harmoni</span>
          <Dot />
          <span>
            {pluralize(tracks?.length ?? 0, 'música', 'músicas')}
            {duration > 0 && ','}
          </span>
          {duration > 0 && <span className="text-white/70">{formatLongDuration(duration)}</span>}
          {usage > 0 && (
            <>
              <Dot />
              <span className="text-white/70">
                {formatBytes(usage)} usados{quota > 0 ? ` de ${formatBytes(quota)}` : ''}
              </span>
            </>
          )}
        </>
      }
      stickyAction={
        tracks && tracks.length > 0 ? (
          <PlayButton playing={playback.isPlaying} label="Músicas baixadas" onClick={playback.toggle} />
        ) : undefined
      }
      actions={
        tracks && tracks.length > 0 ? (
          <>
            <PlayButton size="lg" playing={playback.isPlaying} label="Músicas baixadas" onClick={playback.toggle} />
            <IconButton label={shuffle ? 'Desativar a ordem aleatória' : 'Ativar a ordem aleatória'} active={shuffle} showDot onClick={toggleShuffle} size="lg">
              <Shuffle size={28} />
            </IconButton>
          </>
        ) : undefined
      }
    >
      {tracks === null ? (
        <LoadingDots />
      ) : tracks.length === 0 ? (
        <EmptyPage
          icon={CircleArrowDown}
          title="Baixe músicas para ouvir offline"
          description='Use o botão de download de uma playlist, álbum ou rádio, ou "Baixar no aparelho" no menu de qualquer música.'
        />
      ) : (
        <TrackTable tracks={tracks} context={CONTEXT} />
      )}
    </EntityPage>
  );
};
