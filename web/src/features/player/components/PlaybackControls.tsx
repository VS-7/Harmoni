import React from 'react';
import { Loader2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore.ts';
import { IconButton } from '../../../shared/components/IconButton.tsx';
import { Slider } from '../../../shared/components/Slider.tsx';
import { formatDuration } from '../../../shared/utils/formatters.ts';

/** Aleatório, anterior, play/pause, próxima e repetir, no tamanho do player de baixo ou da tela cheia. */
export const TransportButtons: React.FC<{ size?: 'bar' | 'full' }> = ({ size = 'bar' }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const status = usePlayerStore((s) => s.status);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);

  const disabled = !currentTrack;
  const isPlaying = status === 'playing';
  const full = size === 'full';
  const icon = full ? 28 : 16;

  return (
    <div className={`flex items-center ${full ? 'w-full justify-between' : 'gap-2'}`}>
      <IconButton
        label={shuffle ? 'Desativar a ordem aleatória' : 'Ativar a ordem aleatória'}
        active={shuffle}
        showDot
        disabled={disabled}
        onClick={toggleShuffle}
        size={full ? 'lg' : 'sm'}
      >
        <Shuffle size={full ? 24 : 16} />
      </IconButton>
      <IconButton label="Voltar" disabled={disabled} onClick={() => void previous()} size={full ? 'lg' : 'sm'} className={full ? 'text-white' : ''}>
        <SkipBack size={icon} fill="currentColor" />
      </IconButton>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void togglePlay()}
        aria-label={isPlaying ? 'Pausar' : 'Tocar'}
        data-tip={full ? undefined : isPlaying ? 'Pausar' : 'Tocar'}
        className={[
          'flex shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform duration-100',
          'hover:scale-[1.06] active:scale-100 disabled:pointer-events-none disabled:opacity-40',
          full ? 'mx-2 h-16 w-16' : 'mx-2 h-8 w-8',
        ].join(' ')}
      >
        {status === 'loading' ? (
          <Loader2 size={full ? 28 : 16} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={full ? 28 : 16} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={full ? 28 : 16} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />
        )}
      </button>
      <IconButton label="Avançar" disabled={disabled} onClick={() => void next()} size={full ? 'lg' : 'sm'} className={full ? 'text-white' : ''}>
        <SkipForward size={icon} fill="currentColor" />
      </IconButton>
      <IconButton
        label={repeat === 'off' ? 'Ativar repetição' : repeat === 'all' ? 'Repetir a faixa' : 'Desativar repetição'}
        active={repeat !== 'off'}
        showDot
        disabled={disabled}
        onClick={cycleRepeat}
        size={full ? 'lg' : 'sm'}
      >
        {repeat === 'one' ? <Repeat1 size={full ? 24 : 16} /> : <Repeat size={full ? 24 : 16} />}
      </IconButton>
    </div>
  );
};

/** Barra de progresso com o tempo decorrido e a duração. */
export const ProgressBar: React.FC<{ layout?: 'inline' | 'stacked' }> = ({ layout = 'inline' }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const seek = usePlayerStore((s) => s.seek);

  const total = duration || currentTrack?.duration_sec || 0;
  const elapsed = Math.min(currentTime, total);

  const slider = (
    <Slider
      value={elapsed}
      max={total || 1}
      step={5}
      label="Mudar posição da faixa"
      valueText={`${formatDuration(elapsed)} de ${formatDuration(total)}`}
      disabled={!currentTrack}
      onCommit={seek}
      className="flex-1"
    />
  );

  if (layout === 'stacked') {
    return (
      <div className="w-full">
        {slider}
        <div className="mt-1 flex justify-between text-xs tabular-nums text-white/70">
          <span>{formatDuration(elapsed)}</span>
          <span>{formatDuration(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 text-xs tabular-nums text-sp-subdued">
      <span className="w-10 text-right">{currentTrack ? formatDuration(elapsed) : '-:--'}</span>
      {slider}
      <span className="w-10">{currentTrack ? formatDuration(total) : '-:--'}</span>
    </div>
  );
};
