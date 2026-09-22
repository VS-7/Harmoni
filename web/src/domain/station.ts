import type { Track } from './track.ts';

/** Uma estação nasce de um artista ("Rádio X") ou de uma faixa ("Mix", "Rádio da música"). */
export type StationKind = 'artist' | 'track';

export interface Station {
  kind: StationKind;
  /** Id do artista ou da faixa que semeia a estação. */
  seedId: string;
  title: string;
  /** Faixa sorteada para o banner da estação. */
  featured: Track | null;
  tracks: Track[];
  /** Artistas presentes, na ordem em que aparecem, para "Com A, B e C". */
  artistNames: string[];
}
