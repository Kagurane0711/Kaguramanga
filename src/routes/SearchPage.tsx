import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar.tsx';
import Footer from '../components/Footer.tsx';
import MangaCard from '../components/MangaCard.tsx';
import SearchBar from '../components/SearchBar.tsx';
import { mangaApi } from '../services/api.ts';
import type { MangaListItem } from '../types/manga.ts';

export default function SearchPage() {
  const { query = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const decodedQuery = decodeURIComponent(query);

  const [results, setResults] = useState<MangaListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!decodedQuery.trim()) {
      setResults([]);
      setTotalPages(1);
      return;
    }
    let active = true;
    setLoading(true);
    mangaApi
      .search(decodedQuery, page)
      .then(({ data }) => {
        if (!active) return;
        setResults(Array.isArray(data.mangaList) ? data.mangaList : []);
        setTotalPages(data.metaData?.totalPages || 1);
      })
      .catch(() => {
        if (active) setResults([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [decodedQuery, page]);

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f7] text-zinc-900">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="max-w-2xl space-y-4">
          <h1 className="font-display text-3xl font-bold text-zinc-950">
            Search Manga
          </h1>
          <SearchBar
            initialQuery={decodedQuery}
            placeholder="Type a manga title (e.g. One Piece, Chainsaw Man)..."
          />
        </div>

        {!decodedQuery.trim() ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
            <p className="text-sm text-zinc-500">
              Enter a manga title above to search the catalog.
            </p>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[3/4] bg-zinc-200" />
                <div className="p-3.5 space-y-2">
                  <div className="h-4 bg-zinc-200 rounded w-3/4" />
                  <div className="h-3 bg-zinc-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
            <p className="text-sm font-medium text-zinc-800">
              No results found for "{decodedQuery}".
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-baseline justify-between border-b border-zinc-200 pb-3">
              <h2 className="font-display text-lg font-bold text-zinc-950">
                Results for "{decodedQuery}"
              </h2>
              <span className="text-xs text-zinc-500 font-mono-nums">
                {results.length} matches on page {page}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {results.map((manga) => (
                <MangaCard key={manga.id} manga={manga} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setSearchParams({ page: String(page - 1) })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white border border-zinc-300 rounded-lg text-zinc-800 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <span className="text-xs font-medium text-zinc-600 font-mono-nums">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setSearchParams({ page: String(page + 1) })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white border border-zinc-300 rounded-lg text-zinc-800 disabled:opacity-40"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
