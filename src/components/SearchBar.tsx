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
      <div className="flex items-center bg-white border border-zinc-300 rounded-lg overflow-hidden focus-within:border-zinc-950 focus-within:ring-1 focus-within:ring-zinc-950 transition-shadow">
        <Search className="w-4 h-4 text-zinc-400 ml-3.5 shrink-0" />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 text-sm text-zinc-950 placeholder-zinc-400 bg-transparent focus:outline-none min-w-0"
        />
        <button
          type="submit"
          className="px-4 py-2.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-rose-600 transition-colors whitespace-nowrap shrink-0"
        >
          Search
        </button>
      </div>
    </form>
  );
}
