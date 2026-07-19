import React, { useState } from 'react';
import { Settings, RefreshCw, BrainCircuit, ShieldAlert, Heart, CheckCircle2 } from 'lucide-react';
import { Moon } from 'lucide-react';
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

  // Read current configuration
  // For Amneshia, we can hit GET /health or /api/stats. AI Provider is set via POST /api/config/ai.
  // We can let the user pick and toggle the provider.
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
    <div className="flex-1 p-6 overflow-hidden bg-[#09090b] flex flex-col h-[calc(100vh-73px)]">
      {/* Title */}
      <div className="mb-6 flex-shrink-0 border-b border-[#27272a] pb-4 select-none">
        <h2 className="text-xl font-bold font-mono text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#f59e0b]" />
          <span>System Settings & Health</span>
        </h2>
        <p className="font-mono text-xs text-zinc-500 mt-1">
          Tune the Amneshia core memory engine options, configure LLM reasoning providers, and run manual maintenance.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 max-w-4xl pr-1">
        {/* LLM Provider Configuration */}
        <section className="p-6 rounded bg-[#121215] border border-[#27272a] space-y-4">
          <h3 className="font-mono text-sm font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider">
            <BrainCircuit className="w-4.5 h-4.5 text-[#f59e0b]" />
            <span>AI Reasoning Provider</span>
          </h3>
          <p className="font-sans text-xs text-zinc-400 leading-relaxed">
            Choose the back-end AI Provider for processing entity visibility, extracting semantic connections, scoring importance, and summarizing raw logs.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 font-mono text-xs select-none">
            {(['none', '9router', 'openai', 'ollama'] as const).map((p) => {
              const isActive = provider === p;
              return (
                <button
                  key={p}
                  onClick={() => handleUpdateProvider(p)}
                  disabled={isUpdatingProvider}
                  className={`p-4 rounded border transition-all text-left flex flex-col gap-1.5 ${
                    isActive
                      ? 'bg-zinc-900 border-[#f59e0b] text-[#f59e0b]'
                      : 'bg-[#09090b] border-[#27272a] hover:border-zinc-500 text-zinc-400'
                  }`}
                >
                  <span className="font-bold uppercase">{p === '9router' ? '9router AG' : p}</span>
                  <span className="text-[10px] text-zinc-500 leading-normal">
                    {p === 'none' && 'Deterministic mode. Disable active inferences.'}
                    {p === '9router' && 'Local/Cloud 9router AG free gateway model.'}
                    {p === 'openai' && 'Enterprise API cloud model execution.'}
                    {p === 'ollama' && 'Locally hosted models via Ollama server endpoint.'}
                  </span>
                </button>
              );
            })}
          </div>

          {provider === '9router' && (
            <div className="pt-4 border-t border-[#27272a] space-y-3 font-mono text-xs select-none">
              <label className="block text-zinc-300 font-bold">9router Target Model Selection:</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { label: 'Gemini 3 Flash (Free AG)', value: '9router/ag/gemini-3-flash' },
                  { label: 'Gemini 3.1 Flash Lite', value: 'google-antigravity/gemini-3.1-flash-lite' },
                  { label: 'Claude Sonnet 4.6 (AG)', value: '9router/ag/claude-sonnet-4-6' }
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setNineRouterModel(m.value);
                      handleUpdateProvider('9router', m.value);
                    }}
                    className={`p-2.5 rounded border text-left font-mono text-[11px] transition-all ${
                      nineRouterModel === m.value
                        ? 'bg-zinc-800 border-[#f59e0b] text-[#f59e0b] font-bold'
                        : 'bg-[#09090b] border-[#27272a] hover:border-zinc-500 text-zinc-400'
                    }`}
                  >
                    <div>{m.label}</div>
                    <div className="text-[9px] text-zinc-500 truncate">{m.value}</div>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1 select-text">
                <input
                  type="text"
                  placeholder="Or enter custom 9router model ID (e.g. 9router/ag/...)"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="flex-1 bg-[#09090b] border border-[#27272a] focus:border-[#f59e0b] rounded px-3 py-1.5 text-zinc-200 text-xs font-mono outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customModel.trim()) {
                      setNineRouterModel(customModel.trim());
                      handleUpdateProvider('9router', customModel.trim());
                    }
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded text-xs font-mono border border-[#27272a] transition-all active:scale-[0.98]"
                >
                  Apply Model
                </button>
              </div>
            </div>
          )}

          {providerSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 font-mono select-none">
              <CheckCircle2 className="w-4 h-4" />
              <span>Provider synchronized successfully.</span>
            </div>
          )}
        </section>

        {/* Maintenance Tools */}
        <section className="p-6 rounded bg-[#121215] border border-[#27272a] space-y-4">
          <h3 className="font-mono text-sm font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider">
            <ShieldAlert className="w-4.5 h-4.5 text-red-500" />
            <span>Database Maintenance</span>
          </h3>
          <p className="font-sans text-xs text-zinc-400 leading-relaxed">
            Run manual maintenance routines against the SQLite engine to garbage collect expired observations and purge orphaned data structures.
          </p>

          <div className="pt-2 select-none">
            <button
              onClick={handleCleanupExpired}
              disabled={isCleaning}
              className="flex items-center gap-2 bg-[#121215] hover:bg-zinc-900 border border-[#27272a] text-zinc-300 hover:text-white px-4 py-2.5 rounded font-mono text-xs font-semibold transition-all active:scale-[0.98]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCleaning ? 'animate-spin' : ''}`} />
              <span>{isCleaning ? 'Pruning database...' : 'Cleanup Expired Observations'}</span>
            </button>
          </div>

          {cleanedCount !== null && (
            <div className="p-3.5 rounded bg-zinc-950/40 border border-[#27272a] font-mono text-xs text-zinc-400">
              Pruning sequence complete. Removed <strong className="text-[#f59e0b]">{cleanedCount}</strong> expired memory entries.
            </div>
          )}
        </section>

        {/* Sleep Cycle Consolidation */}
          <section className="p-6 rounded bg-[#121215] border border-[#27272a] space-y-4">
            <h3 className="font-mono text-sm font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider">
              <Moon className="w-4.5 h-4.5 text-indigo-400" />
              <span>Memory Consolidation (Sleep Cycle)</span>
            </h3>
            <p className="font-sans text-xs text-zinc-400 leading-relaxed">
              Consolidate the graph memory database by resolving conflicting information, removing redundancy, and applying AI-assisted summarization.
            </p>
            <div className="pt-2 select-none">
              <button
                onClick={onConsolidate}
                type="button"
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded font-mono text-xs font-semibold transition-all active:scale-[0.98]"
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Run Sleep Cycle</span>
              </button>
            </div>
          </section>

        {/* System Health */}
        <section className="p-6 rounded bg-[#121215] border border-[#27272a] space-y-4">
          <h3 className="font-mono text-sm font-bold text-zinc-200 flex items-center gap-2 uppercase tracking-wider">
            <Heart className="w-4.5 h-4.5 text-green-400" />
            <span>System Health Stats</span>
          </h3>
          <p className="font-sans text-xs text-zinc-400 leading-relaxed">
            Physical memory topology distribution and storage metrics currently stored on disk.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 font-mono text-xs">
            <div className="p-3 bg-[#09090b] border border-[#27272a] rounded">
              <span className="text-[10px] text-zinc-500 block uppercase font-bold">Total Entities</span>
              <span className="text-xl font-bold text-zinc-200 mt-1 block">{stats?.totalEntities ?? 0}</span>
            </div>
            <div className="p-3 bg-[#09090b] border border-[#27272a] rounded">
              <span className="text-[10px] text-zinc-500 block uppercase font-bold">Observations</span>
              <span className="text-xl font-bold text-zinc-200 mt-1 block">{stats?.totalObservations ?? 0}</span>
            </div>
            <div className="p-3 bg-[#09090b] border border-[#27272a] rounded">
              <span className="text-[10px] text-zinc-500 block uppercase font-bold">Relations</span>
              <span className="text-xl font-bold text-zinc-200 mt-1 block">{stats?.totalRelations ?? 0}</span>
            </div>
            <div className="p-3 bg-[#09090b] border border-[#27272a] rounded">
              <span className="text-[10px] text-zinc-500 block uppercase font-bold">Exporters</span>
              <span className="text-xl font-bold text-zinc-200 mt-1 block">{stats?.totalExportTargets ?? 0}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
