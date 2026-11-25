import net from 'node:net';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  GENRE_OPTIONS,
  fetchChapterDetail,
  fetchMangaDetail,
  fetchMangaList,
  searchManga,
} from '../services/mangahook.ts';

const SAFE_RASTER_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const MAX_PROXY_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB cap on proxied images
const MAX_PROXY_REDIRECTS = 2;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function createRateLimiter(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = getClientIp(req);
    const existing = buckets.get(key);

    if (!existing || now >= existing.resetAt) {
      if (buckets.size > 5000) {
        for (const [ip, entry] of buckets) {
          if (now >= entry.resetAt) buckets.delete(ip);
          if (buckets.size <= 2500) break;
        }
      }
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    existing.count += 1;
    if (existing.count > options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ message: 'Too many requests. Please try again shortly.' });
    }
    return next();
  };
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  const ipVersion = net.isIP(lower);
  if (ipVersion === 4) {
    const parts = lower.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (ipVersion === 6) {
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice('::ffff:'.length);
      return isPrivateOrBlockedHost(mapped);
    }
    return false;
  }

  return false;
}

function validateProxyTarget(rawUrl: string, allowedImageHosts: string[]): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== '443') return null;

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || isPrivateOrBlockedHost(hostname)) return null;

    const hostAllowed = allowedImageHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
    return hostAllowed ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, maxLen);
}

