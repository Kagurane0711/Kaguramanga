import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  ScrollText,
} from 'lucide-react';
import { mangaApi } from '../services/api.ts';
import ThemeToggle from '../components/ThemeToggle.tsx';
import useUsers from '../store/users.ts';
import type { ChapterDetailResponse } from '../types/manga.ts';

type ReadingMode = 'strip' | 'single';
type PageWidth = 'compact' | 'standard' | 'wide';

export default function MangaReader() {
  const { id, ch } = useParams();
  const navigate = useNavigate();
  const { recordProgress } = useUsers();

  const [chapterData, setChapterData] = useState<ChapterDetailResponse | null>(null);
  const [mangaImage, setMangaImage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ReadingMode>('strip');
  const [width, setWidth] = useState<PageWidth>('standard');
  const [pageIndex, setPageIndex] = useState(0);
  const [failedPages, setFailedPages] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!id || !ch) return;
    let active = true;
    setLoading(true);
    setError(null);
    setPageIndex(0);
    setFailedPages({});

    Promise.all([
      mangaApi.getChapter(id, ch),
      mangaApi.getDetail(id).catch(() => null),
    ])
      .then(([chapRes, detailRes]) => {
        if (!active) return;
        setChapterData(chapRes.data);
        const cover = detailRes?.data?.imageUrl || '';
        setMangaImage(cover);
        window.scrollTo({ top: 0 });
        void recordProgress({
          manga_id: id,
          manga_title: chapRes.data.title,
          manga_image: cover,
          chapter_id: ch,
          chapter_name: chapRes.data.currentChapter,
          page_index: 0,
        });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load chapter.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, ch, recordProgress]);

  const chapterOrder = useMemo(() => {
    const raw = chapterData?.chapterListIds || [];
    const seen = new Set<string>();
    return raw.filter((item) => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [chapterData]);
  const currentIdx = chapterOrder.findIndex((item) => item.id === ch);
  // chapterListIds is ordered newest -> oldest
  const nextChapter = currentIdx > 0 ? chapterOrder[currentIdx - 1] : null;
  const prevChapter =
    currentIdx >= 0 && currentIdx < chapterOrder.length - 1
      ? chapterOrder[currentIdx + 1]
      : null;

  const images = chapterData?.images || [];

  const goToChapter = useCallback(
    (chapterId: string) => {
      if (!id) return;
      navigate(`/read/${encodeURIComponent(id)}/${encodeURIComponent(chapterId)}`);
    },
    [id, navigate]
  );

  const changePage = useCallback(
    (delta: number) => {
      if (images.length === 0) return;
      setPageIndex((prev) => {
        const next = Math.min(images.length - 1, Math.max(0, prev + delta));
        if (id && ch && chapterData && next !== prev) {
          void recordProgress({
            manga_id: id,
            manga_title: chapterData.title,
            manga_image: mangaImage,
            chapter_id: ch,
            chapter_name: chapterData.currentChapter,
            page_index: next,
          });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return next;
      });
    },
    [images.length, id, ch, chapterData, mangaImage, recordProgress]
  );

  useEffect(() => {
    if (mode !== 'single') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') changePage(1);
      if (e.key === 'ArrowLeft') changePage(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, changePage]);

  const widthClass = useMemo(() => {
    if (width === 'compact') return 'max-w-xl';
    if (width === 'wide') return 'max-w-5xl';
    return 'max-w-3xl';
  }, [width]);

  const retryPage = useCallback((idx: number) => {
    setFailedPages((prev) => ({
      ...prev,
      [idx]: Math.abs(prev[idx] || 0) + 1,
    }));
  }, []);

  const markPageFailed = useCallback((idx: number) => {
    setFailedPages((prev) => ({
      ...prev,
      [idx]: -(Math.abs(prev[idx] || 0) + 1),
    }));
  }, []);

  const getPageSrc = (rawSrc: string, idx: number) => {
    const attempt = failedPages[idx] || 0;
    if (attempt <= 0) return rawSrc;
    const sep = rawSrc.includes('?') ? '&' : '?';
    return `${rawSrc}${sep}retry=${attempt}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f7] text-zinc-900 dark:bg-[#111114] dark:text-zinc-100 amoled:bg-black amoled:text-zinc-50 transition-colors">
      {/* Compact Sticky Reader Bar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#111114]/95 amoled:bg-black/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 transition-colors">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to={id ? `/manga/${encodeURIComponent(id)}` : '/'}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:text-white dark:bg-zinc-900 dark:hover:bg-zinc-800 amoled:bg-[#0e0e11] amoled:hover:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-800 shrink-0 whitespace-nowrap transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Series</span>
            </Link>

            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-zinc-950 dark:text-white truncate">
                {chapterData?.title || 'Loading...'}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-mono-nums">
                {chapterData?.currentChapter || ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {chapterOrder.length > 0 && (
              <select
                value={ch || ''}
                onChange={(e) => goToChapter(e.target.value)}
                aria-label="Select chapter"
                className="max-w-[140px] sm:max-w-[210px] px-2.5 py-1.5 text-xs bg-white border border-zinc-300 text-zinc-900 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 amoled:bg-black amoled:border-zinc-800 rounded-lg focus:outline-none focus:border-rose-500"
              >
                {chapterOrder.map((opt, idx) => (
                  <option key={`${opt.id}-${idx}`} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            )}

            <div className="hidden md:inline-flex items-center p-0.5 bg-zinc-100 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 amoled:bg-[#0e0e11] amoled:border-zinc-800 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('strip')}
                title="Vertical Strip"
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  mode === 'strip'
                    ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white amoled:bg-zinc-900'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>Strip</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('single')}
                title="Single Page"
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  mode === 'single'
                    ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white amoled:bg-zinc-900'
                    : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Page</span>
              </button>
            </div>

            <select
              value={width}
              onChange={(e) => setWidth(e.target.value as PageWidth)}
              aria-label="Page width"
              className="hidden sm:block px-2.5 py-1.5 text-xs bg-white border border-zinc-300 text-zinc-900 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 amoled:bg-black amoled:border-zinc-800 rounded-lg focus:outline-none focus:border-rose-500"
            >
              <option value="compact">Compact</option>
              <option value="standard">Standard</option>
              <option value="wide">Wide</option>
            </select>

            <ThemeToggle variant="dropdown" compact />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-2 sm:px-4 py-6">
        {loading ? (
          <div className="py-24 flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 border-t-rose-500 animate-spin" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading chapter pages...</p>
          </div>
        ) : error ? (
          <div className="my-16 max-w-md w-full bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-2xl p-8 text-center space-y-4">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">{error}</p>
            <Link
              to={id ? `/manga/${encodeURIComponent(id)}` : '/'}
              className="inline-block px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
            >
              Back to Series
            </Link>
          </div>
        ) : images.length === 0 ? (
          <div className="my-16 max-w-md w-full bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-2xl p-8 text-center space-y-3">
            <BookOpen className="w-8 h-8 text-zinc-400 dark:text-zinc-500 mx-auto" />
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              No internal images available for this chapter.
            </p>
            <Link
              to={id ? `/manga/${encodeURIComponent(id)}` : '/'}
              className="inline-block px-4 py-2 text-xs font-semibold bg-zinc-950 hover:bg-rose-600 text-white dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Choose Another Chapter
            </Link>
          </div>
        ) : mode === 'strip' ? (
          <div className={`w-full ${widthClass} flex flex-col items-center`}>
            {images.map((img, idx) =>
              (failedPages[idx] || 0) < 0 ? (
                <div
                  key={`${img.image}-${idx}-err`}
                  className="w-full py-16 bg-white dark:bg-[#18181b] amoled:bg-[#0a0a0c] border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 flex flex-col items-center justify-center gap-3 text-center"
                >
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Page {idx + 1} failed to load from upstream CDN.
                  </p>
                  <button
                    type="button"
                    onClick={() => retryPage(idx)}
                    className="px-3 py-1.5 text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white dark:border-zinc-700 amoled:bg-zinc-900 amoled:border-zinc-800 rounded-lg transition-colors"
                  >
                    Retry Page {idx + 1}
                  </button>
                </div>
              ) : (
                <img
                  key={`${img.image}-${idx}-${failedPages[idx] || 0}`}
                  src={getPageSrc(img.image, idx)}
                  alt={img.title || `Page ${idx + 1}`}
                  loading={idx < 3 ? 'eager' : 'lazy'}
                  referrerPolicy="no-referrer"
                  onError={() => markPageFailed(idx)}
                  className="w-full h-auto block select-none bg-zinc-100 dark:bg-zinc-900 amoled:bg-black"
                />
              )
            )}
          </div>
        ) : (
          <div className={`w-full ${widthClass} flex flex-col items-center gap-4`}>
            <div className="relative w-full flex justify-center bg-zinc-100 dark:bg-zinc-900 amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-lg overflow-hidden">
              {(failedPages[pageIndex] || 0) < 0 ? (
                <div className="w-full py-24 flex flex-col items-center justify-center gap-3 text-center">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Page {pageIndex + 1} failed to load from upstream CDN.
                  </p>
                  <button
                    type="button"
                    onClick={() => retryPage(pageIndex)}
                    className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-zinc-100 text-zinc-900 border border-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white dark:border-zinc-700 amoled:bg-zinc-900 amoled:border-zinc-800 rounded-lg transition-colors"
                  >
                    Retry Page {pageIndex + 1}
                  </button>
                </div>
              ) : (
                <img
                  key={`${images[pageIndex]?.image}-${pageIndex}-${failedPages[pageIndex] || 0}`}
                  src={images[pageIndex]?.image ? getPageSrc(images[pageIndex].image, pageIndex) : ''}
                  alt={images[pageIndex]?.title || `Page ${pageIndex + 1}`}
                  referrerPolicy="no-referrer"
                  onError={() => markPageFailed(pageIndex)}
                  className="w-full h-auto max-h-[85vh] object-contain select-none"
                />
              )}
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => changePage(-1)}
                className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize focus:outline-none"
              />
              <button
                type="button"
                aria-label="Next page"
                onClick={() => changePage(1)}
                className="absolute inset-y-0 right-0 w-1/3 cursor-e-resize focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-4 bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 px-4 py-2 rounded-lg">
              <button
                type="button"
                disabled={pageIndex <= 0}
                onClick={() => changePage(-1)}
                className="px-3 py-1 text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 amoled:bg-zinc-900 amoled:hover:bg-zinc-800 rounded disabled:opacity-40 transition-colors"
              >
                Prev Page
              </button>
              <span className="text-xs text-zinc-700 dark:text-zinc-300 font-mono-nums">
                {pageIndex + 1} / {images.length}
              </span>
              <button
                type="button"
                disabled={pageIndex >= images.length - 1}
                onClick={() => changePage(1)}
                className="px-3 py-1 text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 amoled:bg-zinc-900 amoled:hover:bg-zinc-800 rounded disabled:opacity-40 transition-colors"
              >
                Next Page
              </button>
            </div>
          </div>
        )}

        {/* End-of-Chapter Navigation */}
        {!loading && !error && (
          <div className={`w-full ${widthClass} mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 flex items-center justify-between gap-4`}>
            <button
              type="button"
              disabled={!prevChapter}
              onClick={() => prevChapter && goToChapter(prevChapter.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-900 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 amoled:bg-black amoled:hover:bg-zinc-900 amoled:border-zinc-800 rounded-lg disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous Chapter</span>
            </button>

            <button
              type="button"
              disabled={!nextChapter}
              onClick={() => nextChapter && goToChapter(nextChapter.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap transition-colors"
            >
              <span>Next Chapter</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
