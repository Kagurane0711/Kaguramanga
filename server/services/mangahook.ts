import { load } from 'cheerio';
import type {
  ChapterDetailResponse,
  MangaChapterItem,
  MangaDetailResponse,
  MangaListItem,
  MangaListMetaData,
  MangaListResponse,
  MetaOption,
  SearchResponse,
} from '../types.ts';

const MANGAKAKALOT_BASE = (
  process.env.MANGAKAKALOT_BASE_URL?.trim() || 'https://www.mangakakalove.com'
).replace(/\/+$/, '');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface CacheEntry<T> {
  value: T;
  freshUntil: number;
  staleUntil: number;
}

const responseCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.freshUntil) {
    if (Date.now() > hit.staleUntil) {
      responseCache.delete(key);
    }
    return null;
  }
  return hit.value as T;
}

function setCached<T>(key: string, value: T, freshMs: number, staleMs = freshMs * 4) {
  if (responseCache.size > 300) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  const now = Date.now();
  responseCache.set(key, {
    value,
    freshUntil: now + freshMs,
    staleUntil: now + Math.max(freshMs, staleMs),
  });
}

async function cachedFetch<T>(
  key: string,
  freshMs: number,
  staleMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = responseCache.get(key) as CacheEntry<T> | undefined;

  if (hit && now < hit.freshUntil) {
    return hit.value;
  }

  const startRefresh = (): Promise<T> => {
    const existing = inFlightRequests.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = fetcher()
      .then((value) => {
        setCached(key, value, freshMs, staleMs);
        return value;
      })
      .finally(() => {
        inFlightRequests.delete(key);
      });
    inFlightRequests.set(key, promise);
    return promise;
  };

  // Serve stale immediately while refreshing in the background
  if (hit && now < hit.staleUntil) {
    void startRefresh().catch(() => {
      // Keep serving stale entry until staleUntil expires
    });
    return hit.value;
  }

  return startRefresh();
}

export function toProxyImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/proxy/image')) return rawUrl;
  const absolute = rawUrl.startsWith('//')
    ? `https:${rawUrl}`
    : rawUrl.startsWith('/')
      ? `${MANGAKAKALOT_BASE}${rawUrl}`
      : rawUrl;
  return `/api/proxy/image?url=${encodeURIComponent(absolute)}`;
}

