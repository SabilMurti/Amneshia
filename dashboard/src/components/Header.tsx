import React, { useEffect, useState } from 'react';
import { Search, Server, ShieldCheck, Database, GitMerge, FileOutput } from 'lucide-react';
import { Moon } from 'lucide-react';
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
    // Poll stats occasionally
    const interval = setInterval(refreshStats, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-[#121215] border-b border-[#27272a] py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      {/* Search & Domain Filter form */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 flex-1 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search memories (FTS5 enabled)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 pl-9 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#f59e0b] focus:ring-1 focus:ring-[#f59e0b] transition-all"
          />
        </div>
        
        {/* Domain Filter Dropdown */}
        <select
          value={selectedDomain}
          onChange={(e) => setSelectedDomain(e.target.value)}
          className="bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-sm font-mono text-zinc-300 focus:outline-none focus:border-[#f59e0b] transition-all cursor-pointer"
        >
          <option value="">All Domains</option>
          {domains.map((dom) => (
            <option key={dom} value={dom}>
              {dom}
            </option>
          ))}
        </select>
      </form>

      {/* Right Stats & Status Badge row */}
      <div className="flex items-center gap-6">
        {/* Memory Stats Pills */}
        <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-1.5 bg-[#09090b] border border-[#27272a] px-2.5 py-1 rounded">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span>Entities: <strong className="text-zinc-200">{stats?.totalEntities ?? 0}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#09090b] border border-[#27272a] px-2.5 py-1 rounded">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>Observations: <strong className="text-zinc-200">{stats?.totalObservations ?? 0}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#09090b] border border-[#27272a] px-2.5 py-1 rounded">
            <GitMerge className="w-3.5 h-3.5 text-green-400" />
            <span>Relations: <strong className="text-zinc-200">{stats?.totalRelations ?? 0}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#09090b] border border-[#27272a] px-2.5 py-1 rounded">
            <FileOutput className="w-3.5 h-3.5 text-purple-400" />
            <span>Targets: <strong className="text-zinc-200">{stats?.totalExportTargets ?? 0}</strong></span>
          </div>
        </div>

        {/* Sync Bridge Button */}
        <button
          onClick={onSyncBridge}
          type="button"
          className="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-black px-3.5 py-1.5 rounded font-mono text-xs font-bold transition-all active:scale-[0.97]"
        >
          <span>⚡ Sync Bridge MCPs</span>
        </button>

        {/* Sleep Cycle Button */}
        <button
          onClick={onConsolidate}
          type="button"
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded font-mono text-xs font-bold transition-all active:scale-[0.97]"
          title="Consolidate memory engine observations, resolve conflicts, and run sleep cycle"
        >
          <Moon className="w-3.5 h-3.5" />
          <span>🌙 Sleep Cycle</span>
        </button>

        {/* Server Status Indicator Badge */}
        <div className="flex items-center gap-2 bg-zinc-900 border border-[#27272a] px-3 py-1.5 rounded select-none">
          <Server className="w-3.5 h-3.5 text-green-400" />
          <span className="text-[11px] font-mono text-zinc-300 font-semibold uppercase tracking-wider">Connected</span>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
        </div>
      </div>
    </header>
  );
};
