import axios from 'axios';
import { getStoredToken, refreshToken } from '../authProvider.ts';
import type {
  ChapterDetailResponse,
  MangaBookmark,
  MangaDetailResponse,
  MangaListResponse,
  MetaOption,
  ReadingHistoryItem,
  SearchResponse,
  User,
} from '../types/manga.ts';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export function resolveMediaUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('/') && (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://'))) {
    try {
      return new URL(API_BASE_URL).origin + url;
    } catch {
      return url;
    }
  }
  return url;
}

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      const newToken = await refreshToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);

interface ClientCacheEntry<T> {
  data: T;
  expiresAt: number;
}

const clientCache = new Map<string, ClientCacheEntry<unknown>>();
const clientInFlight = new Map<string, Promise<unknown>>();

function cachedClientGet<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<{ data: T }> {
  const now = Date.now();
  const hit = clientCache.get(key) as ClientCacheEntry<T> | undefined;
  if (hit && now < hit.expiresAt) {
    return Promise.resolve({ data: hit.data });
  }

  const inflight = clientInFlight.get(key) as Promise<{ data: T }> | undefined;
  if (inflight) return inflight;

  const promise = fetcher()
    .then((data) => {
      if (clientCache.size > 120) {
        const oldestKey = clientCache.keys().next().value;
        if (oldestKey) clientCache.delete(oldestKey);
      }
      clientCache.set(key, { data, expiresAt: Date.now() + ttlMs });
      return { data };
    })
    .finally(() => {
      clientInFlight.delete(key);
    });

  clientInFlight.set(key, promise);
  return promise;
}

export const mangaApi = {
  getGenres: async () => {
    return cachedClientGet<{ genres: MetaOption[] }>('genres', 60 * 60_000, async () => {
      const res = await api.get<{ genres: MetaOption[] }>('/genres');
      return res.data;
    });
  },

  getList: async (
    params: {
      page?: number;
      type?: string;
      state?: string;
      category?: string;
    } = {}
  ) => {
    const normalized = {
      page: params.page ?? 1,
      type: params.type ?? 'latest',
      state: params.state ?? 'all',
      category: params.category ?? 'all',
    };
    const key = `mangaList:${normalized.page}:${normalized.type}:${normalized.state}:${normalized.category}`;
    return cachedClientGet<MangaListResponse>(key, 2 * 60_000, async () => {
      const res = await api.get<MangaListResponse>('/mangaList', { params: normalized });
      return {
        ...res.data,
        mangaList: (res.data.mangaList || []).map((m) => ({
          ...m,
          image: resolveMediaUrl(m.image),
        })),
      };
    });
  },

  getManhwaList: async (
    params: {
      page?: number;
      type?: string;
      state?: string;
      category?: string;
    } = {}
  ) => {
    const normalized = {
      page: params.page ?? 1,
      type: params.type ?? 'latest',
      state: params.state ?? 'all',
      category: params.category ?? 'all',
    };
    const key = `manhwaList:${normalized.page}:${normalized.type}:${normalized.state}:${normalized.category}`;
    return cachedClientGet<MangaListResponse>(key, 2 * 60_000, async () => {
      const res = await api.get<MangaListResponse>('/manhwaList', { params: normalized });
      return {
        ...res.data,
        mangaList: (res.data.mangaList || []).map((m) => ({
          ...m,
          image: resolveMediaUrl(m.image),
        })),
      };
    });
  },

  getDetail: async (id: string) => {
    const key = `detail:${id}`;
    return cachedClientGet<MangaDetailResponse>(key, 3 * 60_000, async () => {
      const res = await api.get<MangaDetailResponse>(`/manga/${encodeURIComponent(id)}`);
      return {
        ...res.data,
        imageUrl: resolveMediaUrl(res.data.imageUrl),
      };
    });
  },

  getChapter: async (id: string, chapterId: string) => {
    const key = `chapter:${id}:${chapterId}`;
    return cachedClientGet<ChapterDetailResponse>(key, 10 * 60_000, async () => {
      const res = await api.get<ChapterDetailResponse>(
        `/manga/${encodeURIComponent(id)}/${encodeURIComponent(chapterId)}`
      );
      return {
        ...res.data,
        mangaImage: resolveMediaUrl(res.data.mangaImage),
        images: (res.data.images || []).map((img) => ({
          ...img,
          image: resolveMediaUrl(img.image),
        })),
      };
    });
  },

  prefetchChapter: (id: string, chapterId: string) => {
    void mangaApi.getChapter(id, chapterId).catch(() => {
      // Ignore background prefetch errors
    });
  },

  search: async (query: string, page = 1) => {
    const key = `search:${query.trim().toLowerCase()}:${page}`;
    return cachedClientGet<SearchResponse>(key, 2 * 60_000, async () => {
      const res = await api.get<SearchResponse>(`/search/${encodeURIComponent(query)}`, {
        params: { page },
      });
      return {
        ...res.data,
        mangaList: (res.data.mangaList || []).map((m) => ({
          ...m,
          image: resolveMediaUrl(m.image),
        })),
      };
    });
  },
};

export const authApi = {
  login: (payload: {
    email?: string;
    given_name?: string;
    family_name?: string;
    demo?: boolean;
  }) =>
    api.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user: User;
    }>('/auth/login', payload),
  logout: () => api.post('/auth/logout'),
};

export const userApi = {
  getProfile: () => api.get<User>('/user/profile'),
  getLibrary: () =>
    api.get<{ bookmarks: MangaBookmark[]; history: ReadingHistoryItem[] }>('/user/library'),
  saveBookmark: (payload: {
    manga_id: string;
    title: string;
    image: string;
    latest_chapter?: string;
  }) => api.put<MangaBookmark>('/user/library', payload),
  removeBookmark: (mangaId: string) =>
    api.delete(`/user/library/${encodeURIComponent(mangaId)}`),
  saveHistory: (payload: {
    manga_id: string;
    manga_title: string;
    manga_image: string;
    chapter_id: string;
    chapter_name: string;
    page_index: number;
  }) => api.put<ReadingHistoryItem>('/user/history', payload),
};

export default api;
