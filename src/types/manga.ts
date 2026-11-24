export interface MangaListItem {
  id: string;
  image: string;
  title: string;
  chapter: string;
  view: string;
  description: string;
}

export interface MetaOption {
  id: string;
  type: string;
  name?: string;
  group?: 'all' | 'genre' | 'demographic' | 'theme' | 'format';
}

export interface MangaListMetaData {
  totalStories: number;
  totalPages: number;
  type: MetaOption[];
  state: MetaOption[];
  category: MetaOption[];
}

export interface MangaListResponse {
  mangaList: MangaListItem[];
  metaData: MangaListMetaData;
}

export interface MangaChapterItem {
  id: string;
  path: string;
  name: string;
  view: string;
  createdAt: string;
}

export interface MangaDetailResponse {
  id: string;
  imageUrl: string;
  name: string;
  author: string;
  status: string;
  updated: string;
  view: string;
  description: string;
  genres: string[];
  chapterList: MangaChapterItem[];
}

export interface ChapterIdOption {
  id: string;
  name: string;
}

export interface ChapterImageItem {
  title: string;
  image: string;
}

export interface ChapterDetailResponse {
  title: string;
  currentChapter: string;
  chapterListIds: ChapterIdOption[];
  images: ChapterImageItem[];
}

export interface SearchResponse {
  mangaList: MangaListItem[];
  metaData: {
    totalPages: number;
  };
}

export interface User {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
}

export interface MangaBookmark {
  user_id?: string;
  manga_id: string;
  title: string;
  image: string;
  latest_chapter: string;
  created_at: string;
}

export interface ReadingHistoryItem {
  user_id?: string;
  manga_id: string;
  manga_title: string;
  manga_image: string;
  chapter_id: string;
  chapter_name: string;
  page_index: number;
  updated_at: string;
}
