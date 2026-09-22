import type { Station, StationKind } from '../../domain/station.ts';
import type { Track } from '../../domain/track.ts';
import type { PlaybackContext } from '../../domain/player.ts';
import type { Route } from '../../app/router/routes.ts';
import { apiClient } from '../../adapters/api/client.ts';
import { pickRandom, shuffled } from '../../shared/utils/random.ts';

/** Tamanho inicial de uma estação; "Adicionar mais músicas" traz lotes menores. */
const STATION_SIZE = 40;
const EXTEND_SIZE = 20;
/** Quantas faixas do próprio artista entram na rádio dele, espalhadas pela lista. */
const ARTIST_OWN_TRACKS = 5;
/** Limite de ids enviados para evitar repetição: mantém a URL da requisição curta. */
const MAX_EXCLUDED_IDS = 80;

const cache = new Map<string, Station>();

export const stationKey = (kind: StationKind, id: string) => `${kind}:${id}`;

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function artistsOf(tracks: Track[]): string[] {
  return [...new Set(tracks.map((t) => t.artist_name).filter(Boolean))];
}

/** Espalha as faixas do artista entre as recomendações (a cada `every` posições). */
function interleave(base: Track[], extras: Track[], every = 4): Track[] {
  const result: Track[] = [];
  let e = 0;
  base.forEach((track, index) => {
    result.push(track);
    if ((index + 1) % every === 0 && e < extras.length) result.push(extras[e++]);
  });
  return [...result, ...extras.slice(e)];
}

/**
 * Monta a estação: a rádio de um artista parte de uma faixa sorteada dele (e mistura
 * outras dele, que o ranking penaliza); a de uma faixa parte dela mesma.
 */
export async function loadStation(kind: StationKind, id: string, title?: string): Promise<Station> {
  const key = stationKey(kind, id);
  const cached = cache.get(key);
  if (cached) return title && cached.title !== title ? { ...cached, title } : cached;

  let seed: Track;
  let tracks: Track[];
  let stationTitle: string;

  if (kind === 'artist') {
    const { artist, tracks: own } = await apiClient.getArtist(id);
    const picked = pickRandom(own);
    if (!picked) throw new Error('Este artista ainda não tem músicas na biblioteca');
    seed = picked;
    const radio = await apiClient.getRadio(seed.id, STATION_SIZE, [], [seed.id]).catch(() => [] as Track[]);
    const extras = shuffled(own.filter((t) => t.id !== seed.id)).slice(0, ARTIST_OWN_TRACKS);
    tracks = dedupe([seed, ...interleave(radio, extras)]);
    stationTitle = title ?? `Rádio ${artist.name}`;
  } else {
    seed = await apiClient.getTrack(id);
    const radio = await apiClient.getRadio(seed.id, STATION_SIZE, [], [seed.id]).catch(() => [] as Track[]);
    tracks = dedupe([seed, ...radio]);
    stationTitle = title ?? `Rádio de ${seed.title}`;
  }

  const station: Station = {
    kind,
    seedId: id,
    title: stationTitle,
    featured: pickRandom(tracks) ?? seed,
    tracks,
    artistNames: artistsOf(tracks),
  };
  cache.set(key, station);
  return station;
}

/** "Atualizar rádio": descarta a estação guardada para sortear outra semente e outra lista. */
export function forgetStation(kind: StationKind, id: string): void {
  cache.delete(stationKey(kind, id));
}

/** "Adicionar mais músicas": pede faixas parecidas que ainda não estão na estação. */
export async function extendStation(kind: StationKind, id: string): Promise<Track[]> {
  const station = cache.get(stationKey(kind, id)) ?? (await loadStation(kind, id));
  // Uma semente diferente a cada lote traz variedade em vez de repetir a mesma vizinhança.
  const seed = pickRandom(station.tracks.slice(-10)) ?? station.tracks[0];
  if (!seed) return [];

  const recentArtists = station.tracks.slice(-5).map((t) => t.artist_id);
  const excluded = station.tracks.slice(-MAX_EXCLUDED_IDS).map((t) => t.id);
  const more = await apiClient.getRadio(seed.id, EXTEND_SIZE, recentArtists, excluded);

  const known = new Set(station.tracks.map((t) => t.id));
  const fresh = more.filter((t) => !known.has(t.id));
  const updated: Station = {
    ...station,
    tracks: [...station.tracks, ...fresh],
    artistNames: artistsOf([...station.tracks, ...fresh]),
  };
  cache.set(stationKey(kind, id), updated);
  return fresh;
}

export function stationContext(station: Pick<Station, 'kind' | 'seedId' | 'title'>): PlaybackContext {
  return { type: 'station', id: stationKey(station.kind, station.seedId), name: station.title };
}

/** Rota de volta para a estação a partir do id do contexto ("artist:<id>"). */
export function stationRouteFromContextId(contextId: string, title?: string): Route | null {
  const separator = contextId.indexOf(':');
  const kind = contextId.slice(0, separator);
  const id = contextId.slice(separator + 1);
  if ((kind !== 'artist' && kind !== 'track') || !id) return null;
  return { name: 'station', kind, id, title };
}
