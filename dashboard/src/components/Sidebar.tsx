import React from 'react';
import { Network, Database, ToyBrick, FileUp, Settings, BrainCircuit } from 'lucide-react';

export type TabId = 'graph' | 'memories' | 'bridge' | 'exporters' | 'settings';

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'graph' as const, label: 'Graph 3D', icon: Network },
    { id: 'memories' as const, label: 'Memories', icon: Database },
    { id: 'bridge' as const, label: 'Bridge', icon: ToyBrick },
    { id: 'exporters' as const, label: 'Exporters', icon: FileUp },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#121215] border-r border-[#27272a] flex flex-col justify-between h-screen sticky top-0">
      <div className="flex flex-col flex-1 py-6 px-4">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-3 px-2 mb-8 select-none">
          <BrainCircuit className="w-8 h-8 text-[#f59e0b] animate-pulse" />
          <div>
            <h1 className="font-mono text-lg font-bold tracking-tight text-white">Amneshia</h1>
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Memory Hub v2</span>
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-zinc-800 text-[#f59e0b] border-l-2 border-[#f59e0b]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border-l-2 border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#f59e0b]' : 'text-zinc-400'}`} />
                <span className="font-mono">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-[#27272a] bg-zinc-950/20 text-center">
        <p className="text-[11px] font-mono text-zinc-500">
          Staff-Level Unified State
        </p>
      </div>
    </aside>
  );
};
