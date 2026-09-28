import React from 'react';
import {
  Network,
  Database,
  ShieldAlert,
  FolderGit2,
  Sliders,
  BrainCircuit,
  Activity,
  Sparkles,
} from 'lucide-react';

export type TabId = 'graph' | 'memories' | 'contradictions' | 'storage' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  contradictionCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  contradictionCount = 0,
}) => {
  const tabs = [
    { id: 'graph' as const, label: 'Neural Universe', icon: Network, badge: '3D/2D' },
    { id: 'memories' as const, label: 'Memory Inspector', icon: Database, badge: 'Tiers' },
    {
      id: 'contradictions' as const,
      label: 'Truth Maintenance',
      icon: ShieldAlert,
      badge: contradictionCount > 0 ? `${contradictionCount} alert` : 'v3.0',
      badgeColor: contradictionCount > 0 ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : undefined,
    },
    { id: 'storage' as const, label: 'Markdown-as-Truth', icon: FolderGit2, badge: 'Git' },
    { id: 'settings' as const, label: 'Engine & Settings', icon: Sliders, badge: 'AI' },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-purple-500/15 flex flex-col justify-between h-screen sticky top-0 z-30 select-none bg-[#070510]/80">
      <div className="flex flex-col flex-1 py-6 px-4">
        {/* Brand Logo & Title with Purple Glow Aura */}
        <div className="flex items-center gap-3 px-2 mb-8 group cursor-default">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700/40 via-purple-600/20 to-violet-400/10 border border-purple-500/40 flex items-center justify-center shadow-glow-purple group-hover:scale-105 transition-transform duration-300 relative">
            <BrainCircuit className="w-5 h-5 text-purple-300 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-400 ring-2 ring-[#070510]" />
          </div>
          <div>
            <h1 className="font-sans text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>Amneshia</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                v3.0
              </span>
            </h1>
            <p className="text-[10px] font-mono text-purple-400/70 tracking-wider uppercase mt-0.5 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-purple-400" />
              <span>Git-Native Memory</span>
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
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-300 group ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600/25 via-purple-500/10 to-transparent text-purple-200 border-l-2 border-purple-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'text-zinc-400 hover:text-purple-100 hover:bg-purple-950/20 border-l-2 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors duration-200 ${
                      isActive ? 'text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : 'text-zinc-500 group-hover:text-purple-300'
                    }`}
                  />
                  <span className="font-sans text-xs font-semibold">{tab.label}</span>
                </div>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                    tab.badgeColor
                      ? tab.badgeColor
                      : isActive
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                      : 'bg-white/5 text-zinc-500 border-white/5 group-hover:text-purple-300 group-hover:border-purple-500/20'
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
      <div className="p-4 border-t border-purple-500/15 bg-black/40 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-300">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            <span>Dual-Store Engine</span>
          </span>
          <span className="text-[10px] text-purple-400/80 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
            FTS5 + Git MD
          </span>
        </div>
        <div className="text-[10px] font-mono text-zinc-500 text-center">
          Truth Maintenance Active
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
