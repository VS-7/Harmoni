import React, { useMemo } from 'react';
import { CirclePlus, ListEnd, ListMusic, Loader2, Mic2, MoreHorizontal, Play, RefreshCw, Radio, Shuffle } from 'lucide-react';
import type { StationKind } from '../../../domain/station.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { navigate } from '../../../app/router/router.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { EntityPage, Dot } from '../../../shared/components/EntityPage.tsx';
import { EmptyPage, LoadingDots } from '../../../shared/components/EmptyPage.tsx';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { PlayButton } from '../../../shared/components/PlayButton.tsx';
import { PillButton } from '../../../shared/components/Modal.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { toast } from '../../../shared/store/toastStore.ts';
import { useDominantColor } from '../../../shared/hooks/useDominantColor.ts';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle.ts';
import { fallbackColor } from '../../../shared/utils/color.ts';
import { formatLongDuration, joinNames, pluralize } from '../../../shared/utils/formatters.ts';
import { usePlayerStore } from '../../player/store/playerStore.ts';
import { useContextPlayback } from '../../player/hooks/useContextPlayback.ts';
import { TrackTable } from '../../library/components/TrackTable.tsx';
import { useLibraryStore } from '../../library/store/libraryStore.ts';
import { DownloadToggle } from '../../offline/components/DownloadToggle.tsx';
import { stationContext } from '../stationService.ts';
import { useStation } from '../hooks/useStation.ts';

interface StationPageProps {
  kind: StationKind;
  id: string;
  title?: string;
}

/**
 * Página de uma rádio: banner com uma música sorteada da estação, ações (play, aleatório,
 * mais músicas, baixar no aparelho) e a lista completa.
 */
