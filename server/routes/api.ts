import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db.ts';
import {
  GENRE_OPTIONS,
  fetchChapterDetail,
  fetchMangaDetail,
  fetchMangaList,
  searchManga,
} from '../services/mangahook.ts';
import type { UserRecord } from '../types.ts';

interface AuthRequest extends Request {
  user?: UserRecord;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  const user = db.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
  req.user = user;
  next();
}

export function createApiRouter() {
  const router = express.Router();
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
    // Refresh LRU position
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
    res.json({ status: 'ok', provider: 'MangaHook API' });
  });

  router.get('/genres', (_req: Request, res: Response) => {
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    );
    res.json({ genres: GENRE_OPTIONS });
  });

  // --- MangaHook API Endpoints ---
  router.get('/mangaList', async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const type = typeof req.query.type === 'string' ? req.query.type : 'latest';
      const state = typeof req.query.state === 'string' ? req.query.state : 'all';
      const category = typeof req.query.category === 'string' ? req.query.category : 'all';

      const data = await fetchMangaList({ page, type, state, category, origin: 'manga' });
      res.setHeader(
        'Cache-Control',
        'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/mangaList error:', err);
      res.status(502).json({
        message: err instanceof Error ? err.message : 'Failed to fetch manga list from MangaHook.',
      });
    }
  });

  router.get('/manhwaList', async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page ?? 1);
      const type = typeof req.query.type === 'string' ? req.query.type : 'latest';
      const state = typeof req.query.state === 'string' ? req.query.state : 'all';
      const category = typeof req.query.category === 'string' ? req.query.category : 'all';

      const data = await fetchMangaList({ page, type, state, category, origin: 'manhwa' });
      res.setHeader(
        'Cache-Control',
        'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/manhwaList error:', err);
      res.status(502).json({
        message: err instanceof Error ? err.message : 'Failed to fetch manhwa list from MangaHook.',
      });
    }
  });

  router.get('/manga/:id', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const data = await fetchMangaDetail(id);
      res.setHeader(
        'Cache-Control',
        'public, max-age=120, s-maxage=600, stale-while-revalidate=3600'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/manga/:id error:', err);
      res.status(502).json({
        message: err instanceof Error ? err.message : 'Failed to fetch manga details from MangaHook.',
      });
    }
  });

  router.get('/manga/:id/:ch', async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const ch = String(req.params.ch);
      const data = await fetchChapterDetail(id, ch);
      res.setHeader(
        'Cache-Control',
        'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/manga/:id/:ch error:', err);
      res.status(502).json({
        message: err instanceof Error ? err.message : 'Failed to fetch chapter images from MangaHook.',
      });
    }
  });

  router.get('/search/:query', async (req: Request, res: Response) => {
    try {
      const query = String(req.params.query || '');
      const page = Number(req.query.page ?? 1);
      const data = await searchManga(query, page);
      res.setHeader(
        'Cache-Control',
        'public, max-age=60, s-maxage=300, stale-while-revalidate=1800'
      );
      res.json(data);
    } catch (err) {
      console.error('GET /api/search/:query error:', err);
      res.status(502).json({
        message: err instanceof Error ? err.message : 'Failed to search MangaHook.',
      });
    }
  });

  // --- Image Proxy (bypasses CDN Referer / CORS blocks; caches covers + streams chapter pages) ---
  router.get('/proxy/image', async (req: Request, res: Response) => {
    const target = String(req.query.url || '');
    if (!target || (!target.startsWith('https://') && !target.startsWith('http://'))) {
      return res.status(400).send('Invalid image URL');
    }

    try {
      const parsed = new URL(target);
      const hostname = parsed.hostname.toLowerCase();
      const hostAllowed = allowedImageHosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`)
      );
      if (parsed.protocol !== 'https:' || !hostAllowed) {
        return res.status(403).send('Image host is not allowed');
      }

      // Fast path: serve cached cover thumbnails directly from memory (<1ms)
      const cached = getCachedCover(target);
      if (cached) {
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
        return res.send(cached.buf);
      }

      const isKakalotCdn =
        hostname.includes('2xstorage') ||
        hostname.includes('mangakakalove') ||
        hostname.includes('mangakakalot') ||
        hostname.includes('mkklcdn') ||
        hostname.includes('blazefast');

      const headers: Record<string, string> = {
        'User-Agent': isKakalotCdn
          ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
          : 'PolinMangaReader/1.0',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      };
      if (isKakalotCdn) {
        headers.Referer = 'https://www.mangakakalove.com/';
      }

      const upstream = await fetch(target, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (!upstream.ok) {
        return res.status(upstream.status).send('Failed to load image');
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        return res.status(415).send('Unsupported content type');
      }

      const contentLength = Number(upstream.headers.get('content-length') || '0');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');

      // Cache small covers in memory; stream large chapter pages directly to avoid RAM buffering
      if (contentLength > 0 && contentLength <= MAX_COVER_ITEM_BYTES) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        setCachedCover(target, buf, contentType);
        return res.send(buf);
      }

      if (upstream.body) {
        if (contentLength > 0) {
          res.setHeader('Content-Length', String(contentLength));
        }
        const nodeStream = Readable.fromWeb(upstream.body as unknown as WebReadableStream);
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
      setCachedCover(target, buf, contentType);
      res.send(buf);
    } catch (err) {
      console.error('Image proxy error:', err);
      if (!res.headersSent) {
        res.status(502).send('Image proxy error');
      }
    }
  });

  // --- Auth & User Library ---
  router.post('/auth/login', (req: Request, res: Response) => {
    const { email, given_name, family_name, demo } = req.body || {};
    const resolvedEmail = demo ? 'reader@polin.manga' : String(email || '').trim();
    if (!resolvedEmail) {
      return res.status(400).json({ message: 'Email is required.' });
    }
    const { user, session } = db.loginWithEmail({
      email: resolvedEmail,
      given_name: demo ? 'Manga' : given_name,
      family_name: demo ? 'Reader' : family_name,
    });
    res.json({
      access_token: session.token,
      refresh_token: session.refresh_token,
      expires_in: Math.floor((session.expires_at - Date.now()) / 1000),
      user,
    });
  });

  router.get('/auth/token/renew', (req: Request, res: Response) => {
    const refresh = String(req.query.refresh_token || '');
    const renewed = refresh ? db.renewSession(refresh) : null;
    if (!renewed) {
      return res.status(401).json({ message: 'Invalid refresh token.' });
    }
    res.json({
      access_token: renewed.token,
      refresh_token: renewed.refresh_token,
      expires_in: Math.floor((renewed.expires_at - Date.now()) / 1000),
    });
  });

  router.post('/auth/logout', (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (token) db.revokeToken(token);
    res.json({ ok: true });
  });

  router.get('/user/profile', requireAuth, (req: AuthRequest, res: Response) => {
    res.json(req.user);
  });

  router.get('/user/library', requireAuth, (req: AuthRequest, res: Response) => {
    res.json({
      bookmarks: db.getBookmarks(req.user!.id),
      history: db.getHistory(req.user!.id),
    });
  });

  router.put('/user/library', requireAuth, (req: AuthRequest, res: Response) => {
    const { manga_id, title, image, latest_chapter } = req.body || {};
    if (!manga_id || !title) {
      return res.status(400).json({ message: 'manga_id and title are required.' });
    }
    const saved = db.upsertBookmark(req.user!.id, {
      manga_id: String(manga_id),
      title: String(title),
      image: String(image || ''),
      latest_chapter: latest_chapter ? String(latest_chapter) : '',
    });
    res.json(saved);
  });

  router.delete('/user/library/:mangaId', requireAuth, (req: AuthRequest, res: Response) => {
    db.removeBookmark(req.user!.id, String(req.params.mangaId));
    res.json({ ok: true });
  });

  router.put('/user/history', requireAuth, (req: AuthRequest, res: Response) => {
    const { manga_id, manga_title, manga_image, chapter_id, chapter_name, page_index } =
      req.body || {};
    if (!manga_id || !chapter_id) {
      return res.status(400).json({ message: 'manga_id and chapter_id are required.' });
    }
    const saved = db.saveHistory(req.user!.id, {
      manga_id: String(manga_id),
      manga_title: String(manga_title || ''),
      manga_image: String(manga_image || ''),
      chapter_id: String(chapter_id),
      chapter_name: String(chapter_name || ''),
      page_index: Number(page_index) || 0,
    });
    res.json(saved);
  });

  return router;
}
