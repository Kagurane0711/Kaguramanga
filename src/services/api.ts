import axios from 'axios';
import type {
  ChapterDetailResponse,
  MangaDetailResponse,
  MangaListResponse,
  MetaOption,
  SearchResponse,
} from '../types/manga.ts';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export function resolveMediaUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
      try {
        return new URL(API_BASE_URL).origin + trimmed;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Reject malformed or non-HTTP(S) URLs
  }
  return '';
}

const api = axios.create({
  baseURL: API_BASE_URL,
});

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

const PAGE_SIZE = 24;
const latestFilterTotals = new Map<string, { totalStories: number; totalPages: number }>();

function syncListTotals(filterKey: string, data: MangaListResponse): MangaListResponse {
  const rawStories = data.metaData?.totalStories ?? 0;
  const computedPages =
    rawStories > 0
      ? Math.max(1, Math.ceil(rawStories / PAGE_SIZE))
      : Math.max(1, data.metaData?.totalPages || 1);

  if (rawStories > 0 || computedPages > 1) {
    latestFilterTotals.set(filterKey, {
      totalStories: rawStories,
      totalPages: computedPages,
    });
  }

  const latest = latestFilterTotals.get(filterKey);
  return {
    ...data,
    metaData: {
      ...data.metaData,
      totalStories: latest ? latest.totalStories : rawStories,
      totalPages: latest ? latest.totalPages : computedPages,
    },
  };
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
    const filterKey = `manga:${normalized.type}:${normalized.state}:${normalized.category}`;
    const key = `mangaList:${normalized.page}:${normalized.type}:${normalized.state}:${normalized.category}`;
    const result = await cachedClientGet<MangaListResponse>(key, 60_000, async () => {
      const res = await api.get<MangaListResponse>('/mangaList', { params: normalized });
      return syncListTotals(filterKey, {
        ...res.data,
        mangaList: (res.data.mangaList || []).map((m) => ({
          ...m,
          image: resolveMediaUrl(m.image),
        })),
      });
    });
    const latest = latestFilterTotals.get(filterKey);
    if (
      latest &&
      (result.data.metaData?.totalPages !== latest.totalPages ||
        result.data.metaData?.totalStories !== latest.totalStories)
    ) {
      return {
        data: {
          ...result.data,
          metaData: {
            ...result.data.metaData,
            totalStories: latest.totalStories,
            totalPages: latest.totalPages,
          },
        },
      };
    }
    return result;
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
    const filterKey = `manhwa:${normalized.type}:${normalized.state}:${normalized.category}`;
    const key = `manhwaList:${normalized.page}:${normalized.type}:${normalized.state}:${normalized.category}`;
    const result = await cachedClientGet<MangaListResponse>(key, 60_000, async () => {
      const res = await api.get<MangaListResponse>('/manhwaList', { params: normalized });
      return syncListTotals(filterKey, {
        ...res.data,
        mangaList: (res.data.mangaList || []).map((m) => ({
          ...m,
          image: resolveMediaUrl(m.image),
        })),
      });
    });
    const latest = latestFilterTotals.get(filterKey);
    if (
      latest &&
      (result.data.metaData?.totalPages !== latest.totalPages ||
        result.data.metaData?.totalStories !== latest.totalStories)
    ) {
      return {
        data: {
          ...result.data,
          metaData: {
            ...result.data.metaData,
            totalStories: latest.totalStories,
            totalPages: latest.totalPages,
          },
        },
      };
    }
    return result;
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

export default api;
