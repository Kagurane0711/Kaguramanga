import { create } from 'zustand';
import { authApi, userApi } from '../services/api.ts';
import { clearStoredTokens, getStoredToken, setStoredTokens } from '../authProvider.ts';
import type { MangaBookmark, ReadingHistoryItem, User } from '../types/manga.ts';

const GUEST_BOOKMARKS_KEY = 'polin_guest_bookmarks';
const GUEST_HISTORY_KEY = 'polin_guest_history';

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

interface UsersState {
  user: User | null;
  bookmarks: MangaBookmark[];
  history: ReadingHistoryItem[];
  loggedIn: boolean;
  fetchUser: () => Promise<User | null>;
  fetchLibrary: () => Promise<void>;
  toggleBookmark: (item: {
    manga_id: string;
    title: string;
    image: string;
    latest_chapter?: string;
  }) => Promise<boolean>;
  recordProgress: (item: {
    manga_id: string;
    manga_title: string;
    manga_image: string;
    chapter_id: string;
    chapter_name: string;
    page_index: number;
  }) => Promise<void>;
  login: (payload: {
    email?: string;
    given_name?: string;
    family_name?: string;
    demo?: boolean;
  }) => Promise<User>;
  signOut: () => Promise<void>;
}

const useUsers = create<UsersState>((set, get) => ({
  user: null,
  bookmarks: readLocalJson<MangaBookmark[]>(GUEST_BOOKMARKS_KEY, []),
  history: readLocalJson<ReadingHistoryItem[]>(GUEST_HISTORY_KEY, []),
  loggedIn: Boolean(getStoredToken()),

  fetchUser: async () => {
    if (!getStoredToken()) {
      set({ user: null, loggedIn: false });
      return null;
    }
    try {
      const response = await userApi.getProfile();
      if (response.status === 200 && response.data) {
        set({ user: response.data, loggedIn: true });
        return response.data;
      }
    } catch {
      clearStoredTokens();
      set({ user: null, loggedIn: false });
    }
    return null;
  },

  fetchLibrary: async () => {
    if (!getStoredToken()) {
      set({
        bookmarks: readLocalJson<MangaBookmark[]>(GUEST_BOOKMARKS_KEY, []),
        history: readLocalJson<ReadingHistoryItem[]>(GUEST_HISTORY_KEY, []),
      });
      return;
    }
    try {
      const { data } = await userApi.getLibrary();
      set({
        bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
        history: Array.isArray(data.history) ? data.history : [],
      });
    } catch {
      // keep existing state
    }
  },

  toggleBookmark: async (item) => {
    const isSaved = get().bookmarks.some((b) => b.manga_id === item.manga_id);

    if (!getStoredToken()) {
      const current = readLocalJson<MangaBookmark[]>(GUEST_BOOKMARKS_KEY, []);
      const next = isSaved
        ? current.filter((b) => b.manga_id !== item.manga_id)
        : [
            {
              manga_id: item.manga_id,
              title: item.title,
              image: item.image,
              latest_chapter: item.latest_chapter || '',
              created_at: new Date().toISOString(),
            },
            ...current,
          ];
      writeLocalJson(GUEST_BOOKMARKS_KEY, next);
      set({ bookmarks: next });
      return !isSaved;
    }

    if (isSaved) {
      await userApi.removeBookmark(item.manga_id);
      set((state) => ({
        bookmarks: state.bookmarks.filter((b) => b.manga_id !== item.manga_id),
      }));
      return false;
    }

    const { data } = await userApi.saveBookmark(item);
    set((state) => ({
      bookmarks: [data, ...state.bookmarks.filter((b) => b.manga_id !== item.manga_id)],
    }));
    return true;
  },

  recordProgress: async (item) => {
    const entry: ReadingHistoryItem = {
      ...item,
      updated_at: new Date().toISOString(),
    };

    const currentGuest = readLocalJson<ReadingHistoryItem[]>(GUEST_HISTORY_KEY, []);
    const nextGuest = [
      entry,
      ...currentGuest.filter((h) => h.manga_id !== item.manga_id),
    ].slice(0, 30);
    writeLocalJson(GUEST_HISTORY_KEY, nextGuest);

    if (!getStoredToken()) {
      set({ history: nextGuest });
      return;
    }

    try {
      const { data } = await userApi.saveHistory(item);
      set((state) => ({
        history: [data, ...state.history.filter((h) => h.manga_id !== item.manga_id)],
      }));
    } catch {
      set({ history: nextGuest });
    }
  },

  login: async (payload) => {
    const { data } = await authApi.login(payload);
    setStoredTokens(data);
    set({ user: data.user, loggedIn: true });
    await get().fetchLibrary();
    return data.user;
  },

  signOut: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    clearStoredTokens();
    set({
      user: null,
      loggedIn: false,
      bookmarks: readLocalJson<MangaBookmark[]>(GUEST_BOOKMARKS_KEY, []),
      history: readLocalJson<ReadingHistoryItem[]>(GUEST_HISTORY_KEY, []),
    });
  },
}));

export default useUsers;
