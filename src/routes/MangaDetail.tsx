import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowUpDown, Bookmark, BookOpen, ChevronLeft } from 'lucide-react';
import Navbar from '../components/Navbar.tsx';
import Footer from '../components/Footer.tsx';
import { mangaApi } from '../services/api.ts';
import useUsers from '../store/users.ts';
import type { MangaDetailResponse } from '../types/manga.ts';

export default function MangaDetail() {
  const { id } = useParams();
  const [manga, setManga] = useState<MangaDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapterQuery, setChapterQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  const { bookmarks, history, toggleBookmark } = useUsers();

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError(null);
    mangaApi
      .getDetail(id)
      .then(({ data }) => {
        if (active) setManga(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load manga.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const isBookmarked = useMemo(
    () => bookmarks.some((b) => b.manga_id === id),
    [bookmarks, id]
  );

  const lastRead = useMemo(
    () => history.find((h) => h.manga_id === id),
    [history, id]
  );

  const filteredChapters = useMemo(() => {
    if (!manga?.chapterList) return [];
    const base = sortAsc ? [...manga.chapterList].reverse() : manga.chapterList;
    const q = chapterQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((ch) => ch.name.toLowerCase().includes(q));
  }, [manga, sortAsc, chapterQuery]);

  const firstChapter = useMemo(() => {
    if (!manga?.chapterList || manga.chapterList.length === 0) return null;
    return manga.chapterList[manga.chapterList.length - 1];
  }, [manga]);

  const handleBookmark = async () => {
    if (!manga || !id) return;
    try {
      const saved = await toggleBookmark({
        manga_id: id,
        title: manga.name,
        image: manga.imageUrl,
        latest_chapter: manga.chapterList[0]?.name || '',
      });
      toast.success(saved ? 'Saved to your library.' : 'Removed from your library.');
    } catch {
      toast.error('Could not update library bookmark.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f7] text-zinc-900 dark:bg-[#111114] dark:text-zinc-100 amoled:bg-black amoled:text-zinc-50 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Catalog</span>
          </Link>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-2xl p-8 animate-pulse grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-4 aspect-[3/4] bg-zinc-200 dark:bg-zinc-800 amoled:bg-zinc-900 rounded-xl" />
            <div className="md:col-span-8 space-y-4">
              <div className="h-8 bg-zinc-200 dark:bg-zinc-800 amoled:bg-zinc-900 rounded w-2/3" />
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800/70 amoled:bg-zinc-900/70 rounded w-1/2" />
              <div className="h-32 bg-zinc-100 dark:bg-zinc-800/70 amoled:bg-zinc-900/70 rounded w-full" />
            </div>
          </div>
        ) : error || !manga ? (
          <div className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-2xl p-12 text-center space-y-3">
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {error || 'Manga not found.'}
            </p>
            <Link
              to="/"
              className="inline-block px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors"
            >
              Return Home
            </Link>
          </div>
        ) : (
          <>
            {/* Manga Header & Synopsis */}
            <section className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-2xl p-6 sm:p-8">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                <div className="md:col-span-4 lg:col-span-3 space-y-3">
                  <div className="aspect-[3/4] rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-900 amoled:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900">
                    {manga.imageUrl ? (
                      <img
                        src={manga.imageUrl}
                        alt={manga.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                        <BookOpen className="w-10 h-10 text-zinc-400" />
                      </div>
                    )}
                  </div>

                  {lastRead ? (
                    <Link
                      to={`/read/${encodeURIComponent(manga.id)}/${encodeURIComponent(lastRead.chapter_id)}`}
                      className="block w-full text-center py-2.5 px-4 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
                    >
                      Continue: {lastRead.chapter_name.split(':')[0]}
                    </Link>
                  ) : firstChapter ? (
                    <Link
                      to={`/read/${encodeURIComponent(manga.id)}/${encodeURIComponent(firstChapter.id)}`}
                      className="block w-full text-center py-2.5 px-4 text-sm font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors"
                    >
                      Start Reading
                    </Link>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleBookmark()}
                    className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-lg border transition-colors cursor-pointer ${
                      isBookmarked
                        ? 'bg-zinc-950 text-white border-zinc-950 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-100'
                        : 'bg-white text-zinc-800 border-zinc-300 hover:border-zinc-950 dark:bg-[#111114] dark:text-zinc-200 dark:border-zinc-700 dark:hover:border-zinc-400 amoled:bg-black amoled:border-zinc-800'
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                    <span>{isBookmarked ? 'Saved in Library' : 'Save to Library'}</span>
                  </button>
                </div>

                <div className="md:col-span-8 lg:col-span-9 space-y-5">
                  <div className="space-y-2">
                    <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 text-balance">
                      {manga.name}
                    </h1>

                    {/* Unboxed inline metadata with separators */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{manga.author}</span>
                      <span aria-hidden="true">·</span>
                      <span>{manga.status}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-nums">{manga.view} follows</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-nums">Updated {manga.updated}</span>
                    </div>
                  </div>

                  {manga.genres.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                      <span className="font-semibold text-zinc-500 dark:text-zinc-400">Genres:</span>
                      {manga.genres.map((genre, idx) => (
                        <span key={genre} className="inline-flex items-center gap-3">
                          <Link
                            to={`/genres/${encodeURIComponent(genre)}`}
                            className="font-medium text-zinc-800 dark:text-zinc-200 hover:text-rose-600 dark:hover:text-rose-400 underline-offset-4 hover:underline transition-colors"
                          >
                            {genre}
                          </Link>
                          {idx < manga.genres.length - 1 && (
                            <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                              /
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 amoled:border-zinc-900">
                    <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Synopsis</h2>
                    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line">
                      {manga.description || 'No synopsis available for this manga.'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Chapter List */}
            <section className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 pb-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
                    Chapters
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-nums mt-0.5">
                    {manga.chapterList.length} available chapters
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    value={chapterQuery}
                    onChange={(e) => setChapterQuery(e.target.value)}
                    placeholder="Filter chapter..."
                    className="px-3 py-2 text-xs bg-white dark:bg-[#111114] amoled:bg-black text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 border border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 rounded-lg focus:outline-none focus:border-zinc-950 dark:focus:border-zinc-400 w-44"
                  />
                  <button
                    type="button"
                    onClick={() => setSortAsc((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 amoled:bg-zinc-900 amoled:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>{sortAsc ? 'Oldest First' : 'Newest First'}</span>
                  </button>
                </div>
              </div>

              {manga.chapterList.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">
                  No chapters available for this title yet.
                </p>
              ) : filteredChapters.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">
                  No chapters match your filter.
                </p>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 amoled:divide-zinc-900 max-h-[540px] overflow-y-auto">
                  {filteredChapters.map((ch) => {
                    const isCurrent = lastRead?.chapter_id === ch.id;
                    return (
                      <Link
                        key={ch.id}
                        to={`/read/${encodeURIComponent(manga.id)}/${encodeURIComponent(ch.id)}`}
                        className="flex items-center justify-between gap-4 py-3 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 amoled:hover:bg-zinc-950 transition-colors group"
                      >
                        <span
                          className={`text-sm font-medium truncate ${
                            isCurrent
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : 'text-zinc-900 dark:text-zinc-100 group-hover:text-rose-600 dark:group-hover:text-rose-400'
                          }`}
                        >
                          {ch.name}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-nums shrink-0">
                          {ch.view} · {ch.createdAt}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
