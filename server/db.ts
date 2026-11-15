import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  DatabaseState,
  MangaBookmarkRecord,
  ReadingHistoryRecord,
  SessionRecord,
  UserRecord,
} from './types.ts';

import os from 'node:os';

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'polin-manga-data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'manga-db.json');

function createInitialState(): DatabaseState {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: 'user-reader-1',
        email: 'reader@polin.manga',
        given_name: 'Manga',
        family_name: 'Reader',
        created_at: now,
      },
    ],
    bookmarks: [],
    reading_history: [],
    sessions: [],
  };
}

class MangaRepository {
  private state: DatabaseState;

  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      try {
        this.state = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DatabaseState;
      } catch {
        this.state = createInitialState();
        this.persist();
      }
    } else {
      this.state = createInitialState();
      this.persist();
    }
  }

  private persist() {
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  }

  loginWithEmail(input: {
    email: string;
    given_name?: string;
    family_name?: string;
  }): { user: UserRecord; session: SessionRecord } {
    const email = input.email.trim().toLowerCase();
    let user = this.state.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      user = {
        id: `user-${crypto.randomUUID().slice(0, 8)}`,
        email,
        given_name: (input.given_name || email.split('@')[0]).trim(),
        family_name: (input.family_name || '').trim(),
        created_at: new Date().toISOString(),
      };
      this.state.users.push(user);
    }

    const session: SessionRecord = {
      token: crypto.randomBytes(24).toString('hex'),
      refresh_token: crypto.randomBytes(24).toString('hex'),
      user_id: user.id,
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    this.state.sessions.push(session);
    this.persist();
    return { user, session };
  }

  getUserByToken(token: string): UserRecord | null {
    const session = this.state.sessions.find((s) => s.token === token);
    if (!session || session.expires_at < Date.now()) return null;
    return this.state.users.find((u) => u.id === session.user_id) || null;
  }

  renewSession(refreshTokenValue: string): SessionRecord | null {
    const session = this.state.sessions.find((s) => s.refresh_token === refreshTokenValue);
    if (!session) return null;
    session.token = crypto.randomBytes(24).toString('hex');
    session.expires_at = Date.now() + 7 * 24 * 60 * 60 * 1000;
    this.persist();
    return session;
  }

  revokeToken(token: string) {
    this.state.sessions = this.state.sessions.filter((s) => s.token !== token);
    this.persist();
  }

  getBookmarks(userId: string): MangaBookmarkRecord[] {
    return this.state.bookmarks
      .filter((b) => b.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  upsertBookmark(
    userId: string,
    item: { manga_id: string; title: string; image: string; latest_chapter?: string }
  ): MangaBookmarkRecord {
    const existing = this.state.bookmarks.find(
      (b) => b.user_id === userId && b.manga_id === item.manga_id
    );
    if (existing) {
      existing.title = item.title || existing.title;
      existing.image = item.image || existing.image;
      existing.latest_chapter = item.latest_chapter || existing.latest_chapter;
      this.persist();
      return existing;
    }
    const created: MangaBookmarkRecord = {
      user_id: userId,
      manga_id: item.manga_id,
      title: item.title,
      image: item.image,
      latest_chapter: item.latest_chapter || '',
      created_at: new Date().toISOString(),
    };
    this.state.bookmarks.push(created);
    this.persist();
    return created;
  }

  removeBookmark(userId: string, mangaId: string) {
    this.state.bookmarks = this.state.bookmarks.filter(
      (b) => !(b.user_id === userId && b.manga_id === mangaId)
    );
    this.persist();
  }

  getHistory(userId: string): ReadingHistoryRecord[] {
    return this.state.reading_history
      .filter((h) => h.user_id === userId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 30);
  }

  saveHistory(
    userId: string,
    input: {
      manga_id: string;
      manga_title: string;
      manga_image: string;
      chapter_id: string;
      chapter_name: string;
      page_index: number;
    }
  ): ReadingHistoryRecord {
    const now = new Date().toISOString();
    const existing = this.state.reading_history.find(
      (h) => h.user_id === userId && h.manga_id === input.manga_id
    );
    if (existing) {
      existing.manga_title = input.manga_title || existing.manga_title;
      existing.manga_image = input.manga_image || existing.manga_image;
      existing.chapter_id = input.chapter_id;
      existing.chapter_name = input.chapter_name;
      existing.page_index = Math.max(0, input.page_index);
      existing.updated_at = now;
      this.persist();
      return existing;
    }
    const created: ReadingHistoryRecord = {
      user_id: userId,
      manga_id: input.manga_id,
      manga_title: input.manga_title,
      manga_image: input.manga_image,
      chapter_id: input.chapter_id,
      chapter_name: input.chapter_name,
      page_index: Math.max(0, input.page_index),
      updated_at: now,
    };
    this.state.reading_history.push(created);
    this.persist();
    return created;
  }
}

export const db = new MangaRepository();
