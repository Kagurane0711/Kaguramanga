import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import Navbar from '../components/Navbar.tsx';
import Footer from '../components/Footer.tsx';
import MangaCard from '../components/MangaCard.tsx';
import { mangaApi } from '../services/api.ts';
import useCatalogBrand from '../store/catalogMode.ts';
import type { MangaListItem, MetaOption } from '../types/manga.ts';

type GenreGroupFilter = 'all' | 'genre' | 'demographic' | 'theme' | 'format';

const GROUP_TABS: Array<{ id: GenreGroupFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'genre', label: 'Genres' },
  { id: 'demographic', label: 'Demographics' },
  { id: 'theme', label: 'Themes' },
  { id: 'format', label: 'Formats' },
];

export default function Genres() {
  const { category = 'all' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { brand } = useCatalogBrand();

  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [genres, setGenres] = useState<MetaOption[]>([]);
  const [genresLoaded, setGenresLoaded] = useState(false);
  const [mangaList, setMangaList] = useState<MangaListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStories, setTotalStories] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<GenreGroupFilter>('all');
  const [genreSearch, setGenreSearch] = useState('');

  // Load full genre metadata directory immediately
  useEffect(() => {
    let active = true;
    mangaApi
      .getGenres()
      .then(({ data }) => {
        if (active && Array.isArray(data.genres)) {
          setGenres(data.genres);
          setGenresLoaded(true);
        }
      })
      .catch(() => {
        // Fallback populated by catalog response below
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const request =
      brand === 'manhwa'
        ? mangaApi.getManhwaList({ page, type: 'topview', state: 'all', category })
        : mangaApi.getList({ page, type: 'topview', state: 'all', category });

    request
      .then(({ data }) => {
        if (!active) return;
        if (data.metaData?.category?.length) {
          setGenres(data.metaData.category);
          setGenresLoaded(true);
        }
        setMangaList(data.mangaList || []);
        setTotalPages(data.metaData?.totalPages || 1);
        setTotalStories(data.metaData?.totalStories || 0);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load genre catalog.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, brand, page]);

  const groupCounts = useMemo(() => {
    const counts: Record<GenreGroupFilter, number> = {
      all: 0,
      genre: 0,
      demographic: 0,
      theme: 0,
      format: 0,
    };
    for (const g of genres) {
      if (g.id === 'all') continue;
      counts.all += 1;
      if (g.group && g.group !== 'all') {
        counts[g.group] += 1;
      }
    }
    return counts;
  }, [genres]);

  const filteredGenres = useMemo(() => {
    const q = genreSearch.trim().toLowerCase();
    const list = genres.filter((g) => {
      if (g.id === 'all') {
        return !q && groupFilter === 'all';
      }
      if (groupFilter !== 'all' && g.group && g.group !== groupFilter) {
        return false;
      }
      if (q) {
        const label = (g.type || g.name || g.id).toLowerCase();
        return label.includes(q) || g.id.toLowerCase().includes(q);
      }
      return true;
    });

    // Keep "All Genres" first and sort all remaining tags alphabetically A–Z
    return list.sort((a, b) => {
      if (a.id === 'all') return -1;
      if (b.id === 'all') return 1;
      return (a.type || a.id).localeCompare(b.type || b.id);
    });
  }, [genres, groupFilter, genreSearch]);

  const activeGenreLabel = useMemo(() => {
    if (category === 'all') return 'All Genres';
    const found = genres.find((g) => g.id.toLowerCase() === category.toLowerCase());
    return found?.type || category.replace(/-/g, ' ');
  }, [genres, category]);

  const selectGenre = (genreId: string) => {
    navigate(genreId === 'all' ? '/genres' : `/genres/${encodeURIComponent(genreId)}`);
  };

  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f7] text-zinc-900 dark:bg-[#111114] dark:text-zinc-100 amoled:bg-black amoled:text-zinc-50 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 pb-4">
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-bold text-zinc-950 dark:text-zinc-50">
              Browse {brand === 'manhwa' ? 'Manhwa' : 'Manga'} by Genre
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Explore top {brand === 'manhwa' ? 'Korean manhwa' : 'Japanese manga'} across all genres, demographics, themes, and formats.
            </p>
          </div>
          {groupCounts.all > 0 && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-nums shrink-0">
              {groupCounts.all} categories listed
            </span>
          )}
        </div>

        {/* Genre Directory Controls */}
        <section className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Group Filter Tabs */}
            <div className="inline-flex flex-wrap items-center p-1 bg-zinc-100 dark:bg-zinc-900 amoled:bg-[#0e0e11] amoled:border amoled:border-zinc-900 rounded-lg self-start">
              {GROUP_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGroupFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    groupFilter === tab.id
                      ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-zinc-50 amoled:bg-zinc-900 amoled:text-white'
                      : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  {groupCounts[tab.id] > 0 && (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono-nums">
                      {groupCounts[tab.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Quick Genre Filter Input */}
            <div className="relative w-full sm:w-64">
              <Search
                className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={genreSearch}
                onChange={(e) => setGenreSearch(e.target.value)}
                placeholder="Filter genres or themes..."
                aria-label="Filter genres or themes"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-[#111114] amoled:bg-black border border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-zinc-950 dark:focus:border-zinc-400 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!genresLoaded ? (
              Array.from({ length: 18 }).map((_, i) => (
                <div
                  key={i}
                  className="h-7 w-20 rounded-lg bg-zinc-200 dark:bg-zinc-800 amoled:bg-zinc-900 animate-pulse"
                />
              ))
            ) : filteredGenres.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 py-1">
                No genres match &ldquo;{genreSearch}&rdquo;.
              </p>
            ) : (
              filteredGenres.map((g) => {
                const active = category.toLowerCase() === g.id.toLowerCase();
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => selectGenre(g.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-zinc-950 text-white border-zinc-950 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-100'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-950 dark:bg-[#111114] dark:text-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-500 amoled:bg-black amoled:border-zinc-900 amoled:hover:border-zinc-600'
                    }`}
                  >
                    {g.id === 'all' ? 'All Genres' : g.type}
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Results Section */}
        <section className="space-y-6">
          <div className="flex items-baseline justify-between border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 pb-3">
            <h2 className="font-display text-xl font-bold text-zinc-950 dark:text-zinc-50 capitalize">
              {activeGenreLabel}
            </h2>
            {totalStories > 0 && !loading ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-nums">
                {totalStories.toLocaleString()} titles
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
                onClick={() => selectGenre(category)}
                className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : mangaList.length === 0 ? (
            <div className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl p-12 text-center space-y-2">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No {brand === 'manhwa' ? 'manhwa' : 'manga'} found in &ldquo;{activeGenreLabel}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => selectGenre('all')}
                className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                View all genres
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {mangaList.map((manga) => (
                  <MangaCard key={manga.id} manga={manga} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 pt-4">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
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
                    onClick={() => goToPage(page + 1)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 rounded-lg text-zinc-800 dark:text-zinc-200 hover:border-zinc-950 dark:hover:border-zinc-400 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
