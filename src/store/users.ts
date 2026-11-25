import { create } from 'zustand';
import {
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  sanitizeBlueprintImage,
  sanitizeBlueprintText,
  toSafeFirestoreId,
} from '../firebase.ts';
import type { MangaBookmark, ReadingHistoryItem, User } from '../types/manga.ts';

const GUEST_BOOKMARKS_KEY = 'polin_guest_bookmarks';
const GUEST_HISTORY_KEY = 'polin_guest_history';
const LEGACY_TOKEN_KEYS = [
  'mangaAccessToken',
  'mangaRefreshToken',
  'mangaExpireTime',
  'mangaTokenTimestamp',
] as const;

function purgeLegacyLocalTokens() {
  if (typeof window === 'undefined') return;
  try {
    for (const key of LEGACY_TOKEN_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
}

purgeLegacyLocalTokens();

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors
  }
}

function clearAllLocalLibraryData() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(GUEST_BOOKMARKS_KEY);
    window.localStorage.removeItem(GUEST_HISTORY_KEY);
    for (const key of LEGACY_TOKEN_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return new Date().toISOString();
}

function mapFirebaseUser(fbUser: FirebaseUser): User {
  const fullName = (fbUser.displayName || fbUser.email?.split('@')[0] || 'Reader').trim();
  const [given, ...rest] = fullName.split(/\s+/);
  return {
    id: fbUser.uid,
    email: fbUser.email || '',
    given_name: given || 'Reader',
    family_name: rest.join(' '),
    photoUrl: sanitizeBlueprintImage(fbUser.photoURL, 512),
  };
}

// Deduplicate concurrent profile syncs (e.g., signInWithGoogle + onAuthStateChanged firing together)
const profileSyncInFlight = new Map<string, Promise<void>>();
const syncedProfileUids = new Set<string>();