function getExternalBase(): string | null {
  const raw = process.env.MANGAHOOK_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function getExternalHeaders(): Record<string, string> {
  const key = process.env.MANGAHOOK_API_KEY?.trim();
  return key ? { 'x-api-key': key } : {};
}

async function fetchHtml(url: string, retries = 1): Promise<string> {
  let lastStatus = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `${MANGAKAKALOT_BASE}/`,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      return await res.text();
    }
    lastStatus = res.status;
    if ((res.status === 429 || res.status === 503) && attempt < retries) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      continue;
    }
    break;
  }
  throw new Error(`MangaHook upstream HTTP ${lastStatus} for ${url}`);
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
      Referer: `${MANGAKAKALOT_BASE}/`,
      ...headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`MangaHook upstream HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

function formatCompactCount(num?: number): string {
  if (num === undefined || num === null || !Number.isFinite(num)) return '—';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function formatShortDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function extractSlugFromHref(href?: string): string {
  if (!href) return '';
  try {
    const pathname = href.startsWith('http') ? new URL(href).pathname : href;
    const parts = pathname.split('/').filter(Boolean);
    const mangaIdx = parts.indexOf('manga');
    if (mangaIdx >= 0 && parts[mangaIdx + 1]) {
      return parts[mangaIdx + 1].trim();
    }
    return parts[parts.length - 1]?.trim() || '';
  } catch {
    return '';
  }
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export const GENRE_OPTIONS: MetaOption[] = [
  { id: 'all', type: 'All', name: 'All', group: 'all' },
  // Core Genres (27)
  { id: 'action', type: 'Action', name: 'Action', group: 'genre' },
  { id: 'adventure', type: 'Adventure', name: 'Adventure', group: 'genre' },
  { id: 'boys-love', type: "Boys' Love", name: "Boys' Love", group: 'genre' },
  { id: 'comedy', type: 'Comedy', name: 'Comedy', group: 'genre' },
  { id: 'crime', type: 'Crime', name: 'Crime', group: 'genre' },
  { id: 'drama', type: 'Drama', name: 'Drama', group: 'genre' },
  { id: 'ecchi', type: 'Ecchi', name: 'Ecchi', group: 'genre' },
  { id: 'fantasy', type: 'Fantasy', name: 'Fantasy', group: 'genre' },
  { id: 'girls-love', type: "Girls' Love", name: "Girls' Love", group: 'genre' },
  { id: 'historical', type: 'Historical', name: 'Historical', group: 'genre' },
  { id: 'horror', type: 'Horror', name: 'Horror', group: 'genre' },
  { id: 'isekai', type: 'Isekai', name: 'Isekai', group: 'genre' },
  { id: 'magical-girls', type: 'Magical Girls', name: 'Magical Girls', group: 'genre' },
  { id: 'mature', type: 'Mature', name: 'Mature', group: 'genre' },
  { id: 'mecha', type: 'Mecha', name: 'Mecha', group: 'genre' },
  { id: 'medical', type: 'Medical', name: 'Medical', group: 'genre' },
  { id: 'mystery', type: 'Mystery', name: 'Mystery', group: 'genre' },
  { id: 'philosophical', type: 'Philosophical', name: 'Philosophical', group: 'genre' },
  { id: 'psychological', type: 'Psychological', name: 'Psychological', group: 'genre' },
  { id: 'romance', type: 'Romance', name: 'Romance', group: 'genre' },
  { id: 'sci-fi', type: 'Sci-Fi', name: 'Sci-Fi', group: 'genre' },
  { id: 'slice-of-life', type: 'Slice of Life', name: 'Slice of Life', group: 'genre' },
  { id: 'sports', type: 'Sports', name: 'Sports', group: 'genre' },
  { id: 'superhero', type: 'Superhero', name: 'Superhero', group: 'genre' },
  { id: 'thriller', type: 'Thriller', name: 'Thriller', group: 'genre' },
  { id: 'tragedy', type: 'Tragedy', name: 'Tragedy', group: 'genre' },
  { id: 'wuxia', type: 'Wuxia', name: 'Wuxia', group: 'genre' },
  // Demographics (4)
  { id: 'shounen', type: 'Shounen', name: 'Shounen', group: 'demographic' },
  { id: 'seinen', type: 'Seinen', name: 'Seinen', group: 'demographic' },
  { id: 'shoujo', type: 'Shoujo', name: 'Shoujo', group: 'demographic' },
  { id: 'josei', type: 'Josei', name: 'Josei', group: 'demographic' },
  // Themes (36)
  { id: 'aliens', type: 'Aliens', name: 'Aliens', group: 'theme' },
  { id: 'animals', type: 'Animals', name: 'Animals', group: 'theme' },
  { id: 'cooking', type: 'Cooking', name: 'Cooking', group: 'theme' },
  { id: 'crossdressing', type: 'Crossdressing', name: 'Crossdressing', group: 'theme' },
  { id: 'delinquents', type: 'Delinquents', name: 'Delinquents', group: 'theme' },
  { id: 'demons', type: 'Demons', name: 'Demons', group: 'theme' },
  { id: 'genderswap', type: 'Genderswap', name: 'Genderswap', group: 'theme' },
  { id: 'ghosts', type: 'Ghosts', name: 'Ghosts', group: 'theme' },
  { id: 'gore', type: 'Gore', name: 'Gore', group: 'theme' },
  { id: 'gyaru', type: 'Gyaru', name: 'Gyaru', group: 'theme' },
  { id: 'harem', type: 'Harem', name: 'Harem', group: 'theme' },
  { id: 'mafia', type: 'Mafia', name: 'Mafia', group: 'theme' },
  { id: 'magic', type: 'Magic', name: 'Magic', group: 'theme' },
  { id: 'mahjong', type: 'Mahjong', name: 'Mahjong', group: 'theme' },
  { id: 'martial-arts', type: 'Martial Arts', name: 'Martial Arts', group: 'theme' },
  { id: 'military', type: 'Military', name: 'Military', group: 'theme' },
  { id: 'monster-girls', type: 'Monster Girls', name: 'Monster Girls', group: 'theme' },
  { id: 'monsters', type: 'Monsters', name: 'Monsters', group: 'theme' },
  { id: 'music', type: 'Music', name: 'Music', group: 'theme' },
  { id: 'ninja', type: 'Ninja', name: 'Ninja', group: 'theme' },
  { id: 'office-workers', type: 'Office Workers', name: 'Office Workers', group: 'theme' },
  { id: 'police', type: 'Police', name: 'Police', group: 'theme' },
  { id: 'post-apocalyptic', type: 'Post-Apocalyptic', name: 'Post-Apocalyptic', group: 'theme' },
  { id: 'reincarnation', type: 'Reincarnation', name: 'Reincarnation', group: 'theme' },
  { id: 'reverse-harem', type: 'Reverse Harem', name: 'Reverse Harem', group: 'theme' },
  { id: 'samurai', type: 'Samurai', name: 'Samurai', group: 'theme' },
  { id: 'school-life', type: 'School Life', name: 'School Life', group: 'theme' },
  { id: 'supernatural', type: 'Supernatural', name: 'Supernatural', group: 'theme' },
  { id: 'survival', type: 'Survival', name: 'Survival', group: 'theme' },
  { id: 'time-travel', type: 'Time Travel', name: 'Time Travel', group: 'theme' },
  { id: 'traditional-games', type: 'Traditional Games', name: 'Traditional Games', group: 'theme' },
  { id: 'vampires', type: 'Vampires', name: 'Vampires', group: 'theme' },
  { id: 'video-games', type: 'Video Games', name: 'Video Games', group: 'theme' },
  { id: 'villainess', type: 'Villainess', name: 'Villainess', group: 'theme' },
  { id: 'virtual-reality', type: 'Virtual Reality', name: 'Virtual Reality', group: 'theme' },
  { id: 'zombies', type: 'Zombies', name: 'Zombies', group: 'theme' },
  // Formats (12)
  { id: '4-koma', type: '4-Koma', name: '4-Koma', group: 'format' },
  { id: 'adaptation', type: 'Adaptation', name: 'Adaptation', group: 'format' },
  { id: 'anthology', type: 'Anthology', name: 'Anthology', group: 'format' },
  { id: 'award-winning', type: 'Award Winning', name: 'Award Winning', group: 'format' },
  { id: 'doujinshi', type: 'Doujinshi', name: 'Doujinshi', group: 'format' },
  { id: 'fan-colored', type: 'Fan Colored', name: 'Fan Colored', group: 'format' },
  { id: 'full-color', type: 'Full Color', name: 'Full Color', group: 'format' },
  { id: 'long-strip', type: 'Long Strip', name: 'Long Strip', group: 'format' },
  { id: 'official-colored', type: 'Official Colored', name: 'Official Colored', group: 'format' },
  { id: 'oneshot', type: 'Oneshot', name: 'Oneshot', group: 'format' },
  { id: 'self-published', type: 'Self-Published', name: 'Self-Published', group: 'format' },
  { id: 'web-comic', type: 'Web Comic', name: 'Web Comic', group: 'format' },
];

const CATEGORY_ALIASES: Record<string, string> = {
  'one-shot': 'oneshot',
  'gender-bender': 'genderswap',
  'sci fi': 'sci-fi',
  'shounen-ai': 'boys-love',
  'shoujo-ai': 'girls-love',
  'yaoi': 'boys-love',
  'bl': 'boys-love',
  'yuri': 'girls-love',
  'gl': 'girls-love',
  'webtoons': 'long-strip',
};

const MANGADEX_API_BASE = 'https://api.mangadex.org';
const DEMOGRAPHIC_SLUGS = new Set(['shounen', 'seinen', 'shoujo', 'josei']);

interface MangaDexTag {
  id: string;
  attributes: {
    name: Record<string, string>;
    group: string;
  };
}

interface MangaDexListItem {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles?: Array<Record<string, string>>;
    description?: Record<string, string>;
    originalLanguage?: string;
    lastChapter?: string | null;
    status?: string;
    updatedAt?: string;
    tags?: MangaDexTag[];
  };
  relationships?: Array<{
    type: string;
    attributes?: {
      fileName?: string;
      name?: string;
    };
  }>;
}

interface MangaDexListResponse {
  data: MangaDexListItem[];
  total: number;
  limit: number;
  offset: number;
}

interface MangaDexFeedChapter {
  id: string;
  attributes: {
    volume?: string | null;
    chapter?: string | null;
    title?: string | null;
    pages?: number;
    externalUrl?: string | null;
    publishAt?: string;
    readableAt?: string;
    updatedAt?: string;
  };
}

interface MangaDexAtHomeResponse {
  baseUrl: string;
  chapter?: {
    hash: string;
    data?: string[];
    dataSaver?: string[];
  };
}

interface ResolvedHookCard {
  id: string;
  image: string;
  title: string;
  chapter: string;
  view: string;
}

interface SlugCacheEntry {
  value: ResolvedHookCard | null;
  expiresAt: number;
}

const slugMatchCache = new Map<string, SlugCacheEntry>();
const mdToHookSlugCache = new Map<string, string>();

function getCachedSlugMatch(key: string): { hit: boolean; value: ResolvedHookCard | null } {
  const entry = slugMatchCache.get(key);
  if (!entry) return { hit: false, value: null };
  if (Date.now() > entry.expiresAt) {
    slugMatchCache.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: entry.value };
}

function setCachedSlugMatch(key: string, value: ResolvedHookCard | null) {
  if (slugMatchCache.size > 2000) {
    const firstKey = slugMatchCache.keys().next().value;
    if (firstKey) slugMatchCache.delete(firstKey);
  }
  slugMatchCache.set(key, { value, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
}

function normalizeTitle(str: string): string {
  return str
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreTitleMatch(candidate: string, targets: string[]): number {
  const cNorm = normalizeTitle(candidate);
  if (!cNorm) return 0;
  const cTokens = new Set(cNorm.split(' ').filter((w) => w.length > 1));
  let best = 0;

  for (const target of targets) {
    const tNorm = normalizeTitle(target);
    if (!tNorm) continue;
    if (cNorm === tNorm) return 1;
    if (cNorm.includes(tNorm) || tNorm.includes(cNorm)) {
      const lenRatio =
        Math.min(cNorm.length, tNorm.length) / Math.max(cNorm.length, tNorm.length);
      best = Math.max(best, lenRatio);
    }
    const tTokens = tNorm.split(' ').filter((w) => w.length > 1);
    if (tTokens.length === 0) continue;
    const hits = tTokens.filter((w) => cTokens.has(w)).length;
    const jaccard = hits / Math.max(tTokens.length, cTokens.size);
    const coverage = hits / tTokens.length;
    best = Math.max(best, jaccard * 0.6 + coverage * 0.4);
  }
  return best;
}

async function getMangaDexTagMap(): Promise<Map<string, string>> {
  const cached = getCached<Map<string, string>>('md:tags');
  if (cached) return cached;

  const res = await fetch(`${MANGADEX_API_BASE}/manga/tag`, {
    headers: { 'User-Agent': 'KaguraMangaReader/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`MangaDex tag HTTP ${res.status}`);
  const json = (await res.json()) as { data?: MangaDexTag[] };
  const map = new Map<string, string>();
  for (const tag of json.data || []) {
    const en = tag.attributes?.name?.en;
    if (!en) continue;
    const slug = en
      .toLowerCase()
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    map.set(slug, tag.id);
    map.set(en.toLowerCase(), tag.id);
  }
  setCached('md:tags', map, 24 * 60 * 60 * 1000);
  return map;
}

function extractCandidateTitles(item: MangaDexListItem, origin: 'manga' | 'manhwa'): string[] {
  const primaryEn = item.attributes.title?.en;
  const primaryOther = Object.values(item.attributes.title || {});
  const altEn = (item.attributes.altTitles || [])
    .map((a) => a.en)
    .filter((v): v is string => Boolean(v));
  const altRomanized = (item.attributes.altTitles || [])
    .map((a) => (origin === 'manhwa' ? a['ko-ro'] : a['ja-ro']))
    .filter((v): v is string => Boolean(v));

  const ordered =
    origin === 'manhwa'
      ? [...altEn, primaryEn, ...primaryOther, ...altRomanized]
      : [primaryEn, ...altEn, ...primaryOther, ...altRomanized];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of ordered) {
    if (!t || !/[a-zA-Z]{2,}/.test(t)) continue;
    const key = normalizeTitle(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(t.trim());
  }
  return result;
}

function extractMangaDexCover(item: MangaDexListItem): string {
  const rel = (item.relationships || []).find((r) => r.type === 'cover_art');
  const fileName = rel?.attributes?.fileName;
  if (!fileName) return '';
  return toProxyImageUrl(`https://uploads.mangadex.org/covers/${item.id}/${fileName}.512.jpg`);
}

