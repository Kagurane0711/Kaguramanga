import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-zinc-500">
          © {currentYear} Polin Manga. Powered by MangaDex API.
        </p>
        <nav className="flex items-center gap-6 text-xs font-medium text-zinc-600">
          <Link to="/" className="hover:text-zinc-950 transition-colors whitespace-nowrap">
            Discover
          </Link>
          <Link to="/genres" className="hover:text-zinc-950 transition-colors whitespace-nowrap">
            Genres
          </Link>
          <Link to="/search" className="hover:text-zinc-950 transition-colors whitespace-nowrap">
            Search
          </Link>
          <Link to="/library" className="hover:text-zinc-950 transition-colors whitespace-nowrap">
            Library
          </Link>
        </nav>
      </div>
    </footer>
  );
}
