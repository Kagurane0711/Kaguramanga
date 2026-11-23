import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

interface SearchBarProps {
  initialQuery?: string;
  placeholder?: string;
}

export default function SearchBar({
  initialQuery = '',
  placeholder = 'Search manga titles...',
}: SearchBarProps) {
  const [term, setTerm] = useState(initialQuery);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = term.trim();
    if (!clean) return;
    navigate(`/search/${encodeURIComponent(clean)}`);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex items-center gap-2 bg-white dark:bg-[#111114] amoled:bg-black border border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 rounded-lg p-1 pl-3 focus-within:border-zinc-950 dark:focus-within:border-zinc-400 focus-within:ring-1 focus-within:ring-zinc-950 dark:focus-within:ring-zinc-400 transition-shadow">
        <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          className="flex-1 h-8 text-sm text-zinc-950 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 bg-transparent focus:outline-none min-w-0"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center h-8 px-3.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Search
        </button>
      </div>
    </form>
  );
}