function extractMangaDexDescription(item: MangaDexListItem): string {
  const raw =
    item.attributes.description?.en ||
    Object.values(item.attributes.description || {})[0] ||
    '';
  return raw
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveOnMangaHook(
  cacheId: string,
  candidateTitles: string[]
): Promise<ResolvedHookCard | null> {
  const cached = getCachedSlugMatch(cacheId);
  if (cached.hit) return cached.value;

  const triedSlugs = new Set<string>();
  for (const query of candidateTitles.slice(0, 2)) {
    const slugQuery = query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!slugQuery || triedSlugs.has(slugQuery)) continue;
    triedSlugs.add(slugQuery);

    try {
      const html = await fetchHtml(
        `${MANGAKAKALOT_BASE}/search/story/${encodeURIComponent(slugQuery)}`
      );
      const $ = load(html);
      let bestCard: ResolvedHookCard | null = null;
      let bestScore = 0;

      $('.panel_story_list .story_item')
        .slice(0, 6)
        .each((_, el) => {
          const card = $(el);
          const link = card.find('h3.story_name a, a').first();
          const href = link.attr('href') || '';
          const id = extractSlugFromHref(href);
          const title = card.find('h3.story_name a').first().text().trim() || link.text().trim();
          if (!id || !title) return;

          const score = scoreTitleMatch(title, candidateTitles);
          if (score > bestScore) {
            bestScore = score;
            const imgEl = card.find('img').first();
            const rawImage = imgEl.attr('src') || imgEl.attr('data-src') || '';
            const chapter = card.find('.story_chapter a').first().text().trim() || 'Latest';
            let view = '—';
            card.find('.story_item_right span').each((__, sp) => {
              const txt = $(sp).text().replace(/\s+/g, ' ').trim();
              if (/^View\s*:/i.test(txt)) {
                view = txt.replace(/^View\s*:\s*/i, '').trim() || '—';
              }
            });
            bestCard = {
              id,
              image: toProxyImageUrl(rawImage),
              title,
              chapter,
              view,
            };
          }
        });

      if (bestCard && bestScore >= 0.55) {
        setCachedSlugMatch(cacheId, bestCard);
        return bestCard;
      }
    } catch {
      // Try next candidate title on transient search error
    }
  }

  setCachedSlugMatch(cacheId, null);
  return null;
}

function resolveCategorySlug(category: string): string {
  const clean = category.trim().toLowerCase();
  if (!clean || clean === 'all' || clean === 'none') return 'all';
  const normalized = clean
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (CATEGORY_ALIASES[clean]) return CATEGORY_ALIASES[clean];
  if (CATEGORY_ALIASES[normalized]) return CATEGORY_ALIASES[normalized];
  const match = GENRE_OPTIONS.find(
    (g) => g.id.toLowerCase() === normalized || (g.name || '').toLowerCase() === clean
  );
  if (match) return match.id;
  return normalized;
}

function parsePagination($: ReturnType<typeof load>): {
  totalStories: number;
  totalPages: number;
} {
  const qtyText = $('.panel_page_number .group_qty').text();
  const totalMatch = qtyText.match(/Total:\s*([\d,]+)/i);
  const totalStories = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0;

  const lastHrefText = $('.panel_page_number .page_last').text();
  const lastMatch = lastHrefText.match(/Last\((\d+)\)/i);
  let totalPages = lastMatch ? Number(lastMatch[1]) : 0;

  if (!totalPages) {
    $('.panel_page_number .group_page a').each((_, el) => {
      const txt = $(el).text().trim();
      if (/^\d+$/.test(txt)) {
        totalPages = Math.max(totalPages, Number(txt));
      }
      const href = $(el).attr('href') || '';
      const pageParam = href.match(/[?&]page=(\d+)/);
      if (pageParam) {
        totalPages = Math.max(totalPages, Number(pageParam[1]));
      }
    });
  }

  return {
    totalStories,
    totalPages: Math.max(1, totalPages || 1),
  };
}

function extractPrimaryTitle(item: MangaDexListItem, origin: 'manga' | 'manhwa'): string {
  const candidates = extractCandidateTitles(item, origin);
  if (candidates.length > 0) return candidates[0];
  const primary = item.attributes.title?.en || Object.values(item.attributes.title || {})[0];
  return primary?.trim() || 'Untitled';
}

function formatMangaDexStatus(status?: string): string {
  if (!status) return 'Ongoing';
  const s = status.toLowerCase();
  if (s === 'completed') return 'Completed';
  if (s === 'hiatus') return 'Hiatus';
  if (s === 'cancelled') return 'Cancelled';
  return 'Ongoing';
}

