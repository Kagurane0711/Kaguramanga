import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'amoled';

const THEME_STORAGE_KEY = 'polin_manga_theme';

function isValidTheme(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'amoled';
}

export function applyThemeToDocument(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark' || theme === 'amoled');
  root.classList.toggle('amoled', theme === 'amoled');
  root.dataset.theme = theme;
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidTheme(stored)) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  cycleTheme: () => void;
}

const initialTheme = getInitialTheme();
applyThemeToDocument(initialTheme);

const useTheme = create<ThemeState>((set, get) => ({
  theme: initialTheme,

  setTheme: (theme: ThemeMode) => {
    applyThemeToDocument(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
    set({ theme });
  },

  cycleTheme: () => {
    const order: ThemeMode[] = ['light', 'dark', 'amoled'];
    const next = order[(order.indexOf(get().theme) + 1) % order.length];
    get().setTheme(next);
  },
}));

export default useTheme;
