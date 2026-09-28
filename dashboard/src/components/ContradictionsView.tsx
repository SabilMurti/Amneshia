import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Check,
  X,
  Split,
} from 'lucide-react';
import { api } from '../api/client';
import type { ContradictionLogEntry } from '../types';

interface ContradictionsViewProps {
  refreshTrigger: number;
  triggerRefresh: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ContradictionsView: React.FC<ContradictionsViewProps> = ({
  refreshTrigger,
  triggerRefresh,
  showToast,
}) => {
  const [contradictions, setContradictions] = useState<ContradictionLogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchContradictions = async () => {
    setLoading(true);
    try {
      const data = await api.getContradictions();
      setContradictions(data);
    } catch (err) {
      console.error('Failed to load contradictions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContradictions();
  }, [refreshTrigger]);

  const handleResolve = async (id: string, resolution: 'override' | 'kept_both' | 'rejected') => {
    setActionLoadingId(id);
    try {
      const res = await api.resolveContradiction(id, resolution);
      if (res.ok) {
        showToast?.(`Contradiction marked as "${resolution}"`, 'success');
        await fetchContradictions();
        triggerRefresh();
      }
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredItems = contradictions.filter((item) => {
    if (filter === 'open') return !item.resolution;
    if (filter === 'resolved') return Boolean(item.resolution);
    return true;
  });

  const openCount = contradictions.filter((c) => !c.resolution).length;

  return (
    <div className="w-full h-full overflow-y-auto px-6 py-6 space-y-6">
      {/* Top Banner / Header */}
      <div className="double-bezel-shell">
        <div className="double-bezel-core p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-5 h-5 text-purple-400" />
              <h2 className="font-sans text-xl font-bold tracking-tight text-white">
                Truth Maintenance & Contradiction Log
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Amneshia v3 Engine
              </span>
            </div>
            <p className="text-xs font-mono text-zinc-400 max-w-2xl">
              Pre-insertion opposition scans and semantic conflict detection protect your knowledge
              graph from memory drift and contradictory agent inputs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter pills */}
            <div className="flex items-center bg-[#070510] border border-purple-500/20 rounded-xl p-1 text-xs font-mono">
              <button
                onClick={() => setFilter('open')}
                className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                  filter === 'open'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Open</span>
                {openCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500/30 text-rose-300 text-[10px]">
                    {openCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setFilter('resolved')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  filter === 'resolved'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Resolved
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  filter === 'all'
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All ({contradictions.length})
              </button>
            </div>

            <button
              onClick={fetchContradictions}
              disabled={loading}
              className="p-2 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/30 rounded-xl text-purple-300 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Contradictions List */}
      {filteredItems.length === 0 ? (
        <div className="double-bezel-shell">
          <div className="double-bezel-core p-12 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-center text-purple-300">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-sans text-base font-bold text-white">Truth Maintained</h3>
            <p className="text-xs font-mono text-zinc-400 max-w-md">
              {filter === 'open'
                ? 'No open contradictions or semantic clashes detected in your knowledge graph.'
                : 'No contradiction logs found.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((entry) => {
            const isResolved = Boolean(entry.resolution);
            const isActing = actionLoadingId === entry.id;

            return (
              <div key={entry.id} className="double-bezel-shell">
                <div className="double-bezel-core p-5 space-y-4">
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-500/10 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                      <span className="text-xs font-mono font-bold text-purple-300 uppercase tracking-wider">
                        Conflict Detected
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {new Date(entry.detectedAt).toLocaleString()}
                      </span>
                    </div>

                    <div>
                      {isResolved ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Resolved: {entry.resolution}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Requires Resolution</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reason Banner */}
                  <div className="bg-[#090714] border border-purple-500/20 rounded-xl p-3 text-xs font-mono text-purple-200">
                    <span className="text-purple-400 font-bold">Reason:</span> {entry.reason}
                  </div>

                  {/* Conflicting IDs & Metadata */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Incoming Fact</div>
                      <div className="text-zinc-300 break-all">{entry.observationId}</div>
                    </div>
                    <div className="bg-black/30 border border-white/5 rounded-xl p-3 space-y-1">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Conflicting Existing Fact</div>
                      <div className="text-zinc-300 break-all">{entry.conflictingObservationId}</div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  {!isResolved && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-purple-500/10">
                      <button
                        onClick={() => handleResolve(entry.id, 'override')}
                        disabled={isActing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all shadow-glow-purple active:scale-[0.97]"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Override (Accept Newer)</span>
                      </button>

                      <button
                        onClick={() => handleResolve(entry.id, 'kept_both')}
                        disabled={isActing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 font-mono text-xs font-semibold transition-all active:scale-[0.97]"
                      >
                        <Split className="w-3.5 h-3.5" />
                        <span>Keep Both</span>
                      </button>

                      <button
                        onClick={() => handleResolve(entry.id, 'rejected')}
                        disabled={isActing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/40 border border-rose-500/30 text-rose-300 font-mono text-xs font-semibold transition-all active:scale-[0.97]"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject Newer</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ContradictionsView;
