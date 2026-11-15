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

const MANGADEX_BASE = (process.env.MANGADEX_API_URL?.trim() || 'https://api.mangadex.org').replace(
  /\/+$/,
  ''
);
const MANGADEX_UPLOADS = 'https://uploads.mangadex.org';
const PAGE_LIMIT = 24;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry<unknown>>();
let cachedGenreTags: { options: MetaOption[]; idBySlug: Map<string, string>; expiresAt: number } | null =
  null;

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
  return `/api/proxy/image?url=${encodeURIComponent(rawUrl)}`;
}

function formatCompactCount(num?: number): string {
  if (!num || !Number.isFinite(num)) return '—';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function formatShortDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function pickLocalizedText(record?: Record<string, string>, fallback = ''): string {
  if (!record) return fallback;
  return (
    record.en ||
    record['ja-ro'] ||
    record.ja ||
    Object.values(record)[0] ||
    fallback
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'PolinMangaReader/1.0',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`MangaDex API HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

// --- MangaDex Tag Metadata ---
async function getGenreTags() {
  if (cachedGenreTags && Date.now() < cachedGenreTags.expiresAt) {
    return cachedGenreTags;
  }

  interface TagResponse {
    data: Array<{
      id: string;
      attributes: { group: string; name: Record<string, string> };
    }>;
  }

  const json = await fetchJson<TagResponse>(`${MANGADEX_BASE}/manga/tag`);
  const genres = json.data
    .filter((t) => t.attributes.group === 'genre' || t.attributes.group === 'theme')
    .sort((a, b) =>
      pickLocalizedText(a.attributes.name).localeCompare(pickLocalizedText(b.attributes.name))
    );

  const idBySlug = new Map<string, string>();
  const options: MetaOption[] = [{ id: 'all', type: 'All', name: 'All' }];

  for (const tag of genres) {
    const label = pickLocalizedText(tag.attributes.name);
    if (!label) continue;
    idBySlug.set(label.toLowerCase(), tag.id);
    idBySlug.set(tag.id.toLowerCase(), tag.id);
    options.push({ id: label, type: label, name: label });
  }

  cachedGenreTags = {
    options,
    idBySlug,
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  return cachedGenreTags;
}

interface MdMangaEntity {
  id: string;
  attributes: {
    title: Record<string, string>;
    description?: Record<string, string>;
    status?: string;
    lastChapter?: string;
    updatedAt?: string;
    tags?: Array<{ id: string; attributes: { name: Record<string, string> } }>;
  };
  relationships?: Array<{
    id: string;
    type: string;
    attributes?: {
      fileName?: string;
      name?: string;
    };
  }>;
}

interface MdListResponse {
  data: MdMangaEntity[];
  total: number;
}

interface MdStatsResponse {
  statistics: Record<
    string,
    {
      follows?: number;
      rating?: { average?: number };
    }
  >;
}

function extractCoverUrl(manga: MdMangaEntity): string {
  const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
  const fileName = coverRel?.attributes?.fileName;
  if (!fileName) return '';
  return toProxyImageUrl(`${MANGADEX_UPLOADS}/covers/${manga.id}/${fileName}.512.jpg`);
}

function extractAuthorName(manga: MdMangaEntity): string {
  const authorRel = manga.relationships?.find(
    (r) => r.type === 'author' || r.type === 'artist'
  );
  return authorRel?.attributes?.name || 'Unknown Author';
}

function mapMangaListItems(
  items: MdMangaEntity[],
  statsMap: Record<string, { follows?: number }> = {}
): MangaListItem[] {
  return items.map((m) => {
    const title = pickLocalizedText(m.attributes.title, 'Untitled');
    const description = pickLocalizedText(
      m.attributes.description,
      'No synopsis available.'
    )
      .replace(/\[.*?\]\(.*?\)/g, '')
      .trim();
    const follows = statsMap[m.id]?.follows;

    return {
      id: m.id,
      image: extractCoverUrl(m),
      title,
      chapter: m.attributes.lastChapter ? `Ch. ${m.attributes.lastChapter}` : 'Latest',
      view: follows ? formatCompactCount(follows) : '—',
      description,
    };
  });
}

async function fetchStatsBatch(ids: string[]): Promise<Record<string, { follows?: number }>> {
  if (ids.length === 0) return {};
  try {
    const params = ids.map((id) => `manga[]=${encodeURIComponent(id)}`).join('&');
    const res = await fetchJson<MdStatsResponse>(`${MANGADEX_BASE}/statistics/manga?${params}`);
    return res.statistics || {};
  } catch {
    return {};
  }
}

export async function fetchMangaList(params: {
  page?: number;
  type?: string;
  state?: string;
  category?: string;
}): Promise<MangaListResponse> {
  const page = Math.max(1, Number(params.page) || 1);
  const type = (params.type || 'latest').toLowerCase();
  const state = params.state || 'all';
  const category = params.category || 'all';

  const cacheKey = `list:${page}:${type}:${state}:${category}`;
  const cached = getCached<MangaListResponse>(cacheKey);
  if (cached) return cached;

  const tags = await getGenreTags();
  const query = new URLSearchParams();
  query.set('limit', String(PAGE_LIMIT));
  query.set('offset', String((page - 1) * PAGE_LIMIT));
  query.append('includes[]', 'cover_art');
  query.append('contentRating[]', 'safe');
  query.append('contentRating[]', 'suggestive');
  query.set('hasAvailableChapters', 'true');
  query.append('availableTranslatedLanguage[]', 'en');

  if (type === 'newest') {
    query.set('order[createdAt]', 'desc');
  } else if (type === 'topview' || type === 'top read') {
    query.set('order[followedCount]', 'desc');
  } else {
    query.set('order[latestUploadedChapter]', 'desc');
  }

  if (state.toLowerCase() === 'ongoing') {
    query.append('status[]', 'ongoing');
  } else if (state.toLowerCase() === 'completed') {
    query.append('status[]', 'completed');
  }

  if (category && category.toLowerCase() !== 'all' && category.toLowerCase() !== 'none') {
    const tagId = tags.idBySlug.get(category.toLowerCase());
    if (tagId) {
      query.append('includedTags[]', tagId);
    }
  }

  const listRes = await fetchJson<MdListResponse>(`${MANGADEX_BASE}/manga?${query.toString()}`);
  const stats = await fetchStatsBatch(listRes.data.map((d) => d.id));
  const totalStories = Math.min(listRes.total || 0, 10000);
  const totalPages = Math.max(1, Math.ceil(totalStories / PAGE_LIMIT));

  const metaData: MangaListMetaData = {
    totalStories: listRes.total || 0,
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
    category: tags.options,
  };

  const payload: MangaListResponse = {
    mangaList: mapMangaListItems(listRes.data, stats),
    metaData,
  };

  setCached(cacheKey, payload, 60_000);
  return payload;
}

interface MdFeedResponse {
  data: Array<{
    id: string;
    attributes: {
      volume?: string | null;
      chapter?: string | null;
      title?: string | null;
      translatedLanguage?: string;
      pages: number;
      readableAt?: string;
      externalUrl?: string | null;
    };
  }>;
  total: number;
}

function formatChapterLabel(ch: {
  volume?: string | null;
  chapter?: string | null;
  title?: string | null;
}): string {
  const parts: string[] = [];
  if (ch.volume) parts.push(`Vol.${ch.volume}`);
  if (ch.chapter) parts.push(`Chapter ${ch.chapter}`);
  else parts.push('Oneshot');
  if (ch.title && ch.title.trim()) {
    return `${parts.join(' ')}: ${ch.title.trim()}`;
  }
  return parts.join(' ');
}

async function fetchFeedPages(
  id: string,
  options: { enOnly: boolean; readableOnly: boolean }
): Promise<MdFeedResponse['data']> {
  const limit = 500;
  const maxEntries = 2000;
  const items: MdFeedResponse['data'] = [];
  let offset = 0;

  while (offset < maxEntries) {
    const q = new URLSearchParams();
    q.set('limit', String(limit));
    q.set('offset', String(offset));
    q.set('order[chapter]', 'desc');
    q.append('contentRating[]', 'safe');
    q.append('contentRating[]', 'suggestive');
    q.append('contentRating[]', 'erotica');
    q.append('contentRating[]', 'pornographic');
    if (options.enOnly) {
      q.append('translatedLanguage[]', 'en');
    }
    if (options.readableOnly) {
      q.set('includeEmptyPages', '0');
      q.set('includeExternalUrl', '0');
    }

    const res = await fetchJson<MdFeedResponse>(
      `${MANGADEX_BASE}/manga/${encodeURIComponent(id)}/feed?${q.toString()}`
    );
    items.push(...res.data);

    if (res.data.length < limit || items.length >= res.total) {
      break;
    }
    offset += limit;
  }

  return items;
}

function parseChapterNum(chapter?: string | null): number {
  if (!chapter) return -1;
  const parsed = Number.parseFloat(chapter);
  return Number.isFinite(parsed) ? parsed : -1;
}

async function fetchChaptersForManga(id: string): Promise<MangaChapterItem[]> {
  // 1. Fetch all readable internal English chapters (handles 100+ / 1000+ chapters)
  let source = await fetchFeedPages(id, { enOnly: true, readableOnly: true });

  // 2. If no internal English chapters exist (e.g. licensed external-only titles like Grand Blue),
  //    fetch readable internal chapters across all languages.
  if (source.length === 0) {
    source = await fetchFeedPages(id, { enOnly: false, readableOnly: true });
  }

  // 3. Final fallback if a series only has external links
  if (source.length === 0) {
    source = await fetchFeedPages(id, { enOnly: true, readableOnly: false });
    if (source.length === 0) {
      source = await fetchFeedPages(id, { enOnly: false, readableOnly: false });
    }
  }

  // Rank languages by coverage count (with English always preferred if present)
  const langCounts = new Map<string, number>();
  for (const ch of source) {
    const lang = (ch.attributes.translatedLanguage || 'en').toLowerCase();
    langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
  }

  const prioritized = [...source].sort((a, b) => {
    const langA = (a.attributes.translatedLanguage || 'en').toLowerCase();
    const langB = (b.attributes.translatedLanguage || 'en').toLowerCase();
    if (langA !== langB) {
      if (langA === 'en') return -1;
      if (langB === 'en') return 1;
      const countDiff = (langCounts.get(langB) || 0) - (langCounts.get(langA) || 0);
      if (countDiff !== 0) return countDiff;
    }
    return (b.attributes.readableAt || '').localeCompare(a.attributes.readableAt || '');
  });

  // Deduplicate identical chapter numbers, keeping the primary language / newest upload first
  const seenChapters = new Set<string>();
  const picked: MdFeedResponse['data'] = [];

  for (const ch of prioritized) {
    const chKey = ch.attributes.chapter || ch.id;
    if (seenChapters.has(chKey)) continue;
    seenChapters.add(chKey);
    picked.push(ch);
  }

  // Sort numerically descending (newest chapter -> Chapter 1)
  picked.sort((a, b) => {
    const numA = parseChapterNum(a.attributes.chapter);
    const numB = parseChapterNum(b.attributes.chapter);
    if (numA !== numB) return numB - numA;
    return (b.attributes.readableAt || '').localeCompare(a.attributes.readableAt || '');
  });

  return picked.map((ch) => ({
    id: ch.id,
    path: `/chapter/${id}/${ch.id}`,
    name: formatChapterLabel(ch.attributes),
    view: (ch.attributes.translatedLanguage || 'en').toUpperCase(),
    createdAt: formatShortDate(ch.attributes.readableAt),
  }));
}

export async function fetchMangaDetail(id: string): Promise<MangaDetailResponse> {
  const cacheKey = `manga:${id}`;
  const cached = getCached<MangaDetailResponse>(cacheKey);
  if (cached) return cached;

  const [mangaRes, chapterList, stats] = await Promise.all([
    fetchJson<{ data: MdMangaEntity }>(
      `${MANGADEX_BASE}/manga/${encodeURIComponent(id)}?includes[]=cover_art&includes[]=author&includes[]=artist`
    ),
    fetchChaptersForManga(id),
    fetchStatsBatch([id]),
  ]);

  const manga = mangaRes.data;
  const statusRaw = manga.attributes.status || 'ongoing';
  const status = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
  const genres = (manga.attributes.tags || [])
    .map((t) => pickLocalizedText(t.attributes.name))
    .filter(Boolean);

  const detail: MangaDetailResponse = {
    id: manga.id,
    imageUrl: extractCoverUrl(manga),
    name: pickLocalizedText(manga.attributes.title, 'Untitled'),
    author: extractAuthorName(manga),
    status,
    updated: formatShortDate(manga.attributes.updatedAt),
    view: formatCompactCount(stats[manga.id]?.follows),
    description: pickLocalizedText(manga.attributes.description, 'No synopsis available.')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .trim(),
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
  const cacheKey = `chapter:${mangaId}:${chapterId}`;
  const cached = getCached<ChapterDetailResponse>(cacheKey);
  if (cached) return cached;

  interface MdAtHomeResponse {
    baseUrl: string;
    chapter: {
      hash: string;
      data: string[];
      dataSaver: string[];
    };
  }

  interface MdSingleChapterResponse {
    data: {
      id: string;
      attributes: {
        volume?: string | null;
        chapter?: string | null;
        title?: string | null;
        externalUrl?: string | null;
      };
    };
  }

  const [detail, atHome, chapterMeta] = await Promise.all([
    fetchMangaDetail(mangaId),
    fetchJson<MdAtHomeResponse>(`${MANGADEX_BASE}/at-home/server/${encodeURIComponent(chapterId)}`),
    fetchJson<MdSingleChapterResponse>(`${MANGADEX_BASE}/chapter/${encodeURIComponent(chapterId)}`),
  ]);

  const files =
    atHome.chapter.data.length > 0 ? atHome.chapter.data : atHome.chapter.dataSaver;
  const folder = atHome.chapter.data.length > 0 ? 'data' : 'data-saver';
  const currentName = formatChapterLabel(chapterMeta.data.attributes);

  const images = files.map((file, idx) => ({
    title: `${detail.name} — ${currentName} — Page ${idx + 1}`,
    image: toProxyImageUrl(`${atHome.baseUrl}/${folder}/${atHome.chapter.hash}/${file}`),
  }));

  const payload: ChapterDetailResponse = {
    title: detail.name,
    currentChapter: currentName,
    chapterListIds: detail.chapterList.map((ch) => ({
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
  const cacheKey = `search:${queryStr.toLowerCase()}:${cleanPage}`;
  const cached = getCached<SearchResponse>(cacheKey);
  if (cached) return cached;

  const q = new URLSearchParams();
  q.set('title', queryStr);
  q.set('limit', String(PAGE_LIMIT));
  q.set('offset', String((cleanPage - 1) * PAGE_LIMIT));
  q.append('includes[]', 'cover_art');
  q.append('contentRating[]', 'safe');
  q.append('contentRating[]', 'suggestive');
  q.set('hasAvailableChapters', 'true');
  q.set('order[relevance]', 'desc');

  const res = await fetchJson<MdListResponse>(`${MANGADEX_BASE}/manga?${q.toString()}`);
  const stats = await fetchStatsBatch(res.data.map((d) => d.id));
  const totalPages = Math.max(1, Math.ceil(Math.min(res.total || 0, 2400) / PAGE_LIMIT));

  const payload: SearchResponse = {
    mangaList: mapMangaListItems(res.data, stats),
    metaData: { totalPages },
  };

  setCached(cacheKey, payload, 60_000);
  return payload;
}
