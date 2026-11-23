import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar.tsx';
import Footer from '../components/Footer.tsx';
import MangaCard from '../components/MangaCard.tsx';
import { mangaApi } from '../services/api.ts';
import type { MangaListItem, MetaOption } from '../types/manga.ts';

export default function Genres() {
  const { category = 'all' } = useParams();
  const navigate = useNavigate();

  const [genres, setGenres] = useState<MetaOption[]>([]);
  const [mangaList, setMangaList] = useState<MangaListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    mangaApi
      .getList({ page: 1, type: 'topview', state: 'all', category })
      .then(({ data }) => {
        if (!active) return;
        setGenres(data.metaData?.category || []);
        setMangaList(data.mangaList || []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category]);

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f7] text-zinc-900 dark:bg-[#111114] dark:text-zinc-100 amoled:bg-black amoled:text-zinc-50 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="space-y-2 border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 pb-4">
          <h1 className="font-display text-3xl font-bold text-zinc-950 dark:text-zinc-50">
            Browse by Genre
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Explore top manga series filtered by genre or theme.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {genres.map((g) => {
            const active = category.toLowerCase() === g.id.toLowerCase();
            return (
              <button
                key={g.id}
                type="button"
                onClick={() =>
                  navigate(
                    g.id === 'all' ? '/genres' : `/genres/${encodeURIComponent(g.id)}`
                  )
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-zinc-950 text-white border-zinc-950 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-100'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-950 dark:bg-[#18181b] dark:text-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-500 amoled:bg-black amoled:border-zinc-900 amoled:hover:border-zinc-600'
                }`}
              >
                {g.id === 'all' ? 'All Genres' : g.type}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[3/4] bg-zinc-200 dark:bg-zinc-800 amoled:bg-zinc-900" />
                <div className="p-3.5 space-y-2">
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 amoled:bg-zinc-900 rounded w-3/4" />
                  <div className="h-3 bg-zinc-100 dark:bg-zinc-800/60 amoled:bg-zinc-900/70 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {mangaList.map((manga) => (
              <MangaCard key={manga.id} manga={manga} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
