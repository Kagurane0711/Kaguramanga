import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import useUsers from '../store/users.ts';
import { getAccessToken } from '../authProvider.ts';
import ThemeToggle from './ThemeToggle.tsx';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, fetchUser, fetchLibrary } = useUsers();
  const location = useLocation();

  useEffect(() => {
    const token = getAccessToken();
    if (token && !user) {
      void fetchUser().then(() => fetchLibrary());
    }
  }, [user, fetchUser, fetchLibrary]);

  const isLoggedIn = Boolean(user || getAccessToken());

  const navLinks = [
    { to: '/', label: 'Discover' },
    { to: '/genres', label: 'Genres' },
    { to: '/search', label: 'Search' },
    { to: '/library', label: 'Library' },
  ];

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#111114]/95 amoled:bg-black/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark */}
        <Link
          to="/"
          className="font-display text-xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 whitespace-nowrap shrink-0"
        >
          Polin Manga
        </Link>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 ${
                isActive(link.to)
                  ? 'text-rose-600 dark:text-rose-500 border-rose-600 dark:border-rose-500'
                  : 'text-zinc-600 dark:text-zinc-400 border-transparent hover:text-zinc-950 dark:hover:text-zinc-100'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Zone 3: Theme selector & primary account action */}
        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          <ThemeToggle variant="dropdown" />
          {!isLoggedIn ? (
            <Link
              to="/login"
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          ) : (
            <Link
              to="/library"
              className="px-4 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 amoled:bg-zinc-900 amoled:hover:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {user?.given_name || 'Account'}
            </Link>
          )}
        </div>

        {/* Mobile menu trigger */}
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle variant="dropdown" compact />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 amoled:hover:bg-zinc-900 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 bg-white dark:bg-[#18181b] amoled:bg-black px-4 py-3 space-y-2">
          <div className="space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${
                  isActive(link.to)
                    ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 amoled:hover:bg-zinc-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 amoled:border-zinc-900 space-y-2.5">
            <ThemeToggle variant="segmented" />
            <Link
              to={isLoggedIn ? '/library' : '/login'}
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-center px-4 py-2.5 text-sm font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors"
            >
              {isLoggedIn ? user?.given_name || 'My Library' : 'Sign In'}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
