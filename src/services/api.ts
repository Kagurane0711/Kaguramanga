import axios from 'axios';
import { getStoredToken, refreshToken } from '../authProvider.ts';
import type {
  ChapterDetailResponse,
  MangaBookmark,
  MangaDetailResponse,
  MangaListResponse,
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

export const mangaApi = {
  getList: async (params: {
    page?: number;
    type?: string;
    state?: string;
    category?: string;
  } = {}) => {
    const res = await api.get<MangaListResponse>('/mangaList', {
      params: {
        page: params.page ?? 1,
        type: params.type ?? 'latest',
        state: params.state ?? 'all',
        category: params.category ?? 'all',
      },
    });
    res.data.mangaList = (res.data.mangaList || []).map((m) => ({
      ...m,
      image: resolveMediaUrl(m.image),
    }));
    return res;
  },

  getDetail: async (id: string) => {
    const res = await api.get<MangaDetailResponse>(`/manga/${encodeURIComponent(id)}`);
    res.data.imageUrl = resolveMediaUrl(res.data.imageUrl);
    return res;
  },

  getChapter: async (id: string, chapterId: string) => {
    const res = await api.get<ChapterDetailResponse>(
      `/manga/${encodeURIComponent(id)}/${encodeURIComponent(chapterId)}`
    );
    res.data.images = (res.data.images || []).map((img) => ({
      ...img,
      image: resolveMediaUrl(img.image),
    }));
    return res;
  },

  search: async (query: string, page = 1) => {
    const res = await api.get<SearchResponse>(`/search/${encodeURIComponent(query)}`, {
      params: { page },
    });
    res.data.mangaList = (res.data.mangaList || []).map((m) => ({
      ...m,
      image: resolveMediaUrl(m.image),
    }));
    return res;
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
