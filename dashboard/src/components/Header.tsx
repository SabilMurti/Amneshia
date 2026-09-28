import React, { useEffect, useState } from 'react';
import { Search, ShieldCheck, Database, GitMerge, FileOutput, Moon, Zap } from 'lucide-react';
import type { MemoryStats } from '../types';

interface HeaderProps {
  onSearch: (query: string) => void;
  selectedDomain: string;
  setSelectedDomain: (domain: string) => void;
  domains: string[];
  stats: MemoryStats | null;
  refreshStats: () => void;
  onSyncBridge: () => void;
  onConsolidate: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onSearch,
  selectedDomain,
  setSelectedDomain,
  domains,
  stats,
  refreshStats,
  onSyncBridge,
  onConsolidate,
}) => {
  const [query, setQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="glass-panel border-b border-white/[0.08] py-3.5 px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 z-20 select-none">
      {/* Search & Domain Filter form */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2.5 flex-1 max-w-xl">
        <div className="relative flex-1 group">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-zinc-500 group-focus-within:text-amber-400 transition-colors" />
          <input
            type="text"
            placeholder="Search memories, facts, entities (FTS5 enabled)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 pl-10 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-inner"
          />
        </div>

        {/* Domain Filter Dropdown */}
        <div className="relative">
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-amber-500/50 transition-all cursor-pointer hover:border-white/20 shadow-inner"
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
      <div className="flex flex-wrap items-center gap-3">
        {/* Memory Stats Pills with Tabular Figures */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-2 bg-black/30 border border-white/[0.08] px-3 py-1.5 rounded-xl shadow-sm">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-zinc-400">Entities:</span>
            <span className="text-white font-bold tabular-nums">{stats?.totalEntities ?? 0}</span>
          </div>

          <div className="flex items-center gap-2 bg-black/30 border border-white/[0.08] px-3 py-1.5 rounded-xl shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-zinc-400">Facts:</span>
            <span className="text-white font-bold tabular-nums">{stats?.totalObservations ?? 0}</span>
          </div>

          <div className="flex items-center gap-2 bg-black/30 border border-white/[0.08] px-3 py-1.5 rounded-xl shadow-sm">
            <GitMerge className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-400">Links:</span>
            <span className="text-white font-bold tabular-nums">{stats?.totalRelations ?? 0}</span>
          </div>

          <div className="flex items-center gap-2 bg-black/30 border border-white/[0.08] px-3 py-1.5 rounded-xl shadow-sm">
            <FileOutput className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-zinc-400">Targets:</span>
            <span className="text-white font-bold tabular-nums">{stats?.totalExportTargets ?? 0}</span>
          </div>
        </div>

        {/* Sync Bridge Button */}
        <button
          onClick={onSyncBridge}
          type="button"
          className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold transition-all shadow-glow-amber active:scale-[0.97]"
        >
          <Zap className="w-3.5 h-3.5 fill-black" />
          <span>Sync Bridge</span>
        </button>

        {/* Sleep Cycle Button */}
        <button
          onClick={onConsolidate}
          type="button"
          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 hover:from-indigo-500 hover:to-purple-600 text-white px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold transition-all shadow-lg active:scale-[0.97] border border-indigo-400/30"
          title="Trigger Sleep Cycle to deduplicate observations, resolve semantic conflicts, and consolidate graph"
        >
          <Moon className="w-3.5 h-3.5 text-indigo-200 fill-indigo-200/30" />
          <span>Sleep Cycle</span>
        </button>

        {/* Live Engine Status Ping */}
        <div className="flex items-center gap-2 bg-black/40 border border-emerald-500/20 px-3 py-1.5 rounded-xl shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-mono text-emerald-300 font-bold uppercase tracking-wider">
            Connected
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
