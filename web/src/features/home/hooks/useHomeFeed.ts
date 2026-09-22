import { useEffect, useMemo, useState } from 'react';
import type { Track } from '../../../domain/track.ts';
import type { Artist } from '../../../domain/album.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { dailySeed, seededRandom, shuffled } from '../../../shared/utils/random.ts';
import { useLibraryStore } from '../../library/store/libraryStore.ts';
import { useRecentsStore } from '../../player/store/recentsStore.ts';

export interface StationSuggestion {
  kind: 'artist';
  artist: Artist;
  title: string;
}

export interface MixSuggestion {
  kind: 'track';
  seed: Track;
  number: number;
  title: string;
  subtitle: string;
}

const SAMPLE_SIZE = 300;
const MAX_STATIONS = 12;
const MAX_MIXES = 6;

let sampleCache: Track[] | null = null;

/** Amostra da biblioteca para as sementes dos mixes, buscada uma vez por sessão. */
export async function loadSample(): Promise<Track[]> {
  if (sampleCache) return sampleCache;
  const first = await apiClient.listTracks(0, SAMPLE_SIZE);
  let tracks = first.data;
  // Bibliotecas grandes: sorteia uma janela do dia em vez de sempre as primeiras em ordem alfabética.
  if (first.total > SAMPLE_SIZE) {
    const random = seededRandom(dailySeed('sample'));
    const offset = Math.floor(random() * Math.max(0, first.total - SAMPLE_SIZE));
    tracks = (await apiClient.listTracks(offset, SAMPLE_SIZE).catch(() => first)).data;
  }
  sampleCache = tracks;
  return tracks;
}

/**
 * Recomendações geradas no cliente a partir da biblioteca: rádios de artistas e "Mix Diário"
 * semeados por faixas de artistas diferentes. A semente muda uma vez por dia, como no Spotify.
 */
export function useHomeFeed() {
  const playlists = useLibraryStore((s) => s.playlists);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const loaded = useLibraryStore((s) => s.loaded);
  const recents = useRecentsStore((s) => s.items);
  const [sample, setSample] = useState<Track[]>(sampleCache ?? []);

  useEffect(() => {
    let alive = true;
    void loadSample()
      .then((tracks) => alive && setSample(tracks))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const stations = useMemo<StationSuggestion[]>(() => {
    const withTracks = new Set(sample.map((t) => t.artist_id));
    // Artistas vistos na amostra primeiro: certamente têm faixas para semear a rádio.
    const pool = [...artists].sort((a, b) => Number(withTracks.has(b.id)) - Number(withTracks.has(a.id)));
    const random = seededRandom(dailySeed('stations'));
    const preferred = shuffled(pool.filter((a) => withTracks.has(a.id)), random);
    const others = shuffled(pool.filter((a) => !withTracks.has(a.id)), random);
    return [...preferred, ...others]
      .slice(0, MAX_STATIONS)
      .map((artist) => ({ kind: 'artist', artist, title: `Rádio ${artist.name}` }));
  }, [artists, sample]);

  const mixes = useMemo<MixSuggestion[]>(() => {
    const random = seededRandom(dailySeed('mixes'));
    const seen = new Set<string>();
    const seeds: Track[] = [];
    for (const track of shuffled(sample, random)) {
      if (seen.has(track.artist_id)) continue;
      seen.add(track.artist_id);
      seeds.push(track);
      if (seeds.length === MAX_MIXES) break;
    }
    return seeds.map((seed, i) => ({
      kind: 'track',
      seed,
      number: i + 1,
      title: `Mix Diário ${i + 1}`,
      subtitle: `${seed.artist_name} e músicas parecidas`,
    }));
  }, [sample]);

  const recentPlaylists = useMemo(
    () => [...playlists].sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? '')),
    [playlists],
  );

  return { loaded, stations, mixes, recents, artists, albums, playlists: recentPlaylists };
}
