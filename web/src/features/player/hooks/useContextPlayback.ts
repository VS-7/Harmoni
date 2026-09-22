import { useCallback } from 'react';
import type { PlaybackContext } from '../../../domain/player.ts';
import type { Track } from '../../../domain/track.ts';
import { usePlayerStore } from '../store/playerStore.ts';
import { toggleContext } from '../contextLoader.ts';

/** Estado do botão verde de uma página ou card: está tocando este contexto? */
export function useContextPlayback(context: PlaybackContext | null, tracks?: Track[]) {
  const isCurrent = usePlayerStore(
    (s) => context !== null && s.context?.type === context.type && s.context.id === context.id && s.currentTrack !== null,
  );
  const isPlaying = usePlayerStore((s) => isCurrent && (s.status === 'playing' || s.status === 'loading'));

  const toggle = useCallback(() => {
    if (!context) return;
    void toggleContext(context, tracks);
  }, [context, tracks]);

  return { isCurrent, isPlaying, toggle };
}
