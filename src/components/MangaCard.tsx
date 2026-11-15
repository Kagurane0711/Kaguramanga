import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import type { MangaListItem } from '../types/manga.ts';

interface MangaCardProps {
  manga: MangaListItem;
}

export default function MangaCard({ manga }: MangaCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <Link
      to={`/manga/${encodeURIComponent(manga.id)}`}
      className="group flex flex-col bg-white border border-zinc-200 rounded-xl overflow-hidden hover:border-zinc-400 transition-colors"
    >
      <div className="relative aspect-[3/4] bg-zinc-100 overflow-hidden">
        {manga.image && !imgFailed ? (
          <img
            src={manga.image}
            alt={manga.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-950 flex flex-col items-center justify-center p-4 text-center">
            <BookOpen className="w-7 h-7 text-zinc-400 mb-2" />
            <span className="text-xs font-medium text-zinc-300 line-clamp-3">
              {manga.title}
            </span>
          </div>
        )}
      </div>

      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2">
        <h3
          className="font-display text-sm font-semibold text-zinc-950 group-hover:text-rose-600 transition-colors line-clamp-2 leading-snug"
          title={manga.title}
        >
          {manga.title}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono-nums truncate">
          <span className="truncate">{manga.chapter || 'Ongoing'}</span>
          {manga.view && manga.view !== '—' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{manga.view}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
