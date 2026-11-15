import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import useUsers from '../store/users.ts';
import { getAccessToken } from '../authProvider.ts';

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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand wordmark */}
        <Link
          to="/"
          className="font-display text-xl font-extrabold tracking-tight text-zinc-950 whitespace-nowrap shrink-0"
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
                  ? 'text-rose-600 border-rose-600'
                  : 'text-zinc-600 border-transparent hover:text-zinc-950'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="hidden md:flex items-center shrink-0">
          {!isLoggedIn ? (
            <Link
              to="/login"
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          ) : (
            <Link
              to="/library"
              className="px-4 py-2 text-xs font-semibold text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {user?.given_name || 'Account'}
            </Link>
          )}
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="md:hidden p-2 rounded-lg text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-200 bg-white px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${
                isActive(link.to)
                  ? 'text-rose-600 bg-rose-50'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-zinc-100">
            <Link
              to={isLoggedIn ? '/library' : '/login'}
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-center px-4 py-2.5 text-sm font-semibold text-white bg-zinc-950 rounded-lg"
            >
              {isLoggedIn ? user?.given_name || 'My Library' : 'Sign In'}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
