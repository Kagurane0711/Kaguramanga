import { useEffect, useRef, useState } from 'react';

interface PageJumpControlProps {
  page: number;
  totalPages: number;
  onJump: (targetPage: number) => void;
}

export default function PageJumpControl({ page, totalPages, onJump }: PageJumpControlProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(page));
  const containerRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(String(page));
  }, [page]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const commitJump = (rawTarget: number) => {
    if (!Number.isFinite(rawTarget)) return;
    const clamped = Math.max(1, Math.min(totalPages, Math.floor(rawTarget)));
    setOpen(false);
    if (clamped !== page) {
      onJump(clamped);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(draft.replace(/,/g, '').trim());
    if (!Number.isFinite(parsed) || parsed < 1) return;
    commitJump(parsed);
  };

  const quickJumps: Array<{ label: string; target: number }> = [];
  if (page > 1) {
    quickJumps.push({ label: '1', target: 1 });
  }
  if (page > 10) {
    quickJumps.push({ label: '-10', target: Math.max(1, page - 10) });
  }
  for (const step of [10, 50, 100]) {
    const next = page + step;
    if (next < totalPages) {
      quickJumps.push({ label: `+${step}`, target: next });
    }
  }
  if (page < totalPages) {
    quickJumps.push({ label: `${totalPages.toLocaleString()}`, target: totalPages });
  }

  return (
    <span ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => {
          setDraft(String(page));
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Click to jump to a page"
        className="px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 amoled:hover:bg-zinc-900 rounded-lg font-mono-nums transition-colors cursor-pointer"
      >
        Page {page.toLocaleString()} of {totalPages.toLocaleString()}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Jump to page"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-30 w-64 p-3 bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-800 rounded-xl shadow-lg space-y-2.5"
        >
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <label htmlFor="page-jump-input">Jump to page</label>
              <span className="font-mono-nums">1 – {totalPages.toLocaleString()}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                id="page-jump-input"
                type="number"
                inputMode="numeric"
                min={1}
                max={totalPages}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={String(page)}
                className="w-full min-w-0 px-2.5 py-1.5 text-xs font-mono-nums bg-zinc-50 dark:bg-[#111114] amoled:bg-[#0e0e11] border border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-950 dark:focus:border-zinc-400"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors shrink-0 cursor-pointer"
              >
                Go
              </button>
            </div>
          </form>

          {quickJumps.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 amoled:border-zinc-900">
              {quickJumps.map((item) => (
                <button
                  key={`${item.label}-${item.target}`}
                  type="button"
                  onClick={() => commitJump(item.target)}
                  className="px-2 py-1 text-[11px] font-medium font-mono-nums bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 amoled:bg-zinc-900 amoled:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
