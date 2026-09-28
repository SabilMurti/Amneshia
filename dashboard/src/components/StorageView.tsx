import React, { useEffect, useState } from 'react';
import {
  FolderGit2,
  RotateCw,
  Trash2,
  Plus,
  FileOutput,
  GitBranch,
  Layers,
} from 'lucide-react';
import { api } from '../api/client';
import type { ExportTarget } from '../types';

interface StorageViewProps {
  refreshTrigger: number;
  triggerRefresh: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const StorageView: React.FC<StorageViewProps> = ({
  refreshTrigger,
  triggerRefresh,
  showToast,
}) => {
  const [targets, setTargets] = useState<ExportTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [gcing, setGcing] = useState(false);

  // New target modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [pathStr, setPathStr] = useState('');
  const [autoExport, setAutoExport] = useState(true);

  const fetchTargets = async () => {
    setLoading(true);
    try {
      const data = await api.getExportTargets();
      setTargets(data);
    } catch (err) {
      console.error('Failed to load export targets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargets();
  }, [refreshTrigger]);

  const handleToggle = async (id: string) => {
    try {
      await api.toggleExportTarget(id);
      await fetchTargets();
      triggerRefresh();
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.removeExportTarget(id);
      showToast?.('Target removed successfully', 'success');
      await fetchTargets();
      triggerRefresh();
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleAddTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pathStr.trim()) return;

    try {
      await api.addExportTarget(name.trim(), pathStr.trim(), 'markdown', autoExport);
      showToast?.('Export target added', 'success');
      setIsModalOpen(false);
      setName('');
      setPathStr('');
      await fetchTargets();
      triggerRefresh();
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await api.reindex();
      showToast?.(
        `Reindex complete! ${res.entities} entities, ${res.observations} facts, ${res.relations} relations restored.`,
        'success'
      );
      triggerRefresh();
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setReindexing(false);
    }
  };

  const handleGC = async () => {
    setGcing(true);
    try {
      const res = await api.gc();
      showToast?.(`Garbage collection purged ${res.removed} decayed/stale facts.`, 'success');
      triggerRefresh();
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setGcing(false);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto px-6 py-6 space-y-6">
      {/* Top Banner */}
      <div className="double-bezel-shell">
        <div className="double-bezel-core p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FolderGit2 className="w-5 h-5 text-purple-400" />
              <h2 className="font-sans text-xl font-bold tracking-tight text-white">
                Markdown-as-Truth & Storage Engine
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Git-Native v3
              </span>
            </div>
            <p className="text-xs font-mono text-zinc-400 max-w-2xl">
              All knowledge facts are maintained as human-readable Markdown files with YAML frontmatter in{' '}
              <code className="text-purple-300">.amneshia/knowledge/</code> while SQLite FTS5 provides sub-millisecond query caching.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleReindex}
              disabled={reindexing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 text-purple-200 font-mono text-xs font-bold transition-all active:scale-[0.97]"
              title="Rebuild SQLite FTS5 index from markdown knowledge files"
            >
              <RotateCw className={`w-3.5 h-3.5 ${reindexing ? 'animate-spin' : ''}`} />
              <span>{reindexing ? 'Reindexing…' : 'Reindex from MD'}</span>
            </button>

            <button
              onClick={handleGC}
              disabled={gcing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/40 border border-rose-500/30 text-rose-300 font-mono text-xs font-semibold transition-all active:scale-[0.97]"
              title="Permanently remove decayed and invalidated facts"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{gcing ? 'Purging…' : 'Run GC'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dual Storage Architecture Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="double-bezel-shell">
          <div className="double-bezel-core p-5 space-y-2">
            <div className="flex items-center gap-2 text-purple-300 font-bold text-xs font-mono uppercase tracking-wider">
              <GitBranch className="w-4 h-4 text-purple-400" />
              <span>Primary Source of Truth</span>
            </div>
            <h3 className="font-sans text-base font-bold text-white">Markdown Knowledge Files</h3>
            <p className="text-xs font-mono text-zinc-400">
              Organized by domain at <code className="text-purple-300">knowledge/{'{domain}'}/{'{entity}'}.md</code>. Commit directly to Git, audit changes via <code className="text-purple-300">git diff</code>, and review knowledge updates in pull requests.
            </p>
          </div>
        </div>

        <div className="double-bezel-shell">
          <div className="double-bezel-core p-5 space-y-2">
            <div className="flex items-center gap-2 text-violet-300 font-bold text-xs font-mono uppercase tracking-wider">
              <Layers className="w-4 h-4 text-violet-400" />
              <span>High-Speed Query Cache</span>
            </div>
            <h3 className="font-sans text-base font-bold text-white">SQLite FTS5 + BM25</h3>
            <p className="text-xs font-mono text-zinc-400">
              Zero-external-database local cache stored at <code className="text-violet-300">memory.db</code>. Delivers &lt;1ms full-text lookups and GraphRAG multi-hop traversal with zero latency.
            </p>
          </div>
        </div>
      </div>

      {/* Export Targets Section */}
      <div className="double-bezel-shell">
        <div className="double-bezel-core p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
            <div>
              <h3 className="font-sans text-base font-bold text-white flex items-center gap-2">
                <FileOutput className="w-4 h-4 text-purple-400" />
                <span>Configured Export Targets</span>
              </h3>
              <p className="text-xs font-mono text-zinc-400">
                Mirrors graph snapshots automatically to specified Markdown files whenever memories mutate.
              </p>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold transition-all shadow-glow-purple active:scale-[0.97]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Target</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {loading && targets.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-zinc-500">Loading export targets…</div>
            ) : targets.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-zinc-500">No export targets configured yet.</div>
            ) : (
              targets.map((t) => (
                <div
                  key={t.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-[#090714] border border-purple-500/15 hover:border-purple-500/30 transition-all font-mono text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{t.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">
                      {t.format}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 break-all">{t.path}</div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggle(t.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                      t.autoExport
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                    }`}
                  >
                    {t.autoExport ? 'Auto-Sync: ON' : 'Auto-Sync: OFF'}
                  </button>

                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10"
                    title="Delete target"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )))}
          </div>
        </div>
      </div>

      {/* Add Target Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="double-bezel-shell max-w-md w-full">
            <div className="double-bezel-core p-6 space-y-4">
              <h3 className="font-sans text-lg font-bold text-white">Add Export Target</h3>
              <form onSubmit={handleAddTarget} className="space-y-3 font-mono text-xs">
                <div>
                  <label className="text-zinc-400 block mb-1">Target Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Project Root MEMORY.md"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#070510] border border-purple-500/20 rounded-xl px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 block mb-1">Absolute File Path</label>
                  <input
                    type="text"
                    required
                    placeholder="/path/to/MEMORY.md"
                    value={pathStr}
                    onChange={(e) => setPathStr(e.target.value)}
                    className="w-full bg-[#070510] border border-purple-500/20 rounded-xl px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="autoExp"
                    checked={autoExport}
                    onChange={(e) => setAutoExport(e.target.checked)}
                    className="rounded border-purple-500/30 text-purple-600 focus:ring-purple-500"
                  />
                  <label htmlFor="autoExp" className="text-zinc-300">
                    Enable Auto-Sync on Mutations
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-purple-500/10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 rounded-xl text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-glow-purple"
                  >
                    Save Target
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageView;
