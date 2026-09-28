import React, { useState } from 'react';
import {
  Settings, RefreshCw, BrainCircuit, ShieldAlert, Heart, CheckCircle2,
  Moon, Check
} from 'lucide-react';
import type { MemoryStats } from '../types';
import { api } from '../api/client';

interface SettingsViewProps {
  stats: MemoryStats | null;
  refreshStats: () => void;
  onConsolidate: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  stats,
  refreshStats,
  onConsolidate,
}) => {
  const [provider, setProvider] = useState<'openai' | 'ollama' | '9router' | 'none'>('none');
  const [nineRouterModel, setNineRouterModel] = useState<string>('9router/ag/gemini-3-flash');
  const [customModel, setCustomModel] = useState<string>('');
  const [isUpdatingProvider, setIsUpdatingProvider] = useState(false);
  const [providerSuccess, setProviderSuccess] = useState(false);

  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanedCount, setCleanedCount] = useState<number | null>(null);

  const handleUpdateProvider = async (p: 'openai' | 'ollama' | '9router' | 'none', selectedModelOverride?: string) => {
    setIsUpdatingProvider(true);
    setProviderSuccess(false);
    try {
      const modelToSend = p === '9router' ? (selectedModelOverride || nineRouterModel) : undefined;
      await api.setAIProvider(p, modelToSend);
      setProvider(p);
      setProviderSuccess(true);
      setTimeout(() => setProviderSuccess(false), 3000);
    } catch (err) {
      alert(`Failed to set AI provider: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdatingProvider(false);
    }
  };

  const handleCleanupExpired = async () => {
    setIsCleaning(true);
    setCleanedCount(null);
    try {
      const res = await api.cleanupExpired();
      setCleanedCount(res.cleanedCount);
      refreshStats();
    } catch (err) {
      alert(`Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-hidden bg-[#06050b] flex flex-col h-[calc(100vh-73px)] select-none">
      {/* Title */}
      <div className="mb-6 flex-shrink-0 border-b border-purple-500/15 pb-4">
        <h2 className="text-xl font-bold font-sans text-white flex items-center gap-2.5 tracking-tight">
          <Settings className="w-5 h-5 text-purple-400" />
          <span>System Settings & Engine</span>
        </h2>
        <p className="font-mono text-xs text-zinc-400 mt-1">
          Configure memory reasoning providers, trigger Sleep Cycle consolidation, and inspect storage health.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 max-w-4xl pr-1">
        {/* LLM Provider Configuration */}
        <section className="double-bezel-shell p-0 shadow-sm">
          <div className="double-bezel-core p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                <BrainCircuit className="w-4.5 h-4.5 text-purple-400" />
                <span>AI Reasoning Engine</span>
              </h3>
              {providerSuccess && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Provider updated</span>
                </div>
              )}
            </div>
            <p className="font-sans text-xs text-zinc-400 leading-relaxed">
              Choose the inference engine for memory synthesis, auto-tagging, entity extraction, and Sleep Cycle deduplication.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 font-mono text-xs">
              {(['none', '9router', 'openai', 'ollama'] as const).map((p) => {
                const isActive = provider === p;
                return (
                  <button
                    key={p}
                    onClick={() => handleUpdateProvider(p)}
                    disabled={isUpdatingProvider}
                    className={`p-4 rounded-xl border transition-all text-left flex flex-col gap-1.5 ${
                      isActive
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-200 shadow-glow-purple'
                        : 'bg-black/30 border-purple-500/15 hover:border-purple-500/30 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase text-xs">
                        {p === '9router' ? '9router AG' : p}
                      </span>
                      {isActive && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </div>
                    <span className="text-[10px] text-zinc-500 leading-normal font-sans">
                      {p === 'none' && 'Deterministic zero-LLM mode. Pure BM25 & graph.'}
                      {p === '9router' && 'Free local 9router AG gateway (Gemini/Claude).'}
                      {p === 'openai' && 'Direct cloud OpenAI API keys.'}
                      {p === 'ollama' && 'Local Ollama endpoint server.'}
                    </span>
                  </button>
                );
              })}
            </div>

            {provider === '9router' && (
              <div className="pt-4 border-t border-purple-500/15 space-y-3 font-mono text-xs">
                <label className="block text-zinc-300 font-bold">9router Target Model:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { label: 'Gemini 3 Flash (Free AG)', value: '9router/ag/gemini-3-flash' },
                    { label: 'Gemini 3.1 Pro (Free AG)', value: '9router/ag/gemini-3.1-pro-low' },
                    { label: 'Claude Sonnet 4.6 (AG)', value: '9router/ag/claude-sonnet-4-6' }
                  ].map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => {
                        setNineRouterModel(m.value);
                        handleUpdateProvider('9router', m.value);
                      }}
                      className={`p-3 rounded-xl border text-left font-mono text-[11px] transition-all ${
                        nineRouterModel === m.value
                          ? 'bg-purple-500/25 border-purple-500 text-purple-200 font-bold shadow-glow-purple'
                          : 'bg-black/40 border-purple-500/15 hover:border-purple-500/30 text-zinc-400'
                      }`}
                    >
                      <div>{m.label}</div>
                      <div className="text-[9px] text-purple-400/60 truncate mt-0.5">{m.value}</div>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1 select-text">
                  <input
                    type="text"
                    placeholder="Or enter custom 9router model ID (e.g. 9router/ag/...)"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    className="flex-1 bg-black/50 border border-purple-500/20 focus:border-purple-400 rounded-xl px-3.5 py-2 text-zinc-100 text-xs font-mono outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customModel.trim()) {
                        setNineRouterModel(customModel.trim());
                        handleUpdateProvider('9router', customModel.trim());
                      }
                    }}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-glow-purple active:scale-[0.98]"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Sleep Cycle Consolidation */}
        <section className="double-bezel-shell p-0 shadow-sm">
          <div className="double-bezel-core p-6 space-y-4">
            <h3 className="font-sans text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <Moon className="w-4.5 h-4.5 text-purple-400" />
              <span>Memory Consolidation (Sleep Cycle)</span>
            </h3>
            <p className="font-sans text-xs text-zinc-400 leading-relaxed">
              Execute Jaccard similarity deduplication, resolve factual contradictions, and synthesize fragmented observations into coherent memory structures.
            </p>
            <div className="pt-1">
              <button
                onClick={onConsolidate}
                type="button"
                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all shadow-glow-purple active:scale-[0.98] border border-purple-400/30"
              >
                <Moon className="w-4 h-4 text-purple-200 fill-purple-200/30" />
                <span>Run Sleep Cycle Review</span>
              </button>
            </div>
          </div>
        </section>

        {/* Database Maintenance Tools */}
        <section className="double-bezel-shell p-0 shadow-sm">
          <div className="double-bezel-core p-6 space-y-4">
            <h3 className="font-sans text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <ShieldAlert className="w-4.5 h-4.5 text-rose-400" />
              <span>Database Pruning & Maintenance</span>
            </h3>
            <p className="font-sans text-xs text-zinc-400 leading-relaxed">
              Run SQLite VACUUM and garbage-collection routines to purge ephemeral memories past their TTL expiration date.
            </p>

            <div className="pt-1">
              <button
                onClick={handleCleanupExpired}
                disabled={isCleaning}
                className="flex items-center gap-2 bg-black/40 hover:bg-purple-950/20 border border-purple-500/20 text-zinc-300 hover:text-white px-4 py-2.5 rounded-xl font-mono text-xs font-semibold transition-all active:scale-[0.98]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCleaning ? 'animate-spin' : ''}`} />
                <span>{isCleaning ? 'Pruning database…' : 'Purge Expired Observations'}</span>
              </button>
            </div>

            {cleanedCount !== null && (
              <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/30 font-mono text-xs text-purple-200">
                Pruning sequence complete. Purged <strong className="text-purple-300">{cleanedCount}</strong> expired memory records.
              </div>
            )}
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
