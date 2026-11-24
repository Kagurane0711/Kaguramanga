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

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', provider: 'MangaHook API' });
  });

  router.get('/genres', (_req: Request, res: Response) => {
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
      res.json(data);
    } catch (err) {
      console.error('GET /api/search/:query error:', err);
      res.status(502).json({
        message: err instanceof Error ? err.message : 'Failed to search MangaHook.',
      });
    }
  });

  // --- Image Proxy (bypasses CDN Referer / CORS blocks) ---
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

      const arrayBuf = await upstream.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(arrayBuf));
    } catch (err) {
      console.error('Image proxy error:', err);
      res.status(502).send('Image proxy error');
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
