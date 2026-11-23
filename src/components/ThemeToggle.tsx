import { useEffect, useRef, useState } from 'react';
import { Check, Eclipse, Moon, Sun } from 'lucide-react';
import useTheme, { type ThemeMode } from '../store/theme.ts';

interface ThemeOption {
  id: ThemeMode;
  label: string;
  description: string;
  icon: typeof Sun;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Warm paper canvas',
    icon: Sun,
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Soft charcoal dark',
    icon: Moon,
  },
  {
    id: 'amoled',
    label: 'AMOLED',
    description: 'True #000 pure black',
    icon: Eclipse,
  },
];

interface ThemeToggleProps {
  variant?: 'dropdown' | 'segmented';
  compact?: boolean;
}

export default function ThemeToggle({
  variant = 'dropdown',
  compact = false,
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (variant === 'segmented') {
    return (
      <div
        role="group"
        aria-label="Appearance mode"
        className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 amoled:bg-[#0e0e11] amoled:border amoled:border-zinc-900"
      >
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              aria-pressed={active}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-white text-zinc-950 shadow-xs dark:bg-zinc-950 dark:text-zinc-50 amoled:bg-zinc-900 amoled:text-white'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const current = THEME_OPTIONS.find((o) => o.id === theme) || THEME_OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Theme: ${current.label}. Switch appearance mode`}
        title={`Theme: ${current.label}`}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 amoled:border-zinc-800 bg-white dark:bg-zinc-900 amoled:bg-black text-zinc-700 dark:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-2.5 py-1.5 text-xs font-medium' : 'px-3 py-2 text-xs font-semibold'
        }`}
      >
        <CurrentIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className={compact ? 'hidden sm:inline' : ''}>{current.label}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Select appearance mode"
          className="absolute right-0 mt-2 w-48 rounded-xl border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-800 bg-white dark:bg-[#18181b] amoled:bg-black shadow-lg py-1.5 z-50"
        >
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(opt.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-zinc-100 text-zinc-950 dark:bg-zinc-800/90 dark:text-white amoled:bg-zinc-900 amoled:text-white'
                    : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50 amoled:hover:bg-zinc-950'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-rose-600 dark:text-rose-500' : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-tight">{opt.label}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5 truncate">
                      {opt.description}
                    </p>
                  </div>
                </div>
                {active && (
                  <Check
                    className="w-3.5 h-3.5 text-rose-600 dark:text-rose-500 shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
