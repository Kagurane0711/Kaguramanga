import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar.tsx';
import Footer from '../components/Footer.tsx';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-[#faf9f7] text-zinc-900 dark:bg-[#111114] dark:text-zinc-100 amoled:bg-black amoled:text-zinc-50 transition-colors">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-16">
        <span className="font-mono-nums text-6xl font-bold text-rose-600 dark:text-rose-500 mb-4">404</span>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-950 dark:text-zinc-50 mb-2">
          Page Not Found
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mb-8">
          The page or manga chapter you requested could not be found.
        </p>
        <Link
          to="/"
          className="px-5 py-2.5 bg-zinc-950 hover:bg-rose-600 text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Back to Catalog
        </Link>
      </main>

      <Footer />
    </div>
  );
}
