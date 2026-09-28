import React from 'react';
import { Network, Database, ToyBrick, FileUp, Settings, BrainCircuit, Activity } from 'lucide-react';

export type TabId = 'graph' | 'memories' | 'bridge' | 'exporters' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'graph' as const, label: 'Graph Universe', icon: Network, badge: '3D/2D' },
    { id: 'memories' as const, label: 'Memory Matrix', icon: Database, badge: 'CRUD' },
    { id: 'bridge' as const, label: 'MCP Bridge', icon: ToyBrick, badge: 'Sync' },
    { id: 'exporters' as const, label: 'Export Targets', icon: FileUp, badge: 'MD' },
    { id: 'settings' as const, label: 'System Health', icon: Settings, badge: 'AI' },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-white/[0.08] flex flex-col justify-between h-screen sticky top-0 z-30 select-none">
      <div className="flex flex-col flex-1 py-6 px-4">
        {/* Brand Logo & Title with Gradient Aura */}
        <div className="flex items-center gap-3 px-2 mb-8 group cursor-default">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600/30 to-amber-400/10 border border-amber-500/30 flex items-center justify-center shadow-glow-amber group-hover:scale-105 transition-transform duration-300">
            <BrainCircuit className="w-5 h-5 text-amber-400 animate-pulse" />
          </div>
          <div>
            <h1 className="font-sans text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>Amneshia</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                v2.0
              </span>
            </h1>
            <p className="text-[10px] font-mono text-zinc-500 tracking-wider uppercase mt-0.5">
              Unified Agent Memory Hub
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="space-y-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-500/15 to-transparent text-amber-300 border-l-2 border-amber-500 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border-l-2 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />
                  <span className="font-sans text-xs font-semibold">{tab.label}</span>
                </div>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-white/5 text-zinc-500 group-hover:text-zinc-400'
                  }`}
                >
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info & Engine Status */}
      <div className="p-4 border-t border-white/[0.06] bg-black/20 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>FTS5 Engine</span>
          </span>
          <span className="text-[10px] text-zinc-500">Zero-DB SQLite</span>
        </div>
        <div className="text-[10px] font-mono text-zinc-600 text-center">
          Obsidian High-End Visual Standard
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