async function runProfileSync(fbUser: FirebaseUser): Promise<void> {
  // Ensure the verified Firebase Auth ID token is ready before Firestore reads/writes
  await fbUser.getIdToken();

  const uid = fbUser.uid;
  const displayName = sanitizeBlueprintText(
    fbUser.displayName || fbUser.email?.split('@')[0],
    80,
    'Reader'
  );
  const photoUrl = sanitizeBlueprintImage(fbUser.photoURL, 512);
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  // Atomic check-then-create/update prevents duplicate setDoc collisions on first login
  try {
    await runTransaction(db, async (tx) => {
      const existingProfile = await tx.get(userRef);
      if (!existingProfile.exists()) {
        tx.set(userRef, {
          uid,
          displayName,
          photoUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(userRef, {
          displayName,
          photoUrl,
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  const email = sanitizeBlueprintText(fbUser.email, 254, '');
  if (email.length >= 3) {
    const privatePath = `users/${uid}/private/info`;
    const privateRef = doc(db, 'users', uid, 'private', 'info');
    try {
      await runTransaction(db, async (tx) => {
        const existingPrivate = await tx.get(privateRef);
        if (!existingPrivate.exists()) {
          tx.set(privateRef, {
            uid,
            email,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.update(privateRef, {
            email,
            updatedAt: serverTimestamp(),
          });
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }

  syncedProfileUids.add(uid);
}

function ensureUserProfileDocuments(fbUser: FirebaseUser): Promise<void> {
  const uid = fbUser.uid;
  if (syncedProfileUids.has(uid)) {
    return Promise.resolve();
  }
  const existing = profileSyncInFlight.get(uid);
  if (existing) {
    return existing;
  }
  const task = runProfileSync(fbUser).finally(() => {
    profileSyncInFlight.delete(uid);
  });
  profileSyncInFlight.set(uid, task);
  return task;
}

let authUnsubscribe: Unsubscribe | null = null;
let bookmarksUnsubscribe: Unsubscribe | null = null;
let historyUnsubscribe: Unsubscribe | null = null;
let isDeletingAccount = false;

function stopLibraryListeners() {
  if (bookmarksUnsubscribe) {
    bookmarksUnsubscribe();
    bookmarksUnsubscribe = null;
  }
  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }
}

async function deleteSubcollectionDocs(uid: string, subcollection: 'bookmarks' | 'history') {
  const path = `users/${uid}/${subcollection}`;
  try {
    const q = query(collection(db, 'users', uid, subcollection), where('userId', '==', uid));
    const snap = await getDocs(q);
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + 450)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

interface UsersState {
  authReady: boolean;
  user: User | null;
  bookmarks: MangaBookmark[];
  history: ReadingHistoryItem[];
  loggedIn: boolean;
  initAuth: () => void;
  signInWithGoogle: () => Promise<User>;
  toggleBookmark: (item: {
    manga_id: string;
    title: string;
    image: string;
    latest_chapter?: string;
  }) => Promise<boolean>;
  recordProgress: (item: {
    manga_id: string;
    manga_title: string;
    manga_image: string;
    chapter_id: string;
    chapter_name: string;
    page_index: number;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const useUsers = create<UsersState>((set, get) => ({
  authReady: false,
  user: null,
  bookmarks: readLocalJson<MangaBookmark[]>(GUEST_BOOKMARKS_KEY, []),
  history: readLocalJson<ReadingHistoryItem[]>(GUEST_HISTORY_KEY, []),
  loggedIn: false,

  initAuth: () => {
    if (authUnsubscribe) return;

    authUnsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (isDeletingAccount) return;
      stopLibraryListeners();

      if (!fbUser || !fbUser.emailVerified) {
        syncedProfileUids.clear();
        set({
          authReady: true,
          user: null,
          loggedIn: false,
          bookmarks: readLocalJson<MangaBookmark[]>(GUEST_BOOKMARKS_KEY, []),
          history: readLocalJson<ReadingHistoryItem[]>(GUEST_HISTORY_KEY, []),
        });
        return;
      }

      const mappedUser = mapFirebaseUser(fbUser);
      set({
        authReady: true,
        user: mappedUser,
        loggedIn: true,
      });

      void ensureUserProfileDocuments(fbUser)
        .then(() => {
          if (auth.currentUser?.uid !== fbUser.uid) return;

          const uid = fbUser.uid;
          const bookmarksPath = `users/${uid}/bookmarks`;
          const bookmarksQuery = query(
            collection(db, 'users', uid, 'bookmarks'),
            where('userId', '==', uid)
          );

          bookmarksUnsubscribe = onSnapshot(
            bookmarksQuery,
            (snapshot) => {
              const items: MangaBookmark[] = snapshot.docs
                .map((d) => {
                  const data = d.data();
                  return {
                    user_id: String(data.userId || uid),
                    manga_id: String(data.mangaId || d.id),
                    title: String(data.title || ''),
                    image: String(data.image || ''),
                    latest_chapter: String(data.latestChapter || ''),
                    created_at: timestampToIso(data.createdAt),
                  };
                })
                .sort((a, b) => b.created_at.localeCompare(a.created_at));
              set({ bookmarks: items });
            },
            (error) => {
              handleFirestoreError(error, OperationType.LIST, bookmarksPath);
            }
          );

          const historyPath = `users/${uid}/history`;
          const historyQuery = query(
            collection(db, 'users', uid, 'history'),
            where('userId', '==', uid)
          );

          historyUnsubscribe = onSnapshot(
            historyQuery,
            (snapshot) => {
              const items: ReadingHistoryItem[] = snapshot.docs
                .map((d) => {
                  const data = d.data();
                  return {
                    user_id: String(data.userId || uid),
                    manga_id: String(data.mangaId || d.id),
                    manga_title: String(data.mangaTitle || ''),
                    manga_image: String(data.mangaImage || ''),
                    chapter_id: String(data.chapterId || ''),
                    chapter_name: String(data.chapterName || ''),
                    page_index: typeof data.pageIndex === 'number' ? data.pageIndex : 0,
                    updated_at: timestampToIso(data.updatedAt),
                  };
                })
                .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                .slice(0, 30);
              set({ history: items });
            },
            (error) => {
              handleFirestoreError(error, OperationType.LIST, historyPath);
            }
          );
        })
        .catch((err) => {
          console.error('Failed to sync Firebase user profile:', err);
        });
    });
  },

  signInWithGoogle: async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const fbUser = result.user;
    if (!fbUser.emailVerified) {
      await firebaseSignOut(auth);
      throw new Error('Your Google account email must be verified to sync your library.');
    }
    await ensureUserProfileDocuments(fbUser);
    const mapped = mapFirebaseUser(fbUser);
    set({ user: mapped, loggedIn: true, authReady: true });
    return mapped;
  },

  toggleBookmark: async (item) => {
    const fbUser = auth.currentUser;
    const isSaved = get().bookmarks.some((b) => b.manga_id === item.manga_id);

    if (!fbUser || !fbUser.emailVerified) {
      const current = readLocalJson<MangaBookmark[]>(GUEST_BOOKMARKS_KEY, []);
      const next = isSaved
        ? current.filter((b) => b.manga_id !== item.manga_id)
        : [
            {
              manga_id: item.manga_id,
              title: sanitizeBlueprintText(item.title, 240, 'Untitled'),
              image: sanitizeBlueprintImage(item.image, 1024),
              latest_chapter: sanitizeBlueprintText(item.latest_chapter, 120, ''),
              created_at: new Date().toISOString(),
            },
            ...current,
          ];
      writeLocalJson(GUEST_BOOKMARKS_KEY, next);
      set({ bookmarks: next });
      return !isSaved;
    }

    await ensureUserProfileDocuments(fbUser);
    const uid = fbUser.uid;
    const docId = toSafeFirestoreId(item.manga_id);
    const docPath = `users/${uid}/bookmarks/${docId}`;
    const ref = doc(db, 'users', uid, 'bookmarks', docId);

    if (isSaved) {
      try {
        await deleteDoc(ref);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, docPath);
      }
      return false;
    }

    const payloadTitle = sanitizeBlueprintText(item.title, 240, 'Untitled');
    const payloadImage = sanitizeBlueprintImage(item.image, 1024);
    const payloadChapter = sanitizeBlueprintText(item.latest_chapter, 120, '');

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) {
          tx.update(ref, {
            title: payloadTitle,
            image: payloadImage,
            latestChapter: payloadChapter,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(ref, {
            userId: uid,
            mangaId: docId,
            title: payloadTitle,
            image: payloadImage,
            latestChapter: payloadChapter,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
    return true;
  },

  recordProgress: async (item) => {
    const entry: ReadingHistoryItem = {
      ...item,
      manga_title: sanitizeBlueprintText(item.manga_title, 240, 'Untitled'),
      manga_image: sanitizeBlueprintImage(item.manga_image, 1024),
      chapter_id: sanitizeBlueprintText(item.chapter_id, 180, 'chapter'),
      chapter_name: sanitizeBlueprintText(item.chapter_name, 160, 'Chapter'),
      page_index: Number.isFinite(item.page_index)
        ? Math.max(0, Math.min(10000, Math.floor(item.page_index)))
        : 0,
      updated_at: new Date().toISOString(),
    };

    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      const currentGuest = readLocalJson<ReadingHistoryItem[]>(GUEST_HISTORY_KEY, []);
      const nextGuest = [
        entry,
        ...currentGuest.filter((h) => h.manga_id !== item.manga_id),
      ].slice(0, 30);
      writeLocalJson(GUEST_HISTORY_KEY, nextGuest);
      set({ history: nextGuest });
      return;
    }

    await ensureUserProfileDocuments(fbUser);
    const uid = fbUser.uid;
    const docId = toSafeFirestoreId(item.manga_id);
    const docPath = `users/${uid}/history/${docId}`;
    const ref = doc(db, 'users', uid, 'history', docId);

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists()) {
          tx.update(ref, {
            mangaTitle: entry.manga_title,
            mangaImage: entry.manga_image,
            chapterId: entry.chapter_id,
            chapterName: entry.chapter_name,
            pageIndex: entry.page_index,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(ref, {
            userId: uid,
            mangaId: docId,
            mangaTitle: entry.manga_title,
            mangaImage: entry.manga_image,
            chapterId: entry.chapter_id,
            chapterName: entry.chapter_name,
            pageIndex: entry.page_index,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  },

  signOut: async () => {
    stopLibraryListeners();
    syncedProfileUids.clear();
    await firebaseSignOut(auth);
    set({
      user: null,
      loggedIn: false,
      bookmarks: readLocalJson<MangaBookmark[]>(GUEST_BOOKMARKS_KEY, []),
      history: readLocalJson<ReadingHistoryItem[]>(GUEST_HISTORY_KEY, []),
    });
  },

  deleteAccount: async () => {
    if (isDeletingAccount) return;
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      throw new Error('You must be signed in with a verified account to delete it.');
    }

    isDeletingAccount = true;
    try {
      const uid = fbUser.uid;

      // Let any in-flight profile sync settle so it cannot recreate users/{uid} after deletion
      const inflightSync = profileSyncInFlight.get(uid);
      if (inflightSync) {
        await inflightSync.catch(() => undefined);
      }

      // Re-authenticate before wiping any Firestore data if the sign-in session is older than 4 minutes
      const lastSignInMs = fbUser.metadata.lastSignInTime
        ? Date.parse(fbUser.metadata.lastSignInTime)
        : 0;
      if (!lastSignInMs || Date.now() - lastSignInMs > 4 * 60 * 1000) {
        await reauthenticateWithPopup(fbUser, googleProvider);
      }
      await fbUser.getIdToken(true);

      // Stop real-time listeners before wiping cloud documents
      stopLibraryListeners();

      // 1. Delete subcollection documents first while parent users/{uid} still exists (required by firestore.rules)
      await deleteSubcollectionDocs(uid, 'bookmarks');
      await deleteSubcollectionDocs(uid, 'history');

      // 2. Delete private PII document
      const privatePath = `users/${uid}/private/info`;
      try {
        await deleteDoc(doc(db, 'users', uid, 'private', 'info'));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, privatePath);
      }

      // 3. Delete root user profile document
      const userPath = `users/${uid}`;
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, userPath);
      }

      // 4. Delete the Firebase Authentication user account
      try {
        await deleteUser(fbUser);
      } catch (err) {
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        if (code === 'auth/requires-recent-login') {
          await reauthenticateWithPopup(fbUser, googleProvider);
          await deleteUser(fbUser);
        } else {
          throw err;
        }
      }

      // 5. Wipe local caches and reset application state cleanly
      syncedProfileUids.clear();
      clearAllLocalLibraryData();
      set({
        authReady: true,
        user: null,
        loggedIn: false,
        bookmarks: [],
        history: [],
      });
    } finally {
      isDeletingAccount = false;
    }
  },
}));

export default useUsers;
