import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar.tsx';
import Footer from '../components/Footer.tsx';
import MangaCard from '../components/MangaCard.tsx';
import SearchBar from '../components/SearchBar.tsx';
import { mangaApi } from '../services/api.ts';
import type { MangaListItem, MangaListMetaData } from '../types/manga.ts';

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const type = searchParams.get('type') || 'latest';
  const state = searchParams.get('state') || 'all';
  const category = searchParams.get('category') || 'all';

  const [mangaList, setMangaList] = useState<MangaListItem[]>([]);
  const [metaData, setMetaData] = useState<MangaListMetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadManga = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await mangaApi.getList({ page, type, state, category });
      setMangaList(Array.isArray(data.mangaList) ? data.mangaList : []);
      setMetaData(data.metaData || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load manga catalog.');
    } finally {
      setLoading(false);
    }
  }, [page, type, state, category]);

  useEffect(() => {
    void loadManga();
  }, [loadManga]);

  const updateFilter = (patch: Record<string, string | number>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => next.set(k, String(v)));
    if (!('page' in patch)) {
      next.set('page', '1');
    }
    setSearchParams(next);
  };

  const featured =
    page === 1 && category === 'all' && mangaList.length > 0 ? mangaList[0] : null;
  const gridItems = featured ? mangaList.slice(1) : mangaList;
  const totalPages = metaData?.totalPages || 1;

  const typeOptions = metaData?.type || [
    { id: 'latest', type: 'Latest' },
    { id: 'topview', type: 'Top Read' },
    { id: 'newest', type: 'Newest' },
  ];

  const stateOptions = metaData?.state || [
    { id: 'all', type: 'All' },
    { id: 'Ongoing', type: 'Ongoing' },
    { id: 'Completed', type: 'Completed' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f7] text-zinc-900 dark:bg-[#111114] dark:text-zinc-100 amoled:bg-black amoled:text-zinc-50 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Featured Spotlight */}
        {featured && !loading && (
          <section className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-8 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    <span className="text-rose-600 dark:text-rose-500 font-semibold">Featured Series</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-nums">{featured.chapter}</span>
                    {featured.view && featured.view !== '—' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-nums">{featured.view} follows</span>
                      </>
                    )}
                  </div>
                  <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 text-balance max-w-2xl">
                    {featured.title}
                  </h1>
                  <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3 max-w-2xl">
                    {featured.description || 'Explore chapters and artwork from this series.'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Link
                    to={`/manga/${encodeURIComponent(featured.id)}`}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors whitespace-nowrap"
                  >
                    Read Series
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-4 bg-zinc-100 dark:bg-zinc-900 amoled:bg-zinc-950 min-h-[260px] lg:min-h-[320px] relative overflow-hidden">
                {featured.image && (
                  <img
                    src={featured.image}
                    alt={featured.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </div>
          </section>
        )}

        {/* Search & Filter Toolbar */}
        <section className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div className="lg:col-span-5">
              <SearchBar />
            </div>

            <div className="lg:col-span-7 flex flex-wrap items-center justify-between lg:justify-end gap-3">
              {/* Type Segmented Control */}
              <div className="inline-flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 amoled:bg-[#0e0e11] amoled:border amoled:border-zinc-900 rounded-lg">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateFilter({ type: opt.id })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      type.toLowerCase() === opt.id.toLowerCase()
                        ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50 amoled:bg-zinc-900 amoled:text-white'
                        : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    {opt.type}
                  </button>
                ))}
              </div>

              {/* State Segmented Control */}
              <div className="inline-flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 amoled:bg-[#0e0e11] amoled:border amoled:border-zinc-900 rounded-lg">
                {stateOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateFilter({ state: opt.id })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      state.toLowerCase() === opt.id.toLowerCase()
                        ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50 amoled:bg-zinc-900 amoled:text-white'
                        : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    {opt.type}
                  </button>
                ))}
              </div>

              {/* Genre Select */}
              <select
                value={category}
                onChange={(e) => updateFilter({ category: e.target.value })}
                aria-label="Filter by genre"
                className="px-3 py-2 text-xs font-medium bg-zinc-50 dark:bg-[#111114] amoled:bg-black border border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-zinc-950 dark:focus:border-zinc-400"
              >
                {(metaData?.category || [{ id: 'all', type: 'All Genres' }]).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.id === 'all' ? 'All Genres' : cat.type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Catalog Grid */}
        <section className="space-y-6">
          <div className="flex items-baseline justify-between border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 pb-3">
            <h2 className="font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
              {category === 'all' ? 'Manga Catalog' : `Genre: ${category}`}
            </h2>
            {metaData?.totalStories ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-nums">
                {metaData.totalStories.toLocaleString()} titles
              </span>
            ) : null}
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
          ) : error ? (
            <div className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl p-10 text-center space-y-3">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{error}</p>
              <button
                type="button"
                onClick={() => void loadManga()}
                className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : gridItems.length === 0 ? (
            <div className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl p-12 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No manga found for the selected filters.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {gridItems.map((manga) => (
                  <MangaCard key={manga.id} manga={manga} />
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    updateFilter({ page: page - 1 });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 rounded-lg text-zinc-800 dark:text-zinc-200 hover:border-zinc-950 dark:hover:border-zinc-400 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>

                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 font-mono-nums">
                  Page {page} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => {
                    updateFilter({ page: page + 1 });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 rounded-lg text-zinc-800 dark:text-zinc-200 hover:border-zinc-950 dark:hover:border-zinc-400 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
