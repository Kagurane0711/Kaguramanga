import axios from 'axios';

export const LOCALSTORAGE_KEYS = {
  accessToken: 'mangaAccessToken',
  refreshToken: 'mangaRefreshToken',
  expireTime: 'mangaExpireTime',
  timestamp: 'mangaTokenTimestamp',
} as const;

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  const token = window.localStorage.getItem(LOCALSTORAGE_KEYS.accessToken);
  if (!token || token === 'undefined' || token === 'null') return null;
  return token;
};

export const setStoredTokens = (payload: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCALSTORAGE_KEYS.accessToken, payload.access_token);
  if (payload.refresh_token) {
    window.localStorage.setItem(LOCALSTORAGE_KEYS.refreshToken, payload.refresh_token);
  }
  if (payload.expires_in) {
    window.localStorage.setItem(LOCALSTORAGE_KEYS.expireTime, String(payload.expires_in));
  }
  window.localStorage.setItem(LOCALSTORAGE_KEYS.timestamp, Date.now().toString());
};

export const clearStoredTokens = () => {
  if (typeof window === 'undefined') return;
  Object.values(LOCALSTORAGE_KEYS).forEach((key) => {
    window.localStorage.removeItem(key);
  });
};

export const refreshToken = async (): Promise<string | null> => {
  const storedRefreshToken = window.localStorage.getItem(LOCALSTORAGE_KEYS.refreshToken);
  if (!storedRefreshToken || storedRefreshToken === 'undefined' || storedRefreshToken === 'null') {
    clearStoredTokens();
    return null;
  }
  try {
    const { data } = await axios.get(
      `${API_BASE}/auth/token/renew?refresh_token=${encodeURIComponent(storedRefreshToken)}`
    );
    if (data?.access_token) {
      setStoredTokens(data);
      return data.access_token;
    }
  } catch {
    clearStoredTokens();
  }
  return null;
};

export const getAccessToken = (): string | null => getStoredToken();
