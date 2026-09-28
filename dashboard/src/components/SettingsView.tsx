import React, { useState } from 'react';
import {
  Settings, RefreshCw, Cpu, Heart, CheckCircle2,
  Sparkles, FolderSync, Trash2, ShieldCheck
} from 'lucide-react';
import type { MemoryStats } from '../types';
import { api } from '../api/client';

interface SettingsViewProps {
  stats: MemoryStats | null;
  refreshStats: () => void;
  onRunMaintenance: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  stats,
  refreshStats,
  onRunMaintenance,
}) => {
  const [isCleaning, setIsCleaning] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [isGcRunning, setIsGcRunning] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleCleanupExpired = async () => {
    setIsCleaning(true);
    setActionMessage(null);
    try {
      const res = await api.cleanupExpired();
      setActionMessage(`Cleanup complete: Purged ${res.cleanedCount} expired ephemeral records.`);
      refreshStats();
    } catch (err) {
      alert(`Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    setActionMessage(null);
    try {
      const res = await api.reindex();
      setActionMessage(`Reindex complete: Verified ${res.entities} entities, ${res.observations} facts, ${res.relations} relations from Markdown.`);
      refreshStats();
    } catch (err) {
      alert(`Reindex failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsReindexing(false);
    }
  };

  const handleRunGc = async () => {
    setIsGcRunning(true);
    setActionMessage(null);
    try {
      const res = await api.gc();
      setActionMessage(`Garbage collection complete: Removed ${res.removed} decayed/superseded records.`);
      refreshStats();
    } catch (err) {
      alert(`GC failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGcRunning(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-hidden bg-[#06050b] flex flex-col h-[calc(100vh-73px)] select-none">
      {/* Title */}
      <div className="mb-6 flex-shrink-0 border-b border-purple-500/15 pb-4">
        <h2 className="text-xl font-bold font-sans text-white flex items-center gap-2.5 tracking-tight">
          <Settings className="w-5 h-5 text-purple-400" />
          <span>System Settings & Architecture</span>
        </h2>
        <p className="font-mono text-xs text-zinc-400 mt-1">
          Amneshia v3.0 Enterprise Engine: Zero-LLM Deterministic Memory, Authority Tiers, and Storage Health.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 max-w-4xl pr-1">
        {/* Core Architecture Badge */}
        <section className="double-bezel-shell p-0 shadow-sm">
          <div className="double-bezel-core p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                <Cpu className="w-4.5 h-4.5 text-purple-400" />
                <span>Deterministic Zero-LLM Engine</span>
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>100% Deterministic</span>
              </div>
            </div>
            <p className="font-sans text-xs text-zinc-400 leading-relaxed">
              Amneshia v3.0 eliminates external AI reasoning inside the memory engine. Your facts are preserved with 100% fidelity without risk of LLM hallucinations or quota exhaustion.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-mono text-xs">
              <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/20">
                <span className="text-[11px] font-bold text-purple-300 block uppercase">Sub-Millisecond Retrieval</span>
                <span className="text-[10px] text-zinc-400 block mt-1">SQLite FTS5 BM25 search executes in &lt;1ms without network API latency.</span>
              </div>
              <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/20">
                <span className="text-[11px] font-bold text-purple-300 block uppercase">Authority Hierarchy</span>
                <span className="text-[10px] text-zinc-400 block mt-1">Invariant &gt; Architectural &gt; Contextual &gt; Ephemeral strict resolution.</span>
              </div>
              <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/20">
                <span className="text-[11px] font-bold text-purple-300 block uppercase">Dual-Write Markdown</span>
                <span className="text-[10px] text-zinc-400 block mt-1">Human-readable, git-trackable Markdown files mirrored in real-time.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Action Status HUD */}
        {actionMessage && (
          <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/30 font-mono text-xs text-purple-200 flex items-center gap-2.5 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Maintenance Controls */}
        <section className="double-bezel-shell p-0 shadow-sm">
          <div className="double-bezel-core p-6 space-y-4">
            <h3 className="font-sans text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <Sparkles className="w-4.5 h-4.5 text-purple-400" />
              <span>Memory Maintenance & Hygiene</span>
            </h3>
            <p className="font-sans text-xs text-zinc-400 leading-relaxed">
              Trigger instant deterministic maintenance routines: purge expired ephemeral facts, apply authority decay scores, and resolve duplicate observations.
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                onClick={onRunMaintenance}
                type="button"
                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all shadow-glow-purple active:scale-[0.98] border border-purple-400/30"
              >
                <Sparkles className="w-4 h-4 text-purple-200" />
                <span>Run Full Maintenance</span>
              </button>

              <button
                onClick={handleReindex}
                disabled={isReindexing}
                type="button"
                className="flex items-center gap-2 bg-black/40 hover:bg-purple-950/30 border border-purple-500/20 text-zinc-300 hover:text-white px-4 py-2.5 rounded-xl font-mono text-xs font-semibold transition-all active:scale-[0.98]"
              >
                <FolderSync className={`w-3.5 h-3.5 text-purple-400 ${isReindexing ? 'animate-spin' : ''}`} />
                <span>{isReindexing ? 'Reindexing...' : 'Reindex from Markdown'}</span>
              </button>

              <button
                onClick={handleRunGc}
                disabled={isGcRunning}
                type="button"
                className="flex items-center gap-2 bg-black/40 hover:bg-purple-950/30 border border-purple-500/20 text-zinc-300 hover:text-white px-4 py-2.5 rounded-xl font-mono text-xs font-semibold transition-all active:scale-[0.98]"
              >
                <Trash2 className={`w-3.5 h-3.5 text-indigo-400 ${isGcRunning ? 'animate-spin' : ''}`} />
                <span>{isGcRunning ? 'Running GC...' : 'Garbage Collection (GC)'}</span>
              </button>

              <button
                onClick={handleCleanupExpired}
                disabled={isCleaning}
                type="button"
                className="flex items-center gap-2 bg-black/40 hover:bg-purple-950/30 border border-purple-500/20 text-zinc-300 hover:text-white px-4 py-2.5 rounded-xl font-mono text-xs font-semibold transition-all active:scale-[0.98]"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${isCleaning ? 'animate-spin' : ''}`} />
                <span>{isCleaning ? 'Pruning...' : 'Purge Expired TTLs'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* System Health Stats */}
        <section className="double-bezel-shell p-0 shadow-sm">
          <div className="double-bezel-core p-6 space-y-4">
            <h3 className="font-sans text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <Heart className="w-4.5 h-4.5 text-emerald-400" />
              <span>Storage & Topology Metrics</span>
            </h3>
            <p className="font-sans text-xs text-zinc-400 leading-relaxed">
              Active SQLite graph tables, Dual-Write Markdown state, and memory cluster distributions.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-1 font-mono text-xs">
              <div className="p-4 rounded-xl bg-[#090714] border border-purple-500/20">
                <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Total Entities</span>
                <span className="text-2xl font-bold text-white mt-1 block tabular-nums">{stats?.totalEntities ?? 0}</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090714] border border-purple-500/20">
                <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Observations</span>
                <span className="text-2xl font-bold text-purple-300 mt-1 block tabular-nums">{stats?.totalObservations ?? 0}</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090714] border border-purple-500/20">
                <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Relations</span>
                <span className="text-2xl font-bold text-indigo-300 mt-1 block tabular-nums">{stats?.totalRelations ?? 0}</span>
              </div>
              <div className="p-4 rounded-xl bg-[#090714] border border-purple-500/20">
                <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Export Targets</span>
                <span className="text-2xl font-bold text-fuchsia-300 mt-1 block tabular-nums">{stats?.totalExportTargets ?? 0}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsView;