export function createApiRouter() {
  const router = express.Router();
  const searchRateLimit = createRateLimiter({ windowMs: 60_000, max: 60 });

  const allowedImageHosts = (
    process.env.IMAGE_PROXY_ALLOWED_HOSTS ||
    '2xstorage.com,mangakakalove.com,mangakakalot.gg,mangakakalot.tv,mkklcdnv6temp.com,mkklcdnv6.com,uploads.mangadex.org,mangadex.network,mangadex.org'
  )
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  // Bounded LRU cache for cover thumbnails (<= 250 KB each, 30 MB cap)
  const MAX_COVER_CACHE_BYTES = 30 * 1024 * 1024;
  const MAX_COVER_ITEM_BYTES = 250 * 1024;
  const coverCache = new Map<string, { buf: Buffer; contentType: string; expiresAt: number }>();
  let coverCacheBytes = 0;

  const getCachedCover = (url: string) => {
    const hit = coverCache.get(url);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      coverCache.delete(url);
      coverCacheBytes -= hit.buf.byteLength;
      return null;
    }
    coverCache.delete(url);
    coverCache.set(url, hit);
    return hit;
  };

  const setCachedCover = (url: string, buf: Buffer, contentType: string) => {
    if (buf.byteLength > MAX_COVER_ITEM_BYTES) return;
    const prev = coverCache.get(url);
    if (prev) {
      coverCacheBytes -= prev.buf.byteLength;
      coverCache.delete(url);
    }
    while (coverCacheBytes + buf.byteLength > MAX_COVER_CACHE_BYTES && coverCache.size > 0) {
      const oldestKey = coverCache.keys().next().value;
      if (!oldestKey) break;
      const oldest = coverCache.get(oldestKey);
      if (oldest) coverCacheBytes -= oldest.buf.byteLength;
      coverCache.delete(oldestKey);
    }
    coverCache.set(url, {
      buf,
      contentType,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    coverCacheBytes += buf.byteLength;
  };

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  router.get('/genres', (_req: Request, res: Response) => {
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    );
    res.json({ genres: GENRE_OPTIONS });
  });

  // --- Catalog Endpoints ---
  router.get('/mangaList', async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const type = typeof req.query.type === 'string' ? req.query.type.slice(0, 32) : 'latest';
      const state = typeof req.query.state === 'string' ? req.query.state.slice(0, 32) : 'all';
      const category =
        typeof req.query.category === 'string' ? req.query.category.slice(0, 64) : 'all';

      const data = await fetchMangaList({ page, type, state, category, origin: 'manga' });
      res.setHeader(
        'Cache-Control',
        'public, max-age=30, s-maxage=60, stale-while-revalidate=300'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/mangaList error:', err);
      res.status(502).json({ message: 'Unable to load manga catalog right now. Please try again.' });
    }
  });

  router.get('/manhwaList', async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const type = typeof req.query.type === 'string' ? req.query.type.slice(0, 32) : 'latest';
      const state = typeof req.query.state === 'string' ? req.query.state.slice(0, 32) : 'all';
      const category =
        typeof req.query.category === 'string' ? req.query.category.slice(0, 64) : 'all';

      const data = await fetchMangaList({ page, type, state, category, origin: 'manhwa' });
      res.setHeader(
        'Cache-Control',
        'public, max-age=30, s-maxage=60, stale-while-revalidate=300'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/manhwaList error:', err);
      res.status(502).json({ message: 'Unable to load manhwa catalog right now. Please try again.' });
    }
  });

  router.get('/manga/:id', async (req: Request, res: Response) => {
    try {
      const id = sanitizeText(req.params.id, 180);
      if (!id) {
        return res.status(400).json({ message: 'Invalid series identifier.' });
      }
      const data = await fetchMangaDetail(id);
      res.setHeader(
        'Cache-Control',
        'public, max-age=120, s-maxage=600, stale-while-revalidate=3600'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/manga/:id error:', err);
      res.status(502).json({ message: 'Unable to load series details right now. Please try again.' });
    }
  });

  router.get('/manga/:id/:ch', async (req: Request, res: Response) => {
    try {
      const id = sanitizeText(req.params.id, 180);
      const ch = sanitizeText(req.params.ch, 180);
      if (!id || !ch) {
        return res.status(400).json({ message: 'Invalid chapter identifier.' });
      }
      const data = await fetchChapterDetail(id, ch);
      res.setHeader(
        'Cache-Control',
        'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/manga/:id/:ch error:', err);
      res.status(502).json({ message: 'Unable to load chapter pages right now. Please try again.' });
    }
  });

  router.get('/search/:query', searchRateLimit, async (req: Request, res: Response) => {
    try {
      const query = sanitizeText(req.params.query, 120);
      const page = Number(req.query.page ?? 1);
      const data = await searchManga(query, page);
      res.setHeader(
        'Cache-Control',
        'public, max-age=60, s-maxage=300, stale-while-revalidate=1800'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/search/:query error:', err);
      res.status(502).json({ message: 'Search is temporarily unavailable. Please try again.' });
    }
  });

  // --- Hardened Image Proxy (allowlist + redirect re-check + raster-only MIME + size cap) ---
  router.get('/proxy/image', async (req: Request, res: Response) => {
    const target = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!target || target.length > 2048) {
      return res.status(400).send('Invalid image URL');
    }

    const initialParsed = validateProxyTarget(target, allowedImageHosts);
    if (!initialParsed) {
      return res.status(403).send('Image host is not allowed');
    }

    try {
      // Fast path: serve cached cover thumbnails directly from memory (<1ms)
      const cached = getCachedCover(initialParsed.toString());
      if (cached) {
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
        return res.send(cached.buf);
      }

      const fetchValidatedImage = async (startUrl: URL): Promise<globalThis.Response | null> => {
        let currentUrl = startUrl;
        for (let hop = 0; hop <= MAX_PROXY_REDIRECTS; hop++) {
          const hostname = currentUrl.hostname.toLowerCase();
          const isKakalotCdn =
            hostname.includes('2xstorage') ||
            hostname.includes('mangakakalove') ||
            hostname.includes('mangakakalot') ||
            hostname.includes('mkklcdn') ||
            hostname.includes('blazefast');

          const headers: Record<string, string> = {
            'User-Agent': isKakalotCdn
              ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
              : 'KaguraMangaReader/1.0',
            Accept: 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/gif,*/*;q=0.5',
          };
          if (isKakalotCdn) {
            headers.Referer = 'https://www.mangakakalove.com/';
          }

          const upstream = await fetch(currentUrl.toString(), {
            headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(15_000),
          });

          if (upstream.status >= 300 && upstream.status < 400) {
            const location = upstream.headers.get('location');
            if (!location || hop === MAX_PROXY_REDIRECTS) return null;
            const resolvedRedirect = new URL(location, currentUrl).toString();
            const validatedNext = validateProxyTarget(resolvedRedirect, allowedImageHosts);
            if (!validatedNext) return null;
            currentUrl = validatedNext;
            continue;
          }

          return upstream;
        }
        return null;
      };

      const upstream = await fetchValidatedImage(initialParsed);
      if (!upstream) {
        return res.status(403).send('Image redirect blocked');
      }

      if (!upstream.ok) {
        return res.status(upstream.status).send('Failed to load image');
      }

      const rawContentType = (upstream.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!SAFE_RASTER_IMAGE_TYPES.has(rawContentType)) {
        return res.status(415).send('Unsupported image content type');
      }

      const contentLength = Number(upstream.headers.get('content-length') || '0');
      if (contentLength > MAX_PROXY_IMAGE_BYTES) {
        return res.status(413).send('Image exceeds size limit');
      }

      res.setHeader('Content-Type', rawContentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');

      if (contentLength > 0 && contentLength <= MAX_COVER_ITEM_BYTES) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        setCachedCover(initialParsed.toString(), buf, rawContentType);
        return res.send(buf);
      }

      if (upstream.body) {
        if (contentLength > 0) {
          res.setHeader('Content-Length', String(contentLength));
        }
        const nodeStream = Readable.fromWeb(upstream.body as unknown as WebReadableStream);
        let streamedBytes = 0;
        nodeStream.on('data', (chunk: Buffer) => {
          streamedBytes += chunk.byteLength;
          if (streamedBytes > MAX_PROXY_IMAGE_BYTES) {
            nodeStream.destroy(new Error('Image exceeds size limit'));
          }
        });
        nodeStream.on('error', () => {
          if (!res.headersSent) {
            res.status(502).send('Image stream error');
          } else {
            res.end();
          }
        });
        nodeStream.pipe(res);
        return;
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.byteLength > MAX_PROXY_IMAGE_BYTES) {
        return res.status(413).send('Image exceeds size limit');
      }
      setCachedCover(initialParsed.toString(), buf, rawContentType);
      res.send(buf);
    } catch (err) {
      console.error('Image proxy error:', err);
      if (!res.headersSent) {
        res.status(502).send('Image proxy error');
      }
    }
  });

  router.use((_req: Request, res: Response) => {
    res.status(404).json({ message: 'API route not found.' });
  });

  return router;
}
