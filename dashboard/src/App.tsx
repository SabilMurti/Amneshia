import React, { useState, useEffect } from 'react';
import { Sidebar, type TabId } from './components/Sidebar';
import { Header } from './components/Header';
import { GraphView } from './components/GraphView';
import { MemoryTable } from './components/MemoryTable';
import { BridgeManager } from './components/BridgeManager';
import { ExportTargets } from './components/ExportTargets';
import { SettingsView } from './components/SettingsView';
import { api } from './api/client';
import type { MemoryStats } from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('graph');
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSyncBridge = async () => {
    showToast('Syncing Bridge MCP servers...', 'info');
    try {
      const response = await api.syncBridge();
      if (response.ok) {
        const stats = response.stats;
        showToast(
          `Synced ${stats.projectsSynced.length} projects (${stats.observationsAdded} obs, ${stats.relationsCreated} rels).`,
          'success'
        );
        triggerRefresh();
      } else {
        showToast('Sync failed: ' + JSON.stringify(response), 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleConsolidate = async () => {
    showToast('Starting Sleep Cycle consolidation...', 'info');
    try {
      const response = await api.consolidateMemory(selectedDomain || undefined);
      if (response.ok) {
        const res = response.result;
        showToast(
          `🌙 Sleep Cycle Complete: purged ${res.purgedCount}, superseded ${res.supersededCount}, consolidated ${res.consolidatedCount} observations.`,
          'success'
        );
        triggerRefresh();
      } else {
        showToast('Consolidation failed: ' + JSON.stringify(response), 'error');
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
      const freshStats = await api.getStats();
      setStats(freshStats);

      // Extract domains from stats activity / entity types
      const graphData = await api.getGraph();
      const uniqueDomains = new Set<string>();
      graphData.entities.forEach((entity) => {
        if (entity.domain) {
          uniqueDomains.add(entity.domain);
        }
      });
      setDomains(Array.from(uniqueDomains).sort());
    } catch (err) {
      console.error('Failed to sync stats/domains from backend:', err);
    }
  };

  useEffect(() => {
    fetchStatsAndDomains();
  }, [refreshTrigger]);

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-[#09090b]">
      {/* Sidebar navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Search / Stats Bar */}
        <Header
          onSearch={handleSearch}
          selectedDomain={selectedDomain}
          setSelectedDomain={setSelectedDomain}
          domains={domains}
          stats={stats}
          refreshStats={fetchStatsAndDomains}
          onSyncBridge={handleSyncBridge}
          onConsolidate={handleConsolidate}
        />

        {/* Dynamic Tab view rendering */}
        <main className="flex-1 min-h-0 bg-[#09090b] relative">
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

          {activeTab === 'bridge' && (
            <BridgeManager
              refreshTrigger={refreshTrigger}
              triggerRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'exporters' && (
            <ExportTargets
              refreshTrigger={refreshTrigger}
              triggerRefresh={triggerRefresh}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              stats={stats}
              refreshStats={fetchStatsAndDomains}
              onConsolidate={handleConsolidate}
            />
          )}
        </main>
      </div>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4.5 py-3 rounded bg-zinc-900 border border-[#27272a] shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 font-mono text-xs max-w-sm">
          <span className={toast.type === 'success' ? 'text-green-400' : toast.type === 'error' ? 'text-red-400' : 'text-[#f59e0b]'}>
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : '⚡'}
          </span>
          <span className="text-zinc-200">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-zinc-500 hover:text-zinc-300">×</button>
        </div>
      )}
    </div>
  );
};

export default App;
