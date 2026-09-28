import React, { useState, useEffect } from 'react';
import { FileUp, Plus, Trash2, AlertTriangle, CheckCircle2, Folder, X, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import type { ExportTarget } from '../types';

interface ExportTargetsProps {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const ExportTargets: React.FC<ExportTargetsProps> = ({
  refreshTrigger,
  triggerRefresh,
}) => {
  const [targets, setTargets] = useState<ExportTarget[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [showAdd, setShowAdd] = useState(false);
  const [newTarget, setNewTarget] = useState({ name: '', path: '', format: 'markdown' });

  const loadTargets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getExportTargets();
      setTargets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTargets();
  }, [refreshTrigger]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTarget.name.trim() || !newTarget.path.trim()) return;
    try {
      await api.addExportTarget(newTarget.name, newTarget.path, newTarget.format);
      setNewTarget({ name: '', path: '', format: 'markdown' });
      setShowAdd(false);
      triggerRefresh();
      loadTargets();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deregister this export target? Auto-export cycles will be halted.')) return;
    try {
      await api.removeExportTarget(id);
      triggerRefresh();
      loadTargets();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex-1 p-6 overflow-hidden bg-[#08090c] flex flex-col h-[calc(100vh-73px)] select-none">
      {/* Title block */}
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h2 className="font-sans text-base font-bold text-white tracking-tight flex items-center gap-2">
            <FileUp className="w-5 h-5 text-amber-400" />
            <span>Markdown Exporters</span>
            <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
              {targets.length} targets
            </span>
          </h2>
          <p className="font-mono text-xs text-zinc-500 mt-1">
            Real-time auto-synchronization of SQLite knowledge slices into Obsidian vaults or project Markdown docs.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black px-4 py-2 rounded-xl font-mono text-xs font-bold shadow-glow-amber transition-all active:scale-[0.98]"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Add Export Target</span>
        </button>
      </div>

      {/* Main List */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center font-mono text-xs text-zinc-500">
          Syncing exporter registry…
        </div>
      )}

      {error && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center font-mono text-xs text-red-400">
          <AlertTriangle className="w-6 h-6 text-red-500 mb-2" />
          <p>{error}</p>
        </div>
      )}

      {!isLoading && targets.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <Folder className="w-7 h-7 text-zinc-500" />
          </div>
          <h3 className="font-sans text-sm font-semibold text-zinc-300">No Active Exporters Configured</h3>
          <p className="font-mono text-xs text-zinc-500 max-w-sm mt-1">
            Auto-export serializes the SQLite knowledge graph slices into clean markdown file structures automatically whenever memories update.
          </p>
        </div>
      )}

      {targets.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {targets.map((tgt) => (
              <div
                key={tgt.id}
                className="p-5 rounded-2xl glass-panel border border-white/[0.08] hover:border-amber-500/30 transition-all duration-200 flex flex-col justify-between gap-4 group"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="font-sans text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>{tgt.name}</span>
                    </h3>
                    <div className="flex gap-1.5 select-none font-mono text-[9px]">
                      <span className="bg-white/5 text-zinc-400 border border-white/10 px-2 py-0.5 rounded-md uppercase font-semibold">
                        {tgt.format}
                      </span>
                      <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Auto-Sync
                      </span>
                    </div>
                  </div>
                  <pre className="font-mono text-xs text-zinc-300 bg-black/50 p-3 rounded-xl border border-white/10 mt-3.5 overflow-x-auto whitespace-pre-wrap break-all">
                    {tgt.path}
                  </pre>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-white/5 select-none font-mono text-[10px]">
                  <span className="text-zinc-500">ID: {tgt.id.slice(0, 8)}…</span>
                  <button
                    onClick={() => handleDelete(tgt.id)}
                    className="flex items-center gap-1.5 text-zinc-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Deregister</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Add Target */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel-elevated p-6 rounded-2xl max-w-md w-full font-mono text-xs shadow-2xl border border-white/10">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Register Export Target</h3>
              <button onClick={() => setShowAdd(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Target Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Project Knowledge Base / Obsidian"
                  value={newTarget.name}
                  onChange={(e) => setNewTarget({ ...newTarget, name: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Absolute File System Path</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. /home/user/vault/Amneshia.md"
                  value={newTarget.path}
                  onChange={(e) => setNewTarget({ ...newTarget, path: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Export Format</label>
                <select
                  value={newTarget.format}
                  onChange={(e) => setNewTarget({ ...newTarget, format: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="markdown">Markdown Profiles (.md)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 border border-white/10 text-zinc-400 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-xl shadow-glow-amber hover:from-amber-400"
                >
                  Register Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportTargets;
