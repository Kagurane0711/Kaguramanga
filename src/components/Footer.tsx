import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-[#111114] amoled:bg-black border-t border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          © {currentYear} Polin Manga. Powered by MangaHook API.
        </p>
        <nav className="flex items-center gap-6 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          <Link to="/" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors whitespace-nowrap">
            Discover
          </Link>
          <Link to="/genres" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors whitespace-nowrap">
            Genres
          </Link>
          <Link to="/search" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors whitespace-nowrap">
            Search
          </Link>
          <Link to="/library" className="hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors whitespace-nowrap">
            Library
          </Link>
        </nav>
      </div>
    </footer>
  );
}
