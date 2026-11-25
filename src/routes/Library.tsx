import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import Navbar from '../components/Navbar.tsx';
import Footer from '../components/Footer.tsx';
import DeleteAccountModal from '../components/DeleteAccountModal.tsx';
import useLoginModal from '../store/loginModal.ts';
import useUsers from '../store/users.ts';

export default function Library() {
  const navigate = useNavigate();
  const { user, bookmarks, history, toggleBookmark, signOut, deleteAccount } = useUsers();
  const openLoginModal = useLoginModal((state) => state.openLoginModal);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const handleRemoveBookmark = async (mangaId: string, title: string) => {
    await toggleBookmark({ manga_id: mangaId, title, image: '' });
    toast.info(`Removed "${title}" from library.`);
  };

  const handleSignOut = async () => {
    await signOut();
    toast.info('Signed out.');
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    await deleteAccount();
    setDeleteModalOpen(false);
    toast.success('Your account and all synced data have been permanently deleted.');
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f7] text-zinc-900 dark:bg-[#111114] dark:text-zinc-100 amoled:bg-black amoled:text-zinc-50 transition-colors">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Account Banner */}
        <section className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
          <div>
            <h1 className="font-display text-2xl font-bold text-zinc-950 dark:text-zinc-50">
              {user ? `${user.given_name} ${user.family_name}`.trim() : 'Your Reading Library'}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {user
                ? `${user.email} · Synced to your account`
                : 'Stored locally in your browser. Sign in to sync bookmarks across sessions.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 amoled:bg-zinc-900 amoled:hover:bg-zinc-800 rounded-lg whitespace-nowrap transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50/70 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/60 border border-rose-200 dark:border-rose-900/70 rounded-lg whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Account</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={openLoginModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg whitespace-nowrap transition-colors cursor-pointer"
              >
                Sign In to Sync
              </button>
            )}
          </div>
        </section>

        {/* Continue Reading History */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 pb-3">
            <h2 className="font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
              Continue Reading
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-nums">
              {history.length} recent
            </span>
          </div>

          {history.length === 0 ? (
            <div className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl p-10 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No reading history yet. Open any chapter to track your progress automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.map((item) => (
                <Link
                  key={item.manga_id}
                  to={`/read/${encodeURIComponent(item.manga_id)}/${encodeURIComponent(item.chapter_id)}`}
                  className="flex items-center gap-4 bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl p-3.5 hover:border-zinc-400 dark:hover:border-zinc-600 amoled:hover:border-zinc-700 transition-colors group"
                >
                  <div className="w-16 h-22 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-900 amoled:bg-[#0e0e11] shrink-0">
                    {item.manga_image ? (
                      <img
                        src={item.manga_image}
                        alt={item.manga_title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-zinc-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 truncate">
                      {item.manga_title}
                    </h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate">{item.chapter_name}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono-nums">
                      Resume reading &rarr;
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Saved Bookmarks */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 pb-3">
            <h2 className="font-display text-xl font-bold text-zinc-950 dark:text-zinc-50">
              Saved Manga
            </h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-nums">
              {bookmarks.length} saved
            </span>
          </div>

          {bookmarks.length === 0 ? (
            <div className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl p-10 text-center space-y-3">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Your saved library is empty.
              </p>
              <Link
                to="/"
                className="inline-block text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
              >
                Browse manga catalog &rarr;
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {bookmarks.map((bm) => (
                <div
                  key={bm.manga_id}
                  className="bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 rounded-xl overflow-hidden flex flex-col transition-colors"
                >
                  <Link
                    to={`/manga/${encodeURIComponent(bm.manga_id)}`}
                    className="aspect-[3/4] bg-zinc-100 dark:bg-zinc-900 amoled:bg-[#0e0e11] overflow-hidden block"
                  >
                    {bm.image ? (
                      <img
                        src={bm.image}
                        alt={bm.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                        <BookOpen className="w-6 h-6 text-zinc-400" />
                      </div>
                    )}
                  </Link>
                  <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                    <Link
                      to={`/manga/${encodeURIComponent(bm.manga_id)}`}
                      className="font-display text-sm font-semibold text-zinc-950 dark:text-zinc-100 hover:text-rose-600 dark:hover:text-rose-400 line-clamp-2"
                    >
                      {bm.title}
                    </Link>
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 amoled:border-zinc-900">
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate font-mono-nums">
                        {bm.latest_chapter || 'Saved'}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${bm.title}`}
                        onClick={() => void handleRemoveBookmark(bm.manga_id, bm.title)}
                        className="p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />

      <DeleteAccountModal
        open={deleteModalOpen}
        email={user?.email || ''}
        bookmarksCount={bookmarks.length}
        historyCount={history.length}
        onClose={() => setDeleteModalOpen(false)}
        onConfirmDelete={handleDeleteAccount}
      />
    </div>
  );
}
