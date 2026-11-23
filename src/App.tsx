import { Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import Home from './routes/Home.tsx';
import Genres from './routes/Genres.tsx';
import MangaDetail from './routes/MangaDetail.tsx';
import MangaReader from './routes/MangaReader.tsx';
import SearchPage from './routes/SearchPage.tsx';
import Library from './routes/Library.tsx';
import Login from './routes/Login.tsx';
import NotFound from './routes/NotFound.tsx';
import useTheme from './store/theme.ts';

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
      <Routes>
        <Route path="/" element={<Home />} />
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
    </>
  );
}
