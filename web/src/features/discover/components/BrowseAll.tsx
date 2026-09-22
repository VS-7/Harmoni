import React, { useEffect, useMemo, useState } from 'react';
import type { Track } from '../../../domain/track.ts';
import type { Route } from '../../../app/router/routes.ts';
import { apiClient } from '../../../adapters/api/client.ts';
import { Link } from '../../../app/router/Link.tsx';
import { paletteColor } from '../../../shared/utils/color.ts';
import { loadSample } from '../../home/hooks/useHomeFeed.ts';

interface Category {
  key: string;
  title: string;
  color: string;
  to: Route;
  imageUrl?: string;
  gradient?: string;
}

const MAX_GENRES = 16;

const CategoryCard: React.FC<{ category: Category }> = ({ category }) => (
  <Link
    to={category.to}
    className="relative block aspect-[4/3] overflow-hidden rounded-lg p-4 transition-transform hover:scale-[1.01] max-sm:aspect-[16/9]"
    style={{ backgroundColor: category.color, backgroundImage: category.gradient }}
  >
    <span className="relative z-10 line-clamp-2 break-words text-2xl font-bold leading-tight max-sm:text-lg">{category.title}</span>
    {category.imageUrl && (
      <img
        src={category.imageUrl}
        alt=""
        loading="lazy"
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
        className="absolute -bottom-[6%] -right-[8%] aspect-square w-[46%] rotate-[25deg] rounded shadow-[0_2px_4px_rgba(0,0,0,0.2)]"
      />
    )}
  </Link>
);

/** "Navegar por tudo": atalhos fixos e um card por gênero presente na biblioteca. */
export const BrowseAll: React.FC = () => {
  const [sample, setSample] = useState<Track[]>([]);

  useEffect(() => {
    let alive = true;
    void loadSample()
      .then((tracks) => alive && setSample(tracks))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const categories = useMemo<Category[]>(() => {
    const byGenre = new Map<string, Track[]>();
    for (const track of sample) {
      const genre = track.genre?.trim();
      if (!genre) continue;
      const list = byGenre.get(genre) ?? [];
      list.push(track);
      byGenre.set(genre, list);
    }
    const genres = [...byGenre.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_GENRES)
      .map(([genre, tracks]) => ({
        key: `genre:${genre}`,
        title: genre,
        color: paletteColor(genre),
        to: { name: 'search', query: genre } as Route,
        imageUrl: apiClient.getCoverUrl(tracks[0].id),
      }));

    return [
      {
        key: 'mixes',
        title: 'Feito para você',
        color: '#1e3264',
        to: { name: 'section', key: 'mixes' },
        imageUrl: sample[0] ? apiClient.getCoverUrl(sample[0].id) : undefined,
      },
      {
        key: 'stations',
        title: 'Rádios',
        color: '#8d67ab',
        to: { name: 'section', key: 'stations' },
        imageUrl: sample[1] ? apiClient.getCoverUrl(sample[1].id) : undefined,
      },
      {
        key: 'offline',
        title: 'Músicas baixadas',
        color: '#450af5',
        gradient: 'linear-gradient(135deg,#450af5,#8e8ee5)',
        to: { name: 'offline' },
      },
      { key: 'downloads', title: 'Downloads do YouTube', color: '#056952', to: { name: 'downloads' } },
      ...genres,
    ];
  }, [sample]);

  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">Navegar por tudo</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-6">
        {categories.map((category) => (
          <CategoryCard key={category.key} category={category} />
        ))}
      </div>
    </section>
  );
};
