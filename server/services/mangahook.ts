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
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return hit.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number) {
  if (responseCache.size > 200) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
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

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: `${MANGAKAKALOT_BASE}/`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`MangaHook upstream HTTP ${res.status} for ${url}`);
  }
  return await res.text();
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
  };
  relationships?: Array<{
    type: string;
    attributes?: {
      fileName?: string;
    };
  }>;
}

interface MangaDexListResponse {
  data: MangaDexListItem[];
  total: number;
  limit: number;
  offset: number;
}

interface ResolvedHookCard {
  id: string;
  image: string;
  title: string;
  chapter: string;
  view: string;
}

const slugMatchCache = new Map<string, CacheEntry<ResolvedHookCard | null>>();

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
  if (slugMatchCache.size > 1200) {
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
    headers: { 'User-Agent': 'PolinMangaReader/1.0', Accept: 'application/json' },
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
  for (const query of candidateTitles.slice(0, 3)) {
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

async function fetchOriginSeparatedList(params: {
  page: number;
  type: string;
  state: string;
  categorySlug: string;
  origin: 'manga' | 'manhwa';
}): Promise<MangaListResponse> {
  const { page, type, state, categorySlug, origin } = params;
  const pageSize = 24;
  const maxOffset = Math.max(0, 10_000 - pageSize);
  const offset = Math.min((page - 1) * pageSize, maxOffset);
  const fetchLimit = Math.min(36, Math.max(pageSize, 10_000 - offset));
  const tagMap = await getMangaDexTagMap();

  const qs = new URLSearchParams();
  qs.set('limit', String(fetchLimit));
  qs.set('offset', String(offset));
  qs.append('includes[]', 'cover_art');
  if (categorySlug === 'ecchi') {
    qs.append('contentRating[]', 'suggestive');
  } else if (categorySlug === 'mature') {
    qs.append('contentRating[]', 'suggestive');
    qs.append('contentRating[]', 'erotica');
  } else {
    qs.append('contentRating[]', 'safe');
    qs.append('contentRating[]', 'suggestive');
  }
  qs.append('availableTranslatedLanguage[]', 'en');
  qs.set('hasAvailableChapters', 'true');

  if (origin === 'manhwa') {
    // Strictly Korean Manhwa only
    qs.append('originalLanguage[]', 'ko');
  } else {
    // Strictly Japanese Manga only — exclude vertical Long Strip webtoons unless explicitly requested
    qs.append('originalLanguage[]', 'ja');
    const longStripId = tagMap.get('long-strip');
    if (longStripId && categorySlug !== 'long-strip' && categorySlug !== 'webtoons') {
      qs.append('excludedTags[]', longStripId);
    }
  }

  if (type === 'topview' || type === 'top read') {
    qs.set('order[followedCount]', 'desc');
  } else if (type === 'newest') {
    qs.set('order[createdAt]', 'desc');
  } else {
    qs.set('order[latestUploadedChapter]', 'desc');
  }

  if (state === 'ongoing') {
    qs.append('status[]', 'ongoing');
  } else if (state === 'completed') {
    qs.append('status[]', 'completed');
  }

  if (
    categorySlug !== 'all' &&
    categorySlug !== 'manhwa' &&
    categorySlug !== 'ecchi' &&
    categorySlug !== 'mature'
  ) {
    if (DEMOGRAPHIC_SLUGS.has(categorySlug)) {
      qs.append('publicationDemographic[]', categorySlug);
    } else {
      const tagId = tagMap.get(categorySlug);
      if (tagId) {
        qs.append('includedTags[]', tagId);
      }
    }
  }

  const res = await fetch(`${MANGADEX_API_BASE}/manga?${qs.toString()}`, {
    headers: { 'User-Agent': 'PolinMangaReader/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`Origin catalog HTTP ${res.status}`);
  }
  const mdData = (await res.json()) as MangaDexListResponse;
  const allItems = mdData.data || [];

  const resolveItem = async (item: MangaDexListItem): Promise<MangaListItem | null> => {
    const candidates = extractCandidateTitles(item, origin);
    if (candidates.length === 0) return null;

    const match = await resolveOnMangaHook(`${origin}:${item.id}`, candidates);
    if (!match) return null;

    const mdCover = extractMangaDexCover(item);
    const description = extractMangaDexDescription(item);

    return {
      id: match.id,
      image: match.image || mdCover,
      title: match.title,
      chapter:
        match.chapter ||
        (item.attributes.lastChapter ? `Chapter ${item.attributes.lastChapter}` : 'Latest'),
      view: match.view || '—',
      description,
    };
  };

  const seenIds = new Set<string>();
  const mangaList: MangaListItem[] = [];

  const appendResolved = (entries: Array<MangaListItem | null>) => {
    for (const entry of entries) {
      if (!entry || seenIds.has(entry.id)) continue;
      seenIds.add(entry.id);
      mangaList.push(entry);
      if (mangaList.length >= pageSize) break;
    }
  };

  // Resolve primary batch of 24 first
  const primaryBatch = await Promise.all(allItems.slice(0, pageSize).map(resolveItem));
  appendResolved(primaryBatch);

  // Backfill from buffer if any primary items failed to match on MangaHook
  if (mangaList.length < pageSize && allItems.length > pageSize) {
    const bufferBatch = await Promise.all(allItems.slice(pageSize).map(resolveItem));
    appendResolved(bufferBatch);
  }

  // Exact total available titles for the current filter (All / Ongoing / Completed / Genre)
  const totalStories =
    typeof mdData.total === 'number' && mdData.total >= 0 ? mdData.total : mangaList.length;
  // Cap navigable pages at MangaDex's 10,000-offset API ceiling
  const totalPages = Math.max(
    1,
    Math.min(Math.ceil(totalStories / pageSize), Math.floor(10_000 / pageSize))
  );

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

export async function fetchMangaList(params: {
  page?: number;
  type?: string;
  state?: string;
  category?: string;
  origin?: 'manga' | 'manhwa';
}): Promise<MangaListResponse> {
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

  const cacheKey = `list:${origin}:${page}:${type}:${state}:${categorySlug}`;
  const cached = getCached<MangaListResponse>(cacheKey);
  if (cached) return cached;

  try {
    const payload = await fetchOriginSeparatedList({
      page,
      type,
      state,
      categorySlug,
      origin,
    });
    if (payload.mangaList.length > 0) {
      setCached(cacheKey, payload, 120_000);
      return payload;
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

  const payload: MangaListResponse = { mangaList: uniqueMangaList, metaData };
  setCached(cacheKey, payload, 60_000);
  return payload;
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
  const cached = getCached<MangaDetailResponse>(cacheKey);
  if (cached) return cached;

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

  const detail: MangaDetailResponse = {
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

  setCached(cacheKey, detail, 120_000);
  return detail;
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
      chapterListIds: dedupeById(data.chapterListIds || []),
      images: (data.images || []).map((img) => ({
        ...img,
        image: toProxyImageUrl(img.image),
      })),
    };
  }

  const cacheKey = `chapter:${mangaId}:${chapterId}`;
  const cached = getCached<ChapterDetailResponse>(cacheKey);
  if (cached) return cached;

  const [html, detail] = await Promise.all([
    fetchHtml(`${MANGAKAKALOT_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`),
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

  const payload: ChapterDetailResponse = {
    title: detail?.name || mangaId.replace(/-/g, ' '),
    currentChapter,
    chapterListIds: dedupeById(
      (detail?.chapterList || []).map((ch) => ({
        id: ch.id,
        name: ch.name,
      }))
    ),
    images,
  };

  setCached(cacheKey, payload, 180_000);
  return payload;
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
  const cached = getCached<SearchResponse>(cacheKey);
  if (cached) return cached;

  const html = await fetchHtml(
    `${MANGAKAKALOT_BASE}/search/story/${encodeURIComponent(slugQuery)}?page=${cleanPage}`
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

  const { totalPages } = parsePagination($);
  const payload: SearchResponse = {
    mangaList: dedupeById(mangaList),
    metaData: { totalPages },
  };

  setCached(cacheKey, payload, 60_000);
  return payload;
}
