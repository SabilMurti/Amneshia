import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Database,
  Network,
  Sparkles,
  ShieldAlert,
  FolderSync,
  Layers,
} from 'lucide-react';
import type { MemoryStats } from '../types';

interface HeaderProps {
  onSearch: (query: string) => void;
  selectedDomain: string;
  setSelectedDomain: (domain: string) => void;
  domains: string[];
  stats: MemoryStats | null;
  refreshStats: () => void;
  onSyncMarkdown: () => void;
  onRunMaintenance: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onSearch,
  selectedDomain,
  setSelectedDomain,
  domains,
  stats,
  refreshStats,
  onSyncMarkdown,
  onRunMaintenance,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  // Keyboard shortcut '/' to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="glass-panel border-b border-purple-500/15 py-3 px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 z-20 select-none bg-[#090714]/90 backdrop-blur-2xl">
      {/* Search & Domain Filter form */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2.5 flex-1 max-w-xl">
        <div className="relative flex-1 group">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-purple-400/60 group-focus-within:text-purple-300 transition-colors" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search memories, facts, entities (Press '/' to focus)…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearch(e.target.value);
            }}
            className="w-full bg-[#0e0c1f]/80 border border-purple-500/20 rounded-xl px-3.5 py-2 pl-10 pr-9 text-xs font-mono text-purple-100 placeholder-purple-300/40 focus:outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/25 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
          />
          <kbd className="absolute right-3 top-2 px-1.5 py-0.5 text-[9px] font-mono text-purple-300/60 bg-purple-950/40 border border-purple-500/20 rounded">
            /
          </kbd>
        </div>

        {/* Domain Filter Dropdown */}
        <div className="relative">
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="bg-[#0e0c1f]/80 border border-purple-500/20 rounded-xl px-3.5 py-2 text-xs font-mono text-purple-200 focus:outline-none focus:border-purple-400 transition-all cursor-pointer hover:border-purple-500/40 shadow-inner"
          >
            <option value="">All Domains</option>
            {domains.map((dom) => (
              <option key={dom} value={dom}>
                {dom}
              </option>
            ))}
          </select>
        </div>
      </form>

      {/* Right Stats & Action Bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Memory Stats Pills with Tabular Figures */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 bg-[#120f26]/80 border border-purple-500/20 px-3 py-1.5 rounded-xl shadow-sm">
            <Database className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-zinc-400">Entities:</span>
            <span className="text-purple-200 font-bold tabular-nums">{stats?.totalEntities ?? 0}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#120f26]/80 border border-purple-500/20 px-3 py-1.5 rounded-xl shadow-sm">
            <Layers className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-zinc-400">Facts:</span>
            <span className="text-violet-200 font-bold tabular-nums">{stats?.totalObservations ?? 0}</span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#120f26]/80 border border-purple-500/20 px-3 py-1.5 rounded-xl shadow-sm">
            <Network className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-zinc-400">Links:</span>
            <span className="text-indigo-200 font-bold tabular-nums">{stats?.totalRelations ?? 0}</span>
          </div>

          {(stats?.totalContradictions ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 bg-rose-950/40 border border-rose-500/30 px-3 py-1.5 rounded-xl shadow-sm animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-rose-300 font-bold tabular-nums">
                {stats?.totalContradictions} Conflict{stats?.totalContradictions === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>

        {/* Sync Markdown Button */}
        <button
          onClick={onSyncMarkdown}
          type="button"
          className="flex items-center gap-1.5 bg-purple-950/50 hover:bg-purple-900/50 border border-purple-500/30 text-purple-200 px-3.5 py-1.5 rounded-xl font-mono text-xs font-semibold transition-all hover:border-purple-400 active:scale-[0.97]"
          title="Export and sync all entities to .amneshia/knowledge/ Markdown files"
        >
          <FolderSync className="w-3.5 h-3.5 text-purple-400" />
          <span>Sync MD</span>
        </button>

        {/* Memory Maintenance Button */}
        <button
          onClick={onRunMaintenance}
          type="button"
          className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold transition-all shadow-glow-purple active:scale-[0.97] border border-purple-400/40"
          title="Run Memory Maintenance (Purge expired, authority decay, deduplicate facts)"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-200" />
          <span>Maintain</span>
        </button>

        {/* Engine Status Ping */}
        <div className="flex items-center gap-1.5 bg-[#120f26]/80 border border-emerald-500/25 px-2.5 py-1.5 rounded-xl shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-mono text-emerald-300 font-bold uppercase tracking-wider">
            v3.0
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
