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

export interface UserRecord {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
  created_at: string;
}

export interface MangaBookmarkRecord {
  user_id: string;
  manga_id: string;
  title: string;
  image: string;
  latest_chapter: string;
  created_at: string;
}

export interface ReadingHistoryRecord {
  user_id: string;
  manga_id: string;
  manga_title: string;
  manga_image: string;
  chapter_id: string;
  chapter_name: string;
  page_index: number;
  updated_at: string;
}

export interface SessionRecord {
  token: string;
  refresh_token: string;
  user_id: string;
  expires_at: number;
}

export interface DatabaseState {
  users: UserRecord[];
  bookmarks: MangaBookmarkRecord[];
  reading_history: ReadingHistoryRecord[];
  sessions: SessionRecord[];
}
