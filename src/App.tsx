import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import Home from './routes/Home.tsx';
import useTheme from './store/theme.ts';

const Manhwa = lazy(() => import('./routes/Manhwa.tsx'));
const Genres = lazy(() => import('./routes/Genres.tsx'));
const MangaDetail = lazy(() => import('./routes/MangaDetail.tsx'));
const MangaReader = lazy(() => import('./routes/MangaReader.tsx'));
const SearchPage = lazy(() => import('./routes/SearchPage.tsx'));
const Library = lazy(() => import('./routes/Library.tsx'));
const Login = lazy(() => import('./routes/Login.tsx'));
const NotFound = lazy(() => import('./routes/NotFound.tsx'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf9f7] dark:bg-[#111114] amoled:bg-black transition-colors">
      <div className="w-7 h-7 rounded-full border-2 border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 border-t-rose-600 animate-spin" />
    </div>
  );
}

export default function App() {
  const { theme } = useTheme();

  return (
    <>
      <ToastContainer
        position="top-center"
        autoClose={2500}
        newestOnTop
        theme={theme === 'light' ? 'light' : 'dark'}
      />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/manhwa" element={<Manhwa />} />
          <Route path="/genres" element={<Genres />} />
          <Route path="/genres/:category" element={<Genres />} />
          <Route path="/manga/:id" element={<MangaDetail />} />
          <Route path="/read/:id/:ch" element={<MangaReader />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/search/:query" element={<SearchPage />} />
          <Route path="/library" element={<Library />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
