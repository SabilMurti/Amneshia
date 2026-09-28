import React, { useState, useEffect } from 'react';
import {
  ToyBrick, Play, Plus, Trash2, AlertTriangle, Cpu, Terminal, ToggleLeft, ToggleRight,
  Server, Wrench, X, Loader2
} from 'lucide-react';
import { api } from '../api/client';
import type { BridgeServer, BridgeToolInfo } from '../types';

interface BridgeManagerProps {
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const BridgeManager: React.FC<BridgeManagerProps> = ({
  refreshTrigger,
  triggerRefresh,
}) => {
  const [servers, setServers] = useState<BridgeServer[]>([]);
  const [tools, setTools] = useState<BridgeToolInfo[]>([]);
  const [selectedServer, setSelectedServer] = useState<BridgeServer | null>(null);
  const [selectedTool, setSelectedTool] = useState<BridgeToolInfo | null>(null);

  // Forms
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', command: '', args: '' });
  const [toolArgs, setToolArgs] = useState<Record<string, string>>({});
  const [storeAsMemory, setStoreAsMemory] = useState(true);
  const [entityName, setEntityName] = useState('');

  // Execution outputs
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<unknown | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getBridgeServers();
      setServers(data);
      if (selectedServer) {
        const fresh = data.find(s => s.id === selectedServer.id);
        if (fresh) {
          setSelectedServer(fresh);
        } else {
          setSelectedServer(null);
          setTools([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, [refreshTrigger]);

  const selectServer = async (server: BridgeServer) => {
    setSelectedServer(server);
    setTools([]);
    setSelectedTool(null);
    setExecutionResult(null);
    setExecutionError(null);
    try {
      const toolList = await api.getBridgeTools(server.id);
      setTools(toolList);
    } catch (err) {
      alert(`Failed to load server tools: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServer.name.trim() || !newServer.command.trim()) return;
    try {
      const argsArray = newServer.args.split(' ').map(s => s.trim()).filter(Boolean);
      await api.addBridgeServer(newServer.name, newServer.command, argsArray);
      setNewServer({ name: '', command: '', args: '' });
      setShowAddServer(false);
      triggerRefresh();
      loadServers();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteServer = async (id: string) => {
    if (!confirm('Deregister this MCP Bridge Server and terminate connection session?')) return;
    try {
      await api.removeBridgeServer(id);
      if (selectedServer?.id === id) {
        setSelectedServer(null);
        setTools([]);
        setSelectedTool(null);
      }
      triggerRefresh();
      loadServers();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const selectTool = (tool: BridgeToolInfo) => {
    setSelectedTool(tool);
    setToolArgs({});
    setExecutionResult(null);
    setExecutionError(null);
  };

  const handleCallTool = async () => {
    if (!selectedServer || !selectedTool) return;
    setIsRunning(true);
    setExecutionResult(null);
    setExecutionError(null);

    const parsedArguments: Record<string, unknown> = {};
    const schemaProps = selectedTool.inputSchema?.properties || {};

    Object.keys(schemaProps).forEach((key) => {
      const val = toolArgs[key];
      if (val !== undefined && val !== '') {
        const propSchema = (schemaProps[key] as Record<string, unknown>) || {};
        if (propSchema.type === 'number' || propSchema.type === 'integer') {
          parsedArguments[key] = Number(val);
        } else if (propSchema.type === 'boolean') {
          parsedArguments[key] = val === 'true';
        } else {
          parsedArguments[key] = val;
        }
      }
    });

    try {
      const res = await api.callBridgeTool({
        serverId: selectedServer.id,
        toolName: selectedTool.name,
        arguments: parsedArguments,
        storeAsMemory,
        entityName: entityName.trim() || undefined,
      });
      setExecutionResult(res);
      triggerRefresh();
    } catch (err) {
      setExecutionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-73px)] bg-[#08090c] overflow-hidden select-none">
      {/* List of Registered Bridge Servers */}
      <div className="w-80 p-6 border-r border-white/[0.08] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-5 flex-shrink-0">
          <div>
            <h2 className="font-sans text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-400" />
              <span>Bridge Servers</span>
            </h2>
            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
              {servers.length} Registered
            </span>
          </div>
          <button
            onClick={() => setShowAddServer(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black px-3 py-1.5 rounded-xl font-mono text-xs font-bold shadow-glow-amber transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center font-mono text-xs text-zinc-500">
            Syncing MCP registry…
          </div>
        )}

        {error && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center font-mono text-xs text-red-400">
            <AlertTriangle className="w-5 h-5 text-red-500 mb-2" />
            <p>{error}</p>
          </div>
        )}

        {!isLoading && servers.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <ToyBrick className="w-10 h-10 text-zinc-700 mb-2 animate-pulse" />
            <span className="font-sans text-sm font-semibold text-zinc-400">No servers bridged</span>
            <span className="font-mono text-xs text-zinc-600 mt-1">
              Add codebase-memory-mcp or other MCP servers.
            </span>
          </div>
        )}

        {servers.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {servers.map((srv) => {
              const isSelected = selectedServer?.id === srv.id;
              return (
                <div
                  key={srv.id}
                  onClick={() => selectServer(srv)}
                  className={`p-4 rounded-2xl glass-panel transition-all duration-200 cursor-pointer flex justify-between items-start gap-3 group border ${
                    isSelected
                      ? 'border-amber-500/50 bg-amber-500/10 shadow-glow-amber'
                      : 'border-white/[0.08] hover:border-white/20'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-sans text-sm font-bold text-white truncate flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-emerald-400'}`}></span>
                      <span>{srv.name}</span>
                    </h4>
                    <span className="font-mono text-[10px] text-zinc-400 block truncate font-medium mt-1">
                      {srv.command} {srv.args.join(' ')}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteServer(srv.id);
                    }}
                    className="text-zinc-500 hover:text-rose-400 p-1 rounded-lg hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove server"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tools Inspection Area */}
      <div className="flex-1 p-6 border-r border-white/[0.08] flex flex-col overflow-hidden bg-black/20">
        <div className="flex justify-between items-center mb-5 flex-shrink-0">
          <div>
            <h3 className="font-sans text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Wrench className="w-4 h-4 text-cyan-400" />
              <span>Downstream Tools</span>
              {selectedServer && (
                <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {tools.length} available
                </span>
              )}
            </h3>
            <p className="font-mono text-[11px] text-zinc-500 mt-0.5">
              Callable tools discovered dynamically via Model Context Protocol.
            </p>
          </div>
        </div>

        {!selectedServer ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
              <Cpu className="w-6 h-6 text-zinc-500" />
            </div>
            <h4 className="font-sans text-sm font-semibold text-zinc-300">No Bridge Server Selected</h4>
            <p className="font-mono text-xs text-zinc-500 max-w-sm mt-1">
              Select one of the registered MCP servers on the left to inspect exposed tool specifications and test calls.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {tools.length === 0 ? (
              <div className="p-6 rounded-2xl glass-panel text-xs font-mono text-zinc-400 text-center flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Establishing RPC connection and scanning tools…</span>
              </div>
            ) : (
              tools.map((tool) => {
                const isSelected = selectedTool?.name === tool.name;
                return (
                  <div
                    key={tool.name}
                    onClick={() => selectTool(tool)}
                    className={`p-4 rounded-2xl glass-panel transition-all duration-200 cursor-pointer flex flex-col gap-2 border ${
                      isSelected
                        ? 'border-amber-500/50 bg-amber-500/10 shadow-glow-amber'
                        : 'border-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <h4 className="font-mono text-sm font-bold text-white flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-amber-400" />
                        <span>{tool.name}</span>
                      </h4>
                      <span className="text-[10px] font-mono text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg uppercase font-bold">
                        API Tool
                      </span>
                    </div>
                    {tool.description && (
                      <p className="font-sans text-xs text-zinc-400 leading-relaxed">{tool.description}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Execution/Testing Form Panel */}
      <div className="w-[440px] p-6 flex flex-col justify-between overflow-hidden glass-panel-elevated">
        {selectedTool ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-white/10 pb-4 mb-4 flex justify-between items-center flex-shrink-0">
              <div>
                <span className="text-[10px] font-mono text-amber-400 uppercase font-bold tracking-widest block">
                  Interactive Sandbox
                </span>
                <h3 className="text-base font-bold font-mono text-white mt-1 break-all">
                  {selectedTool.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTool(null)}
                className="font-mono text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Reset
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              {/* Tool Parameters */}
              <div className="space-y-3.5">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold font-mono">
                  Parameters
                </span>
                {(() => {
                  const schema = selectedTool.inputSchema || {};
                  const properties = schema.properties || {};
                  const required = schema.required || [];

                  if (Object.keys(properties).length === 0) {
                    return <p className="text-xs font-mono text-zinc-500 italic">No arguments required.</p>;
                  }

                  return Object.entries(properties).map(([key, value]) => {
                    const isRequired = required.includes(key);
                    const propVal = (value as Record<string, unknown>) || {};
                    return (
                      <div key={key} className="space-y-1.5 font-mono text-xs">
                        <div className="flex justify-between items-baseline">
                          <label className="text-zinc-300 font-semibold">{key}</label>
                          {isRequired && (
                            <span className="text-amber-400 text-[10px] uppercase font-bold">Required</span>
                          )}
                        </div>
                        <input
                          type={propVal.type === 'number' || propVal.type === 'integer' ? 'number' : 'text'}
                          placeholder={propVal.description ? String(propVal.description) : `Enter ${key}`}
                          value={toolArgs[key] || ''}
                          onChange={(e) => setToolArgs({ ...toolArgs, [key]: e.target.value })}
                          className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Memory Integration Toggles */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold font-mono">
                  Memory Synthesis
                </span>
                
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-zinc-300">Auto-inject result as Observation</span>
                  <button
                    onClick={() => setStoreAsMemory(!storeAsMemory)}
                    className="p-1 text-zinc-400 hover:text-white"
                  >
                    {storeAsMemory ? (
                      <ToggleRight className="w-8 h-8 text-amber-400" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-zinc-600" />
                    )}
                  </button>
                </div>

                {storeAsMemory && (
                  <div className="space-y-1.5 font-mono text-xs">
                    <label className="text-zinc-400 block font-semibold uppercase">Destination Entity</label>
                    <input
                      type="text"
                      placeholder={`e.g. ${selectedServer?.name}`}
                      value={entityName}
                      onChange={(e) => setEntityName(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* Output / Results display */}
              {(executionResult !== null || executionError !== null) && (
                <div className="space-y-2.5 pt-4 border-t border-white/10">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold font-mono flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Response Output</span>
                  </span>
                  {executionError ? (
                    <pre className="bg-red-950/30 border border-red-500/30 p-3.5 rounded-xl font-mono text-[11px] text-red-300 overflow-x-auto whitespace-pre-wrap">
                      {executionError}
                    </pre>
                  ) : (
                    <pre className="bg-black/60 border border-white/10 p-3.5 rounded-xl font-mono text-[11px] text-zinc-200 overflow-x-auto max-h-56">
                      {JSON.stringify(executionResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* Run Button */}
            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                onClick={handleCallTool}
                disabled={isRunning}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black px-4 py-2.5 rounded-xl font-mono text-xs font-bold shadow-glow-amber transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing Tool Call…</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-black" />
                    <span>Execute Tool Call</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
              <Terminal className="w-6 h-6 text-zinc-500" />
            </div>
            <p className="font-sans text-sm font-semibold text-zinc-300">Sandbox Idle</p>
            <p className="font-mono text-xs text-zinc-500 mt-1 max-w-xs">
              Select an exposed tool to configure test parameters and execute live RPC calls.
            </p>
          </div>
        )}
      </div>

      {/* Modal: Add Bridge Server */}
      {showAddServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel-elevated p-6 rounded-2xl max-w-md w-full font-mono text-xs shadow-2xl border border-white/10">
            <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Register Bridge Server</h3>
              <button onClick={() => setShowAddServer(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddServer} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Server Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Codebase Memory"
                  value={newServer.name}
                  onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Executable Command</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. node, python, npx"
                  value={newServer.command}
                  onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-semibold">Arguments (space-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. /path/to/server.js --flag"
                  value={newServer.args}
                  onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddServer(false)}
                  className="px-4 py-2 border border-white/10 text-zinc-400 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold rounded-xl shadow-glow-amber hover:from-amber-400"
                >
                  Connect Server
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BridgeManager;
