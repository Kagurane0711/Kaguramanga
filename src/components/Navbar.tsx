import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Menu, X } from 'lucide-react';
import useUsers from '../store/users.ts';
import useCatalogBrand, { type CatalogBrand } from '../store/catalogMode.ts';
import useLoginModal from '../store/loginModal.ts';
import ThemeToggle from './ThemeToggle.tsx';

const BRAND_OPTIONS: Array<{
  id: CatalogBrand;
  name: string;
  description: string;
  to: string;
}> = [
  {
    id: 'manga',
    name: 'Kagura Manga',
    description: 'Japanese manga catalog & latest chapters',
    to: '/',
  },
  {
    id: 'manhwa',
    name: 'Kagura Manhwa',
    description: 'Korean manhwa & full-color webtoons',
    to: '/manhwa',
  },
];

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const brandDropdownRef = useRef<HTMLDivElement>(null);

  const { user, loggedIn } = useUsers();
  const { brand, setBrand } = useCatalogBrand();
  const openLoginModal = useLoginModal((state) => state.openLoginModal);
  const location = useLocation();
  const navigate = useNavigate();

  // Keep active catalog brand synced with root catalog routes
  useEffect(() => {
    if (location.pathname.startsWith('/manhwa') && brand !== 'manhwa') {
      setBrand('manhwa');
    } else if (location.pathname === '/' && brand !== 'manga') {
      setBrand('manga');
    }
  }, [location.pathname, brand, setBrand]);

  // Close brand dropdown on outside click or Escape key
  useEffect(() => {
    if (!brandMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        brandDropdownRef.current &&
        !brandDropdownRef.current.contains(event.target as Node)
      ) {
        setBrandMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBrandMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [brandMenuOpen]);

  const handleSelectBrand = (nextBrand: CatalogBrand, targetPath: string) => {
    setBrand(nextBrand);
    setBrandMenuOpen(false);
    setMobileMenuOpen(false);
    navigate(targetPath);
  };

  const activeBrand =
    BRAND_OPTIONS.find((opt) => opt.id === brand) || BRAND_OPTIONS[0];
  const isLoggedIn = Boolean(user && loggedIn);

  const navLinks = [
    { to: activeBrand.to, label: 'Discover' },
    { to: '/genres', label: 'Genres' },
    { to: '/search', label: 'Search' },
    { to: '/library', label: 'Library' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/manhwa') return location.pathname.startsWith('/manhwa');
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#111114]/95 amoled:bg-black/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand switcher dropdown (Kagura Manga / Kagura Manhwa) */}
        <div ref={brandDropdownRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setBrandMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={brandMenuOpen}
            aria-label="Switch between Kagura Manga and Kagura Manhwa"
            className="inline-flex items-center gap-2 py-1.5 -ml-2 px-2 rounded-lg font-display text-xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 amoled:hover:bg-zinc-900 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <img
              src="/assets/aistudio/Code_Generated_Image_2__522eac25.png"
              alt=""
              aria-hidden="true"
              className="w-6 h-6 rounded-md object-cover shrink-0"
            />
            <span>{activeBrand.name}</span>
            <ChevronDown
              className={`w-4 h-4 text-zinc-500 dark:text-zinc-400 transition-transform duration-150 ${
                brandMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {brandMenuOpen && (
            <div
              role="menu"
              aria-label="Select catalog"
              className="absolute left-0 mt-2 w-64 rounded-xl bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-800 shadow-lg p-1.5 z-50"
            >
              {BRAND_OPTIONS.map((opt) => {
                const selected = opt.id === brand;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => handleSelectBrand(opt.id, opt.to)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-zinc-100 dark:bg-zinc-800/80 amoled:bg-zinc-900 text-zinc-950 dark:text-zinc-50'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 amoled:hover:bg-zinc-900/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-display text-sm font-bold leading-snug">
                        {opt.name}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {opt.description}
                      </div>
                    </div>
                    {selected && (
                      <Check className="w-4 h-4 text-rose-600 dark:text-rose-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.label}
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
            <button
              type="button"
              onClick={openLoginModal}
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
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
                key={link.label}
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
            {isLoggedIn ? (
              <Link
                to="/library"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-center px-4 py-2.5 text-sm font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors"
              >
                {user?.given_name || 'My Library'}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openLoginModal();
                }}
                className="block w-full text-center px-4 py-2.5 text-sm font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
