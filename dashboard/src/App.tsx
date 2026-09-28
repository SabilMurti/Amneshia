import React, { useState, useEffect } from 'react';
import { Sidebar, type TabId } from './components/Sidebar';
import { Header } from './components/Header';
import { GraphView } from './components/GraphView';
import { MemoryTable } from './components/MemoryTable';
import { ContradictionsView } from './components/ContradictionsView';
import { StorageView } from './components/StorageView';
import { SettingsView } from './components/SettingsView';
import { api } from './api/client';
import type { MemoryStats } from './types';
import { CheckCircle2, AlertCircle, Zap, X } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('graph');
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [contradictionCount, setContradictionCount] = useState<number>(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSyncMarkdown = async () => {
    showToast('Reindexing & dual-writing Markdown store...', 'info');
    try {
      const res = await api.reindex();
      showToast(
        `Dual-Write Sync Complete: ${res.entities} entities, ${res.observations} facts, ${res.relations} relations verified.`,
        'success'
      );
      triggerRefresh();
    } catch (err) {
      showToast('Markdown sync failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const handleRunMaintenance = async () => {
    showToast('Running deterministic memory maintenance (purge, decay, dedup)...', 'info');
    try {
      const response = await api.runMaintenance(selectedDomain || undefined, false);
      if (response.ok) {
        const { purgedCount, decayedCount, supersededCount } = response.result;
        showToast(
          `Maintenance Complete: ${purgedCount} expired purged, ${decayedCount} decayed, ${supersededCount} duplicates superseded.`,
          'success'
        );
        triggerRefresh();
      } else {
        showToast('Maintenance failed: ' + JSON.stringify(response), 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const fetchStatsAndDomains = async () => {
    try {
      const s = await api.getStats();
      setStats(s);
      const graphData = await api.getGraph();
      const doms = Array.from(new Set(graphData.entities.map((e) => e.domain).filter(Boolean)));
      setDomains(doms);

      const conflicts = await api.getContradictions();
      setContradictionCount(conflicts.filter((c) => !c.resolvedAt).length);
    } catch (err) {
      console.error('Failed to fetch dashboard metadata:', err);
    }
  };

  useEffect(() => {
    fetchStatsAndDomains();
  }, [refreshTrigger]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-obsidian-bg text-zinc-100 font-sans antialiased selection:bg-purple-500/30 selection:text-purple-200">
      {/* Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        contradictionCount={contradictionCount}
      />

      {/* Primary Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Global HUD Header */}
        <Header
          onSearch={handleSearch}
          selectedDomain={selectedDomain}
          setSelectedDomain={setSelectedDomain}
          domains={domains}
          stats={stats}
          refreshStats={fetchStatsAndDomains}
          onSyncMarkdown={handleSyncMarkdown}
          onRunMaintenance={handleRunMaintenance}
        />

        {/* Dynamic Tab view rendering */}
        <main className="flex-1 min-h-0 relative overflow-hidden bg-obsidian-bg">
          {activeTab === 'graph' && (
            <GraphView
              selectedDomain={selectedDomain}
              searchQuery={searchQuery}
              onClearSearch={handleClearSearch}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === 'memories' && (
            <MemoryTable
              selectedDomain={selectedDomain}
              searchQuery={searchQuery}
              refreshTrigger={refreshTrigger}
              triggerRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'contradictions' && (
            <ContradictionsView
              refreshTrigger={refreshTrigger}
              triggerRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'storage' && (
            <StorageView
              refreshTrigger={refreshTrigger}
              triggerRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              stats={stats}
              refreshStats={fetchStatsAndDomains}
              onRunMaintenance={handleRunMaintenance}
            />
          )}
        </main>
      </div>

      {/* Toast Notification HUD */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-obsidian-card/90 backdrop-blur-xl shadow-glow-purple border border-purple-500/30 animate-in fade-in slide-in-from-bottom-4 duration-300 font-mono text-xs max-w-md">
          <span className="flex-shrink-0">
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
            {toast.type === 'info' && <Zap className="w-4 h-4 text-purple-400 fill-purple-400/20" />}
          </span>
          <span className="text-zinc-200 flex-1 leading-snug">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