export const StationPage: React.FC<StationPageProps> = ({ kind, id, title }) => {
  const { station, error, adding, addMore, regenerate } = useStation(kind, id, title);
  const context = useMemo(() => (station ? stationContext(station) : null), [station]);
  const playback = useContextPlayback(context, station?.tracks);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const featured = station?.featured ?? null;
  const color = useDominantColor(featured ? apiClient.getCoverUrl(featured.id) : null, fallbackColor(id));
  useDocumentTitle(station?.title ?? title ?? 'Rádio');

  if (error) {
    return (
      <EmptyPage
        icon={Radio}
        title="Não foi possível montar esta rádio"
        description={error}
        action={<PillButton onClick={regenerate}>Tentar de novo</PillButton>}
      />
    );
  }

  if (!station || !context) {
    return (
      <EntityPage
        color={fallbackColor(id)}
        image={<Cover icon={Radio} className="aspect-square w-full" iconSize={64} shadow />}
        kind="Rádio"
        title={title ?? 'Rádio'}
        meta={<span className="text-white/70">Sintonizando músicas parecidas…</span>}
      >
        <LoadingDots />
      </EntityPage>
    );
  }

  const tracks = station.tracks;
  const duration = tracks.reduce((sum, t) => sum + t.duration_sec, 0);
  const featuredIndex = featured ? tracks.findIndex((t) => t.id === featured.id) : -1;

  async function handleAddMore() {
    try {
      const fresh = await addMore();
      if (fresh.length === 0) {
        toast('Não encontramos mais músicas parecidas agora');
        return;
      }
      // Rádio tocando: as novas entram no fim da fila atual.
      if (playback.isCurrent) usePlayerStore.getState().extendQueue(fresh);
      toast(`${pluralize(fresh.length, 'música adicionada', 'músicas adicionadas')} à rádio`);
    } catch {
      toast('Falha ao buscar mais músicas');
    }
  }

  const openMore = (event: React.MouseEvent) =>
    openMenu(
      event,
      [
        {
          id: 'save',
          label: 'Salvar como playlist',
          icon: ListMusic,
          onSelect: async () => {
            const library = useLibraryStore.getState();
            try {
              const created = await library.createPlaylist({ tracks });
              await library.updatePlaylist(created.id, station.title, `Rádio salva com ${joinNames(station.artistNames)}`);
              toast(`Salva em Sua Biblioteca como "${station.title}"`);
            } catch (err) {
              toast((err as Error).message);
            }
          },
        },
        {
          id: 'queue',
          label: 'Adicionar à fila',
          icon: ListEnd,
          onSelect: () => {
            usePlayerStore.getState().addManyToQueue(tracks);
            toast(`${pluralize(tracks.length, 'música adicionada', 'músicas adicionadas')} à fila`);
          },
        },
        { kind: 'separator', id: 'sep' },
        { id: 'refresh', label: 'Atualizar rádio', icon: RefreshCw, onSelect: regenerate },
        ...(kind === 'artist'
          ? [{ id: 'artist', label: 'Ir para o artista', icon: Mic2, onSelect: () => navigate({ name: 'artist', id }) }]
          : featured?.artist_id
            ? [{ id: 'artist', label: 'Ir para o artista', icon: Mic2, onSelect: () => navigate({ name: 'artist', id: tracks[0].artist_id }) }]
            : []),
      ],
      { header: { title: station.title, subtitle: 'Rádio' } },
    );

  return (
    <EntityPage
      color={color}
      image={
        <div className="relative">
          <Cover
            src={featured ? apiClient.getCoverUrl(featured.id) : null}
            icon={Radio}
            className="aspect-square w-full"
            iconSize={64}
            shadow
            loading="eager"
          />
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-black tracking-[0.12em] backdrop-blur-sm">
            RÁDIO
          </span>
        </div>
      }
      kind="Rádio"
      title={station.title}
      description={station.artistNames.length > 0 ? `Com ${joinNames(station.artistNames)}` : undefined}
      meta={
        <>
          <span className="font-bold">Harmoni</span>
          <Dot />
          <span>{pluralize(tracks.length, 'música', 'músicas')},</span>
          <span className="text-white/70">{formatLongDuration(duration)}</span>
        </>
      }
      extra={
        featured && (
          <button
            type="button"
            onClick={() => void playQueue(tracks, { startIndex: Math.max(0, featuredIndex), context, radio: true, shuffle: false })}
            className="mt-2 flex max-w-full items-center gap-3 self-start rounded-md bg-black/25 p-2 pr-4 text-left transition-colors hover:bg-black/40 sm:max-w-md"
          >
            <span className="relative">
              <Cover src={apiClient.getCoverUrl(featured.id)} className="h-12 w-12" iconSize={18} />
              <span className="absolute inset-0 flex items-center justify-center rounded bg-black/40">
                <Play size={18} fill="currentColor" strokeWidth={0} />
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-white/70">Em destaque nesta rádio</span>
              <span className="block truncate font-bold">{featured.title}</span>
              <span className="block truncate text-sm text-white/70">{featured.artist_name}</span>
            </span>
          </button>
        )
      }
      stickyAction={<PlayButton playing={playback.isPlaying} label={station.title} onClick={playback.toggle} />}
      actions={
        <>
          <PlayButton size="lg" playing={playback.isPlaying} label={station.title} onClick={playback.toggle} />
          <IconButton
            label={shuffle ? 'Desativar a ordem aleatória' : 'Ativar a ordem aleatória'}
            active={shuffle}
            showDot
            size="lg"
            onClick={toggleShuffle}
          >
            <Shuffle size={28} />
          </IconButton>
          <IconButton label="Adicionar mais músicas" size="lg" onClick={() => void handleAddMore()} disabled={adding}>
            {adding ? <Loader2 size={28} className="animate-spin" /> : <CirclePlus size={30} strokeWidth={1.5} />}
          </IconButton>
          <DownloadToggle batchId={`station:${kind}:${id}`} tracks={tracks} label={station.title} />
          <IconButton label={`Mais opções para ${station.title}`} size="lg" onClick={openMore}>
            <MoreHorizontal size={28} />
          </IconButton>
        </>
      }
    >
      <TrackTable tracks={tracks} context={context} radio />
      <div className="flex justify-center px-4 pt-6">
        <PillButton variant="outline" onClick={() => void handleAddMore()} disabled={adding}>
          {adding ? <Loader2 size={16} className="animate-spin" /> : <CirclePlus size={16} />}
          Adicionar mais músicas
        </PillButton>
      </div>
    </EntityPage>
  );
};