async function fetchMangaDexStats(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  try {
    const qs = new URLSearchParams();
    for (const id of ids) qs.append('manga[]', id);
    const res = await fetch(`${MANGADEX_API_BASE}/statistics/manga?${qs.toString()}`, {
      headers: { 'User-Agent': 'KaguraMangaReader/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(3_500),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as {
      statistics?: Record<string, { follows?: number }>;
    };
    const out: Record<string, number> = {};
    for (const [id, stat] of Object.entries(json.statistics || {})) {
      if (typeof stat?.follows === 'number') {
        out[id] = stat.follows;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchMangaDexSeries(mdUuid: string): Promise<MangaDexListItem> {
  return cachedFetch<MangaDexListItem>(`md:series:${mdUuid}`, 10 * 60_000, 60 * 60_000, async () => {
    const qs = new URLSearchParams();
    qs.append('includes[]', 'cover_art');
    qs.append('includes[]', 'author');
    qs.append('includes[]', 'artist');
    const res = await fetch(`${MANGADEX_API_BASE}/manga/${encodeURIComponent(mdUuid)}?${qs.toString()}`, {
      headers: { 'User-Agent': 'KaguraMangaReader/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`MangaDex series HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data?: MangaDexListItem };
    if (!json.data) throw new Error('MangaDex series not found');
    return json.data;
  });
}

async function fetchMangaDexChapters(mdUuid: string): Promise<MangaChapterItem[]> {
  return cachedFetch<MangaChapterItem[]>(`md:chapters:${mdUuid}`, 5 * 60_000, 30 * 60_000, async () => {
    const qs = new URLSearchParams();
    qs.append('translatedLanguage[]', 'en');
    qs.set('includeExternalUrl', '0');
    qs.set('order[chapter]', 'desc');
    qs.set('limit', '500');
    const res = await fetch(
      `${MANGADEX_API_BASE}/manga/${encodeURIComponent(mdUuid)}/feed?${qs.toString()}`,
      {
        headers: { 'User-Agent': 'KaguraMangaReader/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: MangaDexFeedChapter[] };
    const raw = (json.data || []).filter(
      (c) => !c.attributes.externalUrl && (c.attributes.pages ?? 0) > 0
    );

    // Deduplicate same chapter number by keeping the upload with the most pages
    const byChapterKey = new Map<string, MangaDexFeedChapter>();
    for (const ch of raw) {
      const key = ch.attributes.chapter?.trim() || ch.id;
      const existing = byChapterKey.get(key);
      if (!existing || (ch.attributes.pages ?? 0) > (existing.attributes.pages ?? 0)) {
        byChapterKey.set(key, ch);
      }
    }

    return Array.from(byChapterKey.values()).map((ch) => {
      const chNum = ch.attributes.chapter?.trim();
      const chTitle = ch.attributes.title?.trim();
      const baseName = chNum ? `Chapter ${chNum}` : 'Oneshot';
      const fullName = chTitle ? `${baseName}: ${chTitle}` : baseName;
      return {
        id: `mdch-${ch.id}`,
        path: `/chapter/md-${mdUuid}/mdch-${ch.id}`,
        name: fullName,
        view: `${ch.attributes.pages ?? 0}p`,
        createdAt: formatShortDate(
          ch.attributes.readableAt || ch.attributes.publishAt || ch.attributes.updatedAt
        ),
      };
    });
  });
}

async function fetchMangaDexChapterImages(
  chapterUuid: string
): Promise<ChapterDetailResponse['images']> {
  const res = await fetch(
    `${MANGADEX_API_BASE}/at-home/server/${encodeURIComponent(chapterUuid)}`,
    {
      headers: { 'User-Agent': 'KaguraMangaReader/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    }
  );
  if (!res.ok) {
    throw new Error(`MangaDex chapter server HTTP ${res.status}`);
  }
  const json = (await res.json()) as MangaDexAtHomeResponse;
  const baseUrl = (json.baseUrl || '').replace(/\/+$/, '');
  const hash = json.chapter?.hash || '';
  const files = json.chapter?.data || json.chapter?.dataSaver || [];
  const mode = json.chapter?.data?.length ? 'data' : 'data-saver';
  if (!baseUrl || !hash) return [];

  return files.map((file, idx) => ({
    title: `Page ${idx + 1}`,
    image: toProxyImageUrl(`${baseUrl}/${mode}/${hash}/${file}`),
  }));
}

function mapMangaDexItemsToList(
  items: MangaDexListItem[],
  stats: Record<string, number>,
  origin: 'manga' | 'manhwa'
): MangaListItem[] {
  return dedupeById(
    items.map((item) => {
      const follows = stats[item.id];
      const lastCh = item.attributes.lastChapter?.trim();
      const chapter = lastCh
        ? `Chapter ${lastCh}`
        : formatMangaDexStatus(item.attributes.status);
      return {
        id: `md-${item.id}`,
        image: extractMangaDexCover(item),
        title: extractPrimaryTitle(item, origin),
        chapter,
        view: follows !== undefined ? formatCompactCount(follows) : '—',
        description: extractMangaDexDescription(item),
      };
    })
  );
}

const MANGADEX_MAX_WINDOW = 10_000;
const DEMOGRAPHIC_BUCKETS = ['shounen', 'seinen', 'shoujo', 'josei', 'none'] as const;
const latestTotalsByFilter = new Map<string, { totalStories: number; totalPages: number }>();

function recordLatestFilterTotal(filterKey: string, totalStories: number, pageSize = 24) {
  if (!Number.isFinite(totalStories) || totalStories < 0) return;
  const totalPages = Math.max(1, Math.ceil(totalStories / pageSize));
  if (latestTotalsByFilter.size > 500) {
    const oldestKey = latestTotalsByFilter.keys().next().value;
    if (oldestKey) latestTotalsByFilter.delete(oldestKey);
  }
  latestTotalsByFilter.set(filterKey, { totalStories, totalPages });
  setCached(`md-total:${filterKey}`, totalStories, 2 * 60_000, 5 * 60_000);
}

async function fetchOriginSeparatedList(params: {
  page: number;
  type: string;
  state: string;
  categorySlug: string;
  origin: 'manga' | 'manhwa';
}): Promise<MangaListResponse> {
  const { page, type, state, categorySlug, origin } = params;
  const pageSize = 24;
  const tagMap = await getMangaDexTagMap();

  const baseQs = new URLSearchParams();
  baseQs.append('includes[]', 'cover_art');
  if (categorySlug === 'ecchi') {
    baseQs.append('contentRating[]', 'suggestive');
  } else if (categorySlug === 'mature') {
    baseQs.append('contentRating[]', 'suggestive');
    baseQs.append('contentRating[]', 'erotica');
  } else {
    baseQs.append('contentRating[]', 'safe');
    baseQs.append('contentRating[]', 'suggestive');
  }
  baseQs.append('availableTranslatedLanguage[]', 'en');
  baseQs.set('hasAvailableChapters', 'true');

  if (origin === 'manhwa') {
    // Strictly Korean Manhwa only
    baseQs.append('originalLanguage[]', 'ko');
  } else {
    // Strictly Japanese Manga only — exclude vertical Long Strip webtoons unless explicitly requested
    baseQs.append('originalLanguage[]', 'ja');
    const longStripId = tagMap.get('long-strip');
    if (longStripId && categorySlug !== 'long-strip' && categorySlug !== 'webtoons') {
      baseQs.append('excludedTags[]', longStripId);
    }
  }

  const orderKey =
    type === 'topview' || type === 'top read'
      ? 'followedCount'
      : type === 'newest'
        ? 'createdAt'
        : 'latestUploadedChapter';

  if (state === 'ongoing') {
    baseQs.append('status[]', 'ongoing');
  } else if (state === 'completed') {
    baseQs.append('status[]', 'completed');
  }

  if (
    categorySlug !== 'all' &&
    categorySlug !== 'manhwa' &&
    categorySlug !== 'ecchi' &&
    categorySlug !== 'mature'
  ) {
    if (DEMOGRAPHIC_SLUGS.has(categorySlug)) {
      baseQs.append('publicationDemographic[]', categorySlug);
    } else {
      const tagId = tagMap.get(categorySlug);
      if (tagId) {
        baseQs.append('includedTags[]', tagId);
      }
    }
  }

  const fetchMdSlice = async (
    offset: number,
    limit: number,
    dir: 'desc' | 'asc',
    demographic?: string
  ): Promise<MangaDexListResponse> => {
    const qs = new URLSearchParams(baseQs);
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const safeOffset = Math.max(0, Math.min(offset, MANGADEX_MAX_WINDOW - safeLimit));
    qs.set('limit', String(safeLimit));
    qs.set('offset', String(safeOffset));
    qs.set(`order[${orderKey}]`, dir);
    if (demographic) {
      qs.append('publicationDemographic[]', demographic);
    }
    const res = await fetch(`${MANGADEX_API_BASE}/manga?${qs.toString()}`, {
      headers: { 'User-Agent': 'KaguraMangaReader/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`Origin catalog HTTP ${res.status}`);
    }
    return (await res.json()) as MangaDexListResponse;
  };

  const fetchBucketWindow = async (
    demographic: string | undefined,
    bucketTotal: number,
    sliceStart: number,
    sliceCount: number
  ): Promise<MangaDexListItem[]> => {
    if (bucketTotal <= 0 || sliceCount <= 0) return [];
    const clampedStart = Math.max(0, Math.min(sliceStart, bucketTotal - 1));
    const sliceEnd = Math.min(clampedStart + sliceCount, bucketTotal);
    const count = sliceEnd - clampedStart;
    if (count <= 0) return [];

    if (clampedStart + count <= MANGADEX_MAX_WINDOW) {
      const data = await fetchMdSlice(clampedStart, count, 'desc', demographic);
      return data.data || [];
    }

    const ascOffset = Math.max(0, bucketTotal - sliceEnd);
    const data = await fetchMdSlice(ascOffset, count, 'asc', demographic);
    return [...(data.data || [])].reverse();
  };

  const requestedOffset = (page - 1) * pageSize;
  const filterKey = `${origin}:${type}:${state}:${categorySlug}`;

  let allItems: MangaDexListItem[] = [];
  let totalStories = 0;

  if (requestedOffset + pageSize <= MANGADEX_MAX_WINDOW) {
    // Fast path (pages 1..416): single direct MangaDex query
    const mdData = await fetchMdSlice(requestedOffset, pageSize, 'desc');
    allItems = mdData.data || [];
    totalStories =
      typeof mdData.total === 'number' && mdData.total >= 0 ? mdData.total : allItems.length;
    recordLatestFilterTotal(filterKey, totalStories, pageSize);
  } else {
    // Deep page (> 416): look up latest catalog total then serve via tail inversion or disjoint demographic partitions
    totalStories = await cachedFetch<number>(
      `md-total:${filterKey}`,
      2 * 60_000,
      5 * 60_000,
      async () => {
        const probe = await fetchMdSlice(0, 1, 'desc');
        const count = typeof probe.total === 'number' && probe.total >= 0 ? probe.total : 0;
        recordLatestFilterTotal(filterKey, count, pageSize);
        return count;
      }
    );

    const exactPages = Math.max(1, Math.ceil(totalStories / pageSize));
    const effectivePage = Math.min(page, exactPages);
    const start = (effectivePage - 1) * pageSize;
    const end = Math.min(start + pageSize, totalStories);
    const needed = Math.max(0, end - start);

    if (needed === 0) {
      allItems = [];
    } else if (start + needed <= MANGADEX_MAX_WINDOW) {
      // Requested page exceeded totalPages and clamped back into the first 10,000 items
      const mdData = await fetchMdSlice(start, needed, 'desc');
      allItems = mdData.data || [];
      if (typeof mdData.total === 'number' && mdData.total >= 0) {
        totalStories = mdData.total;
        recordLatestFilterTotal(filterKey, totalStories, pageSize);
      }
    } else if (totalStories - start <= MANGADEX_MAX_WINDOW) {
      // Tail window (last 10,000 items): exact global ordering via ascending sort inversion
      const ascOffset = Math.max(0, totalStories - end);
      const mdData = await fetchMdSlice(ascOffset, needed, 'asc');
      allItems = [...(mdData.data || [])].reverse();
      if (typeof mdData.total === 'number' && mdData.total >= 0) {
        totalStories = mdData.total;
        recordLatestFilterTotal(filterKey, totalStories, pageSize);
      }
    } else if (DEMOGRAPHIC_SLUGS.has(categorySlug)) {
      // Already filtered by a single demographic: serve closest reachable boundary without corrupting totalStories
      const mdData = await fetchMdSlice(MANGADEX_MAX_WINDOW - needed, needed, 'desc');
      allItems = mdData.data || [];
      if (typeof mdData.total === 'number' && mdData.total >= 0) {
        totalStories = mdData.total;
        recordLatestFilterTotal(filterKey, totalStories, pageSize);
      }
    } else {
      // Middle band (> 10,000 from both start and end): traverse disjoint demographic partitions
      const topBoundary = Math.floor(MANGADEX_MAX_WINDOW / pageSize) * pageSize; // 9,984
      const bottomBoundary = topBoundary;

      const bucketTotals = await cachedFetch<Array<{ demo: string; total: number }>>(
        `md-buckets:${filterKey}`,
        5 * 60_000,
        15 * 60_000,
        async () =>
          Promise.all(
            DEMOGRAPHIC_BUCKETS.map(async (demo) => {
              const probe = await fetchMdSlice(0, 1, 'desc', demo);
              return { demo, total: typeof probe.total === 'number' ? probe.total : 0 };
            })
          )
      );

      const sumBuckets = Math.max(
        1,
        bucketTotals.reduce((acc, b) => acc + b.total, 0)
      );

      const partitions = bucketTotals
        .filter((b) => b.total > 0)
        .map((b) => {
          const skipTop = Math.floor((b.total * topBoundary) / sumBuckets);
          const skipBottom = Math.floor((b.total * bottomBoundary) / sumBuckets);
          const midSize = Math.max(0, b.total - skipTop - skipBottom);
          return { ...b, skipTop, midSize };
        })
        .filter((b) => b.midSize > 0);

      let cursor = Math.max(0, start - topBoundary);
      let remaining = needed;
      const collected: MangaDexListItem[] = [];

      for (const part of partitions) {
        if (remaining <= 0) break;
        if (cursor >= part.midSize) {
          cursor -= part.midSize;
          continue;
        }
        const take = Math.min(remaining, part.midSize - cursor);
        const chunk = await fetchBucketWindow(part.demo, part.total, part.skipTop + cursor, take);
        collected.push(...chunk);
        remaining -= take;
        cursor = 0;
      }

      allItems = collected;
    }
  }

  const stats = await fetchMangaDexStats(allItems.map((i) => i.id));
  const mangaList = mapMangaDexItemsToList(allItems, stats, origin);

  const totalPages = Math.max(1, Math.ceil(totalStories / pageSize));

  const metaData: MangaListMetaData = {
    totalStories,
    totalPages,
    type: [
      { id: 'latest', type: 'Latest', name: 'Latest' },
      { id: 'topview', type: 'Top Read', name: 'Top Read' },
      { id: 'newest', type: 'Newest', name: 'Newest' },
    ],
    state: [
      { id: 'all', type: 'All', name: 'All' },
      { id: 'Ongoing', type: 'Ongoing', name: 'Ongoing' },
      { id: 'Completed', type: 'Completed', name: 'Completed' },
    ],
    category: GENRE_OPTIONS,
  };

  return { mangaList, metaData };
}

export async function fetchMangaList(
  params: {
    page?: number;
    type?: string;
    state?: string;
    category?: string;
    origin?: 'manga' | 'manhwa';
  },
  options: { prefetchNext?: boolean } = { prefetchNext: true }
): Promise<MangaListResponse> {
  const page = Math.max(1, Number(params.page) || 1);
  const type = (params.type || 'latest').toLowerCase();
  const state = (params.state || 'all').toLowerCase();
  const category = params.category || 'all';
  const categorySlug = resolveCategorySlug(category);
  const origin: 'manga' | 'manhwa' =
    params.origin ||
    (categorySlug === 'manhwa' || categorySlug === 'webtoons' ? 'manhwa' : 'manga');

  const externalBase = getExternalBase();
  if (externalBase) {
    const qs = new URLSearchParams({
      page: String(page),
      type,
      state,
      category,
    });
    const data = await fetchJson<MangaListResponse>(
      `${externalBase}/api/mangaList?${qs.toString()}`,
      getExternalHeaders()
    );
    return {
      ...data,
      mangaList: (data.mangaList || []).map((m) => ({
        ...m,
        image: toProxyImageUrl(m.image),
      })),
    };
  }

  const filterKey = `${origin}:${type}:${state}:${categorySlug}`;
  const cacheKey = `list:${origin}:${page}:${type}:${state}:${categorySlug}`;
  const payload = await cachedFetch<MangaListResponse>(
    cacheKey,
    2 * 60_000,
    10 * 60_000,
    async () => {
      try {
        const separated = await fetchOriginSeparatedList({
          page,
          type,
          state,
          categorySlug,
          origin,
        });
        if (separated.mangaList.length > 0) {
          return separated;
        }
      } catch (err) {
        console.warn(`Origin-separated ${origin} catalog fallback triggered:`, err);
      }

      // Fallback directly to MangaKakalove genre list if origin index is temporarily unavailable
      let path: string;
      if (origin === 'manhwa') {
        const fallbackGenre = categorySlug === 'webtoons' ? 'webtoons' : 'manhwa';
        path = `/genre/${encodeURIComponent(fallbackGenre)}?page=${page}`;
      } else if (categorySlug !== 'all') {
        const qs = new URLSearchParams({ page: String(page) });
        if (type) qs.set('type', type);
        if (state !== 'all') qs.set('state', state);
        path = `/genre/${encodeURIComponent(categorySlug)}?${qs.toString()}`;
      } else {
        path = `/genre/manga?page=${page}`;
      }

      const html = await fetchHtml(`${MANGAKAKALOT_BASE}${path}`);
      const $ = load(html);

      const mangaList: MangaListItem[] = [];
      $('.list-comic-item-wrap').each((_, el) => {
        const card = $(el);
        const link = card.find('a.list-story-item, h3 a').first();
        const href = link.attr('href') || '';
        const id = extractSlugFromHref(href);
        const title = card.find('h3 a').first().text().trim() || link.attr('title')?.trim() || '';
        if (!id || !title) return;

        const imgEl = card.find('img').first();
        const rawImage = imgEl.attr('data-src') || imgEl.attr('src') || '';
        const chapter = card.find('.list-story-item-wrap-chapter').first().text().trim() || 'Latest';
        const view = card.find('.aye_icon').first().text().trim() || '—';
        const description = card
          .find('p')
          .first()
          .text()
          .replace(/\s+/g, ' ')
          .replace(/More\.?\s*$/i, '')
          .trim();

        mangaList.push({
          id,
          image: toProxyImageUrl(rawImage),
          title,
          chapter,
          view,
          description,
        });
      });

      const uniqueMangaList = dedupeById(mangaList);
      const { totalStories, totalPages } = parsePagination($);
      const metaData: MangaListMetaData = {
        totalStories: totalStories || uniqueMangaList.length,
        totalPages,
        type: [
          { id: 'latest', type: 'Latest', name: 'Latest' },
          { id: 'topview', type: 'Top Read', name: 'Top Read' },
          { id: 'newest', type: 'Newest', name: 'Newest' },
        ],
        state: [
          { id: 'all', type: 'All', name: 'All' },
          { id: 'Ongoing', type: 'Ongoing', name: 'Ongoing' },
          { id: 'Completed', type: 'Completed', name: 'Completed' },
        ],
        category: GENRE_OPTIONS,
      };

      return { mangaList: uniqueMangaList, metaData };
    }
  );

  // Prefetch next page in the background on long-lived servers (skip on stateless Vercel serverless)
  if (
    !process.env.VERCEL &&
    options.prefetchNext !== false &&
    page < payload.metaData.totalPages &&
    page <= 10
  ) {
    const nextKey = `list:${origin}:${page + 1}:${type}:${state}:${categorySlug}`;
    if (!getCached(nextKey) && !inFlightRequests.has(nextKey)) {
      void fetchMangaList(
        { page: page + 1, type, state, category, origin },
        { prefetchNext: false }
      ).catch(() => {
        // Ignore background prefetch errors
      });
    }
  }

  const latestTotal = latestTotalsByFilter.get(filterKey);
  if (
    latestTotal &&
    (payload.metaData.totalStories !== latestTotal.totalStories ||
      payload.metaData.totalPages !== latestTotal.totalPages)
  ) {
    return {
      ...payload,
      metaData: {
        ...payload.metaData,
        totalStories: latestTotal.totalStories,
        totalPages: latestTotal.totalPages,
      },
    };
  }

  return payload;
}

export function warmCatalogCaches(): void {
  // Pre-warm primary Discover pages on startup so first visitors hit warm cache
  void fetchMangaList({ page: 1, type: 'latest', state: 'all', category: 'all', origin: 'manga' }, { prefetchNext: false }).catch(() => {});
  void fetchMangaList({ page: 1, type: 'latest', state: 'all', category: 'all', origin: 'manhwa' }, { prefetchNext: false }).catch(() => {});
}

interface MirrorChaptersApiResponse {
  success: boolean;
  data?: {
    chapters?: Array<{
      chapter_name: string;
      chapter_slug: string;
      chapter_num: number;
      updated_at?: string;
      view?: number;
    }>;
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    };
  };
}

async function fetchAllChapters(slug: string): Promise<MangaChapterItem[]> {
  const limit = 500;
  let offset = 0;
  const collected: NonNullable<NonNullable<MirrorChaptersApiResponse['data']>['chapters']> = [];

  for (let i = 0; i < 6; i++) {
    const res = await fetchJson<MirrorChaptersApiResponse>(
      `${MANGAKAKALOT_BASE}/api/manga/${encodeURIComponent(slug)}/chapters?limit=${limit}&offset=${offset}`
    );
    const batch = res.data?.chapters || [];
    collected.push(...batch);
    if (!res.data?.pagination?.has_more || batch.length === 0) break;
    offset += limit;
  }

  return dedupeById(
    collected.map((ch) => ({
      id: ch.chapter_slug,
      path: `/chapter/${slug}/${ch.chapter_slug}`,
      name: ch.chapter_name,
      view: ch.view !== undefined ? formatCompactCount(ch.view) : '—',
      createdAt: formatShortDate(ch.updated_at),
    }))
  );
}

async function resolveMdToHookSlug(mdUuid: string, item?: MangaDexListItem): Promise<string | null> {
  const cachedSlug = mdToHookSlugCache.get(mdUuid);
  if (cachedSlug) return cachedSlug;

  const series = item || (await fetchMangaDexSeries(mdUuid).catch(() => null));
  if (!series) return null;
  const origin: 'manga' | 'manhwa' = series.attributes.originalLanguage === 'ko' ? 'manhwa' : 'manga';
  const candidates = extractCandidateTitles(series, origin);
  if (candidates.length === 0) return null;

  const match = await resolveOnMangaHook(`${origin}:${mdUuid}`, candidates);
  if (match?.id) {
    if (mdToHookSlugCache.size >= 2000) {
      const oldestKey = mdToHookSlugCache.keys().next().value;
      if (oldestKey) mdToHookSlugCache.delete(oldestKey);
    }
    mdToHookSlugCache.set(mdUuid, match.id);
    return match.id;
  }
  return null;
}

export async function fetchMangaDetail(id: string): Promise<MangaDetailResponse> {
  const externalBase = getExternalBase();
  if (externalBase) {
    const data = await fetchJson<MangaDetailResponse>(
      `${externalBase}/api/manga/${encodeURIComponent(id)}`,
      getExternalHeaders()
    );
    return {
      ...data,
      id,
      imageUrl: toProxyImageUrl(data.imageUrl),
      description: data.description || '',
      genres: Array.from(new Set((data.genres || []).map((g) => g.trim()).filter(Boolean))),
      chapterList: dedupeById(data.chapterList || []),
    };
  }

  const cacheKey = `manga:${id}`;
  return cachedFetch<MangaDetailResponse>(cacheKey, 5 * 60_000, 30 * 60_000, async () => {
    // MangaDex-indexed series (`md-<uuid>`): fast metadata + lazy MangaHook chapters with MangaDex fallback
    if (id.startsWith('md-')) {
      const mdUuid = id.slice(3);
      const [series, stats] = await Promise.all([
        fetchMangaDexSeries(mdUuid),
        fetchMangaDexStats([mdUuid]),
      ]);
      const origin: 'manga' | 'manhwa' =
        series.attributes.originalLanguage === 'ko' ? 'manhwa' : 'manga';
      const title = extractPrimaryTitle(series, origin);
      const authors = Array.from(
        new Set(
          (series.relationships || [])
            .filter((r) => (r.type === 'author' || r.type === 'artist') && r.attributes?.name)
            .map((r) => r.attributes!.name!.trim())
        )
      );
      const genres = Array.from(
        new Set(
          (series.attributes.tags || [])
            .map((t) => t.attributes?.name?.en?.trim())
            .filter((g): g is string => Boolean(g))
        )
      );

      // Prefer MangaHook chapters (1 single lookup); fall back cleanly to MangaDex English chapters if rate-limited/missing
      let chapterList: MangaChapterItem[] = [];
      const hookSlug = await resolveMdToHookSlug(mdUuid, series).catch(() => null);
      if (hookSlug) {
        chapterList = await fetchAllChapters(hookSlug).catch(() => [] as MangaChapterItem[]);
      }
      if (chapterList.length === 0) {
        chapterList = await fetchMangaDexChapters(mdUuid).catch(() => [] as MangaChapterItem[]);
      }

      const follows = stats[mdUuid];
      return {
        id,
        imageUrl: extractMangaDexCover(series),
        name: title,
        author: authors.length > 0 ? authors.join(', ') : 'Unknown Author',
        status: formatMangaDexStatus(series.attributes.status),
        updated: formatShortDate(series.attributes.updatedAt),
        view: follows !== undefined ? formatCompactCount(follows) : '—',
        description: extractMangaDexDescription(series) || 'No synopsis available.',
        genres,
        chapterList,
      };
    }

    const [html, apiChapters] = await Promise.all([
      fetchHtml(`${MANGAKAKALOT_BASE}/manga/${encodeURIComponent(id)}`),
      fetchAllChapters(id).catch(() => [] as MangaChapterItem[]),
    ]);

    const $ = load(html);
    const info = $('.manga-info-top');

    const rawCover =
      info.find('.manga-info-pic img').first().attr('data-src') ||
      info.find('.manga-info-pic img').first().attr('src') ||
      '';

    const name = info.find('.manga-info-text h1').first().text().trim() || id;

    let author = 'Unknown Author';
    let status = 'Ongoing';
    let updated = '—';
    let view = '—';
    const genres: string[] = [];

    info.find('.manga-info-text li').each((_, li) => {
      const text = $(li).text().replace(/\s+/g, ' ').trim();
      if (/^Author\(s\)/i.test(text)) {
        author = text.replace(/^Author\(s\)\s*:\s*/i, '').trim() || author;
      } else if (/^Status/i.test(text)) {
        status = text.replace(/^Status\s*:\s*/i, '').trim() || status;
      } else if (/^Last updated/i.test(text)) {
        updated = text.replace(/^Last updated\s*:\s*/i, '').trim() || updated;
      } else if (/^View/i.test(text)) {
        view = text.replace(/^View\s*:\s*/i, '').trim() || view;
      } else if ($(li).hasClass('genres') || /^Genres/i.test(text)) {
        $(li)
          .find('a')
          .each((__, a) => {
            const g = $(a).text().trim();
            if (g) genres.push(g);
          });
      }
    });

    const contentBox = $('#contentBox').clone();
    contentBox.find('h2').remove();
    const description = contentBox.text().replace(/\s+/g, ' ').trim() || 'No synopsis available.';

    let chapterList = dedupeById(apiChapters);
    if (chapterList.length === 0) {
      const htmlChapters: MangaChapterItem[] = [];
      $('.chapter-list .row').each((_, row) => {
        const a = $(row).find('a').first();
        const chHref = a.attr('href') || '';
        const chSlug = chHref.split('/').filter(Boolean).pop() || '';
        if (!chSlug) return;
        htmlChapters.push({
          id: chSlug,
          path: `/chapter/${id}/${chSlug}`,
          name: a.text().trim(),
          view: $(row).find('span').eq(1).text().trim() || '—',
          createdAt: $(row).find('span').eq(2).text().trim() || '—',
        });
      });
      chapterList = dedupeById(htmlChapters);
    }

    const uniqueGenres = Array.from(new Set(genres));

    return {
      id,
      imageUrl: toProxyImageUrl(rawCover),
      name,
      author,
      status,
      updated,
      view,
      description,
      genres: uniqueGenres,
      chapterList,
    };
  });
}

export async function fetchChapterDetail(
  mangaId: string,
  chapterId: string
): Promise<ChapterDetailResponse> {
  const externalBase = getExternalBase();
  if (externalBase) {
    const data = await fetchJson<ChapterDetailResponse>(
      `${externalBase}/api/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`,
      getExternalHeaders()
    );
    return {
      ...data,
      mangaImage: data.mangaImage ? toProxyImageUrl(data.mangaImage) : '',
      chapterListIds: dedupeById(data.chapterListIds || []),
      images: (data.images || []).map((img) => ({
        ...img,
        image: toProxyImageUrl(img.image),
      })),
    };
  }

  const cacheKey = `chapter:${mangaId}:${chapterId}`;
  return cachedFetch<ChapterDetailResponse>(cacheKey, 15 * 60_000, 2 * 60 * 60_000, async () => {
    // MangaDex At-Home chapter fallback (`mdch-<uuid>`)
    if (chapterId.startsWith('mdch-')) {
      const chUuid = chapterId.slice(5);
      const [images, detail] = await Promise.all([
        fetchMangaDexChapterImages(chUuid),
        fetchMangaDetail(mangaId).catch(() => null),
      ]);
      const matchedChapter = detail?.chapterList.find((c) => c.id === chapterId);
      return {
        title: detail?.name || mangaId.replace(/^md-/, ''),
        currentChapter: matchedChapter?.name || 'Chapter',
        mangaImage: detail?.imageUrl || '',
        chapterListIds: dedupeById(
          (detail?.chapterList || []).map((ch) => ({
            id: ch.id,
            name: ch.name,
          }))
        ),
        images,
      };
    }

    // Resolve MangaHook slug when reading a MangaHook chapter under an `md-<uuid>` series ID
    let effectiveMangaSlug = mangaId;
    if (mangaId.startsWith('md-')) {
      const resolved = await resolveMdToHookSlug(mangaId.slice(3));
      if (!resolved) {
        throw new Error('Could not resolve chapter source for this series.');
      }
      effectiveMangaSlug = resolved;
    }

    const [html, detail] = await Promise.all([
      fetchHtml(
        `${MANGAKAKALOT_BASE}/manga/${encodeURIComponent(effectiveMangaSlug)}/${encodeURIComponent(chapterId)}`
      ),
      fetchMangaDetail(mangaId).catch(() => null),
    ]);

    const $ = load(html);
    const images: ChapterDetailResponse['images'] = [];

    $('.container-chapter-reader img').each((idx, img) => {
      const raw = $(img).attr('src') || $(img).attr('data-src') || '';
      if (!raw || raw.includes('404-avatar')) return;
      images.push({
        title: $(img).attr('title')?.trim() || $(img).attr('alt')?.trim() || `Page ${idx + 1}`,
        image: toProxyImageUrl(raw),
      });
    });

    const matchedChapter = detail?.chapterList.find((c) => c.id === chapterId);
    const h1Text = $('h1').first().text().trim();
    const currentChapter =
      matchedChapter?.name ||
      h1Text.replace(detail?.name || '', '').trim() ||
      chapterId.replace(/-/g, ' ');

    return {
      title: detail?.name || effectiveMangaSlug.replace(/-/g, ' '),
      currentChapter,
      mangaImage: detail?.imageUrl || '',
      chapterListIds: dedupeById(
        (detail?.chapterList || []).map((ch) => ({
          id: ch.id,
          name: ch.name,
        }))
      ),
      images,
    };
  });
}

async function searchMangaDex(queryStr: string, page: number): Promise<SearchResponse> {
  const limit = 24;
  const offset = Math.min((page - 1) * limit, 10_000 - limit);
  const qs = new URLSearchParams();
  qs.set('title', queryStr.trim());
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  qs.append('includes[]', 'cover_art');
  qs.append('contentRating[]', 'safe');
  qs.append('contentRating[]', 'suggestive');
  qs.append('availableTranslatedLanguage[]', 'en');
  qs.set('hasAvailableChapters', 'true');
  qs.set('order[relevance]', 'desc');

  const res = await fetch(`${MANGADEX_API_BASE}/manga?${qs.toString()}`, {
    headers: { 'User-Agent': 'KaguraMangaReader/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Search catalog HTTP ${res.status}`);
  }
  const mdData = (await res.json()) as MangaDexListResponse;
  const items = mdData.data || [];
  const stats = await fetchMangaDexStats(items.map((i) => i.id));
  const mangaList = mapMangaDexItemsToList(items, stats, 'manga');
  const totalPages = Math.max(
    1,
    Math.min(Math.ceil((mdData.total || mangaList.length) / limit), Math.floor(10_000 / limit))
  );
  return { mangaList, metaData: { totalPages } };
}

export async function searchManga(queryStr: string, page = 1): Promise<SearchResponse> {
  const cleanPage = Math.max(1, Number(page) || 1);
  const externalBase = getExternalBase();
  if (externalBase) {
    const data = await fetchJson<SearchResponse>(
      `${externalBase}/api/search/${encodeURIComponent(queryStr)}?page=${cleanPage}`,
      getExternalHeaders()
    );
    return {
      ...data,
      mangaList: (data.mangaList || []).map((m) => ({
        ...m,
        image: toProxyImageUrl(m.image),
      })),
    };
  }

  const slugQuery = queryStr
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!slugQuery) {
    return { mangaList: [], metaData: { totalPages: 1 } };
  }

  const cacheKey = `search:${slugQuery}:${cleanPage}`;
  return cachedFetch<SearchResponse>(cacheKey, 3 * 60_000, 15 * 60_000, async () => {
    try {
      const html = await fetchHtml(
        `${MANGAKAKALOT_BASE}/search/story/${encodeURIComponent(slugQuery)}?page=${cleanPage}`,
        0
      );
      const $ = load(html);

      const mangaList: MangaListItem[] = [];
      $('.panel_story_list .story_item').each((_, el) => {
        const card = $(el);
        const link = card.find('h3.story_name a, a').first();
        const href = link.attr('href') || '';
        const id = extractSlugFromHref(href);
        const title = card.find('h3.story_name a').first().text().trim() || link.text().trim();
        if (!id || !title) return;

        const imgEl = card.find('img').first();
        const rawImage = imgEl.attr('src') || imgEl.attr('data-src') || '';
        const chapter = card.find('.story_chapter a').first().text().trim() || 'Latest';

        let view = '—';
        let description = '';
        card.find('.story_item_right span').each((__, sp) => {
          const txt = $(sp).text().replace(/\s+/g, ' ').trim();
          if (/^View\s*:/i.test(txt)) {
            view = txt.replace(/^View\s*:\s*/i, '').trim() || '—';
          } else if (/^Author\(s\)/i.test(txt)) {
            description = txt;
          }
        });

        mangaList.push({
          id,
          image: toProxyImageUrl(rawImage),
          title,
          chapter,
          view,
          description,
        });
      });

      const unique = dedupeById(mangaList);
      if (unique.length > 0) {
        const { totalPages } = parsePagination($);
        return {
          mangaList: unique,
          metaData: { totalPages },
        };
      }
    } catch (err) {
      console.warn('MangaHook search fallback to MangaDex:', err);
    }

    return searchMangaDex(queryStr, cleanPage);
  });
}
