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

const GENRE_OPTIONS: MetaOption[] = [
  { id: 'all', type: 'All', name: 'All' },
  { id: 'action', type: 'Action', name: 'Action' },
  { id: 'adventure', type: 'Adventure', name: 'Adventure' },
  { id: 'comedy', type: 'Comedy', name: 'Comedy' },
  { id: 'cooking', type: 'Cooking', name: 'Cooking' },
  { id: 'drama', type: 'Drama', name: 'Drama' },
  { id: 'ecchi', type: 'Ecchi', name: 'Ecchi' },
  { id: 'fantasy', type: 'Fantasy', name: 'Fantasy' },
  { id: 'gender-bender', type: 'Gender bender', name: 'Gender bender' },
  { id: 'harem', type: 'Harem', name: 'Harem' },
  { id: 'historical', type: 'Historical', name: 'Historical' },
  { id: 'horror', type: 'Horror', name: 'Horror' },
  { id: 'isekai', type: 'Isekai', name: 'Isekai' },
  { id: 'josei', type: 'Josei', name: 'Josei' },
  { id: 'martial-arts', type: 'Martial arts', name: 'Martial arts' },
  { id: 'mature', type: 'Mature', name: 'Mature' },
  { id: 'mecha', type: 'Mecha', name: 'Mecha' },
  { id: 'medical', type: 'Medical', name: 'Medical' },
  { id: 'mystery', type: 'Mystery', name: 'Mystery' },
  { id: 'one-shot', type: 'One shot', name: 'One shot' },
  { id: 'psychological', type: 'Psychological', name: 'Psychological' },
  { id: 'romance', type: 'Romance', name: 'Romance' },
  { id: 'school-life', type: 'School life', name: 'School life' },
  { id: 'sci-fi', type: 'Sci fi', name: 'Sci fi' },
  { id: 'seinen', type: 'Seinen', name: 'Seinen' },
  { id: 'shoujo', type: 'Shoujo', name: 'Shoujo' },
  { id: 'shounen', type: 'Shounen', name: 'Shounen' },
  { id: 'slice-of-life', type: 'Slice of life', name: 'Slice of life' },
  { id: 'sports', type: 'Sports', name: 'Sports' },
  { id: 'supernatural', type: 'Supernatural', name: 'Supernatural' },
  { id: 'tragedy', type: 'Tragedy', name: 'Tragedy' },
  { id: 'webtoons', type: 'Webtoons', name: 'Webtoons' },
];

function resolveCategorySlug(category: string): string {
  const clean = category.trim().toLowerCase();
  if (!clean || clean === 'all' || clean === 'none') return 'all';
  const match = GENRE_OPTIONS.find(
    (g) => g.id.toLowerCase() === clean || (g.name || '').toLowerCase() === clean
  );
  if (match) return match.id;
  return clean.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

export async function fetchMangaList(params: {
  page?: number;
  type?: string;
  state?: string;
  category?: string;
}): Promise<MangaListResponse> {
  const page = Math.max(1, Number(params.page) || 1);
  const type = (params.type || 'latest').toLowerCase();
  const state = (params.state || 'all').toLowerCase();
  const category = params.category || 'all';

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

  const categorySlug = resolveCategorySlug(category);
  const cacheKey = `list:${page}:${type}:${state}:${categorySlug}`;
  const cached = getCached<MangaListResponse>(cacheKey);
  if (cached) return cached;

  let path: string;
  if (categorySlug !== 'all') {
    const qs = new URLSearchParams({ page: String(page) });
    if (type) qs.set('type', type);
    if (state !== 'all') qs.set('state', state);
    path = `/genre/${encodeURIComponent(categorySlug)}?${qs.toString()}`;
  } else if (state === 'completed') {
    path = `/manga-list/completed-manga?page=${page}`;
  } else if (type === 'topview' || type === 'top read') {
    path = `/manga-list/hot-manga?page=${page}`;
  } else if (type === 'newest') {
    path = `/manga-list/new-manga?page=${page}`;
  } else {
    path = `/manga-list/latest-manga?page=${page}`;
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

  const { totalStories, totalPages } = parsePagination($);
  const metaData: MangaListMetaData = {
    totalStories: totalStories || mangaList.length,
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

  const payload: MangaListResponse = { mangaList, metaData };
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

  return collected.map((ch) => ({
    id: ch.chapter_slug,
    path: `/chapter/${slug}/${ch.chapter_slug}`,
    name: ch.chapter_name,
    view: ch.view !== undefined ? formatCompactCount(ch.view) : '—',
    createdAt: formatShortDate(ch.updated_at),
  }));
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

  let chapterList = apiChapters;
  if (chapterList.length === 0) {
    $('.chapter-list .row').each((_, row) => {
      const a = $(row).find('a').first();
      const chHref = a.attr('href') || '';
      const chSlug = chHref.split('/').filter(Boolean).pop() || '';
      if (!chSlug) return;
      chapterList.push({
        id: chSlug,
        path: `/chapter/${id}/${chSlug}`,
        name: a.text().trim(),
        view: $(row).find('span').eq(1).text().trim() || '—',
        createdAt: $(row).find('span').eq(2).text().trim() || '—',
      });
    });
  }

  const detail: MangaDetailResponse = {
    id,
    imageUrl: toProxyImageUrl(rawCover),
    name,
    author,
    status,
    updated,
    view,
    description,
    genres,
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
    chapterListIds: (detail?.chapterList || []).map((ch) => ({
      id: ch.id,
      name: ch.name,
    })),
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
    mangaList,
    metaData: { totalPages },
  };

  setCached(cacheKey, payload, 60_000);
  return payload;
}
