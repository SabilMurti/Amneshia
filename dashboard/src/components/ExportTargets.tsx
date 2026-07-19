import React, { useState, useEffect } from 'react';
import { FileUp, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
    <div className="flex-1 p-6 overflow-hidden bg-[#09090b] flex flex-col h-[calc(100vh-73px)]">
      {/* Title block */}
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold font-mono text-white flex items-center gap-2">
            <FileUp className="w-5 h-5 text-[#f59e0b]" />
            <span>Markdown Exporters</span>
          </h2>
          <p className="font-mono text-xs text-zinc-500 mt-1">
            Configure system targets for real-time auto-exporting graph nodes into readable Markdown profiles.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-black px-4 py-2 rounded font-mono text-xs font-semibold select-none transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Add Export Target</span>
        </button>
      </div>

      {/* Main List */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center font-mono text-xs text-zinc-500">
          Syncing exporter registry...
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center p-6 text-center font-mono text-xs text-red-400">
          <AlertTriangle className="w-5 h-5 text-red-500 mb-2" />
          <p>{error}</p>
        </div>
      )}

      {!isLoading && targets.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center select-none text-center p-6">
          <FileUp className="w-12 h-12 text-zinc-800 mb-3" />
          <h3 className="font-mono text-sm font-semibold text-zinc-400 mb-1">No Active Exporters</h3>
          <p className="font-mono text-xs text-zinc-600 max-w-sm">
            Auto-export translates the SQLite knowledge graph slices into clean markdown file structures automatically whenever observations update. Register your target workspace path.
          </p>
        </div>
      )}

      {targets.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {targets.map((tgt) => (
              <div
                key={tgt.id}
                className="p-5 rounded bg-[#121215] border border-[#27272a] hover:border-zinc-500 transition-all flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="font-mono text-sm font-bold text-zinc-200">{tgt.name}</h3>
                    <div className="flex gap-1.5 select-none">
                      <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 border border-[#27272a] px-1.5 py-0.5 rounded uppercase font-semibold">
                        {tgt.format}
                      </span>
                      <span className="text-[9px] font-mono bg-green-950/20 text-green-400 border border-green-900/30 px-1.5 py-0.5 rounded uppercase font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Auto
                      </span>
                    </div>
                  </div>
                  <pre className="font-mono text-xs text-zinc-400 bg-zinc-950/40 p-2.5 rounded border border-zinc-900 mt-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {tgt.path}
                  </pre>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-zinc-800/40 select-none">
                  <span className="text-[10px] font-mono text-zinc-600">ID: {tgt.id}</span>
                  <button
                    onClick={() => handleDelete(tgt.id)}
                    className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Deregister Target</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Add Target */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4">
          <div className="bg-[#121215] border border-[#27272a] p-6 rounded max-w-md w-full font-mono text-xs shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#27272a] pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Register Export Target</h3>
              <button onClick={() => setShowAdd(false)} className="text-zinc-500 hover:text-zinc-300">×</button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Target Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Obsidian Vault"
                  value={newTarget.name}
                  onChange={(e) => setNewTarget({ ...newTarget, name: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Absolute File System Path</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. /home/user/notes/AmneshiaExport"
                  value={newTarget.path}
                  onChange={(e) => setNewTarget({ ...newTarget, path: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Export Format</label>
                <select
                  value={newTarget.format}
                  onChange={(e) => setNewTarget({ ...newTarget, format: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                >
                  <option value="markdown">Markdown Documents (.md)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#27272a] select-none">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 border border-[#27272a] text-zinc-400 hover:text-zinc-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold rounded"
                >
                  Register Exporter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
