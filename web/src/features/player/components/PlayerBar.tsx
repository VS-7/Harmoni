import React from 'react';
import {
  CircleArrowDown,
  CirclePlus,
  ListMusic,
  MonitorPlay,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { useLayoutStore } from '../../../app/layout/layoutStore.ts';
import { Cover } from '../../../shared/components/Cover.tsx';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { Slider } from '../../../shared/components/Slider.tsx';
import { openMenu } from '../../../shared/store/menuStore.ts';
import { usePlayerStore } from '../store/playerStore.ts';
import { trackMenu } from '../../library/menus.tsx';
import { ProgressBar, TransportButtons } from './PlaybackControls.tsx';

const VolumeControl: React.FC = () => {
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  const level = isMuted ? 0 : volume;
  const Icon = level === 0 ? VolumeX : level < 0.34 ? Volume : level < 0.67 ? Volume1 : Volume2;

  return (
    <div className="flex items-center gap-1">
      <IconButton label={isMuted || volume === 0 ? 'Com som' : 'Sem som'} onClick={toggleMute}>
        <Icon size={16} />
      </IconButton>
      <Slider
        value={level}
        max={1}
        step={0.1}
        label="Volume"
        valueText={`${Math.round(level * 100)}%`}
        onChange={setVolume}
        onCommit={setVolume}
        className="w-[93px]"
      />
    </div>
  );
};

/** O player fixo na base da janela, em três colunas como o do Spotify. */
export const PlayerBar: React.FC = () => {
  const track = usePlayerStore((s) => s.currentTrack);
  const isPlayingOffline = usePlayerStore((s) => s.isPlayingOffline);
  const rightPanel = useLayoutStore((s) => s.rightPanel);
  const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);

  return (
    <footer className="grid h-[var(--player-h)] grid-cols-[minmax(180px,30%)_minmax(0,40%)_minmax(180px,30%)] items-center px-2">
      <div className="flex min-w-0 items-center gap-3">
        {track && (
          <>
            <button
              type="button"
              onClick={() => toggleRightPanel('now-playing')}
              aria-label="Abrir Tocando agora"
              className="shrink-0"
            >
              <Cover src={apiClient.getCoverUrl(track.id)} className="h-14 w-14" iconSize={20} />
            </button>
            <div className="min-w-0">
              {track.album_id ? (
                <Link to={{ name: 'album', id: track.album_id }} className="block truncate text-sm text-white hover:underline">
                  {track.title}
                </Link>
              ) : (
                <span className="block truncate text-sm text-white">{track.title}</span>
              )}
              <div className="flex min-w-0 items-center gap-1 text-xs text-sp-subdued">
                {isPlayingOffline && (
                  <CircleArrowDown size={12} className="shrink-0 fill-sp-green text-black" aria-label="Tocando do aparelho" />
                )}
                <Link to={{ name: 'artist', id: track.artist_id }} className="truncate hover:text-white hover:underline">
                  {track.artist_name}
                </Link>
              </div>
            </div>
            <IconButton
              label="Adicionar à playlist"
              onClick={(event) =>
                openMenu(event, trackMenu([track]), {
                  header: { title: track.title, subtitle: track.artist_name, imageUrl: apiClient.getCoverUrl(track.id) },
                })
              }
              className="ml-1"
            >
              <CirclePlus size={16} />
            </IconButton>
          </>
        )}
      </div>

      <div className="flex max-w-[722px] flex-col items-center gap-1 justify-self-center w-full">
        <TransportButtons />
        <ProgressBar />
      </div>

      <div className="flex items-center justify-end gap-1 pr-2">
        <IconButton
          label="Tocando agora"
          active={rightPanel === 'now-playing'}
          onClick={() => toggleRightPanel('now-playing')}
          disabled={!track}
        >
          <MonitorPlay size={16} />
        </IconButton>
        <IconButton label="Fila" active={rightPanel === 'queue'} onClick={() => toggleRightPanel('queue')}>
          <ListMusic size={16} />
        </IconButton>
        <VolumeControl />
      </div>
    </footer>
  );
};
