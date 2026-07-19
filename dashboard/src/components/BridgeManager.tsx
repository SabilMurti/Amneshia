import React, { useState, useEffect } from 'react';
import {
  ToyBrick, Play, Plus, Trash2, AlertTriangle, Cpu, Terminal, ToggleLeft, ToggleRight
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

    // Build arguments from text fields
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
    <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-73px)] bg-[#09090b]">
      {/* List of Registered Bridge Servers */}
      <div className="w-80 p-6 border-r border-[#27272a] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-400">MCP Bridge Servers</span>
          <button
            onClick={() => setShowAddServer(true)}
            className="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-black px-2 py-1 rounded font-mono text-xs font-semibold select-none transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Server</span>
          </button>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center font-mono text-xs text-zinc-500">
            Syncing MCP registry...
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center p-6 text-center font-mono text-xs text-red-400">
            <AlertTriangle className="w-4 h-4 text-red-500 mb-2" />
            <p>{error}</p>
          </div>
        )}

        {!isLoading && servers.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center select-none text-center">
            <ToyBrick className="w-10 h-10 text-zinc-700 mb-2" />
            <p className="font-mono text-[11px] text-zinc-500">No external MCP servers bridged yet.</p>
          </div>
        )}

        {servers.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {servers.map((srv) => {
              const isSelected = selectedServer?.id === srv.id;
              return (
                <div
                  key={srv.id}
                  onClick={() => selectServer(srv)}
                  className={`p-3.5 rounded border transition-all cursor-pointer flex justify-between items-start gap-2.5 ${
                    isSelected
                      ? 'bg-zinc-900 border-[#f59e0b]'
                      : 'bg-[#121215] border-[#27272a] hover:border-zinc-500'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-mono text-xs font-bold text-zinc-200 truncate">{srv.name}</h4>
                    <span className="font-mono text-[10px] text-zinc-500 block truncate font-semibold mt-1">
                      {srv.command} {srv.args.join(' ')}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteServer(srv.id);
                    }}
                    className="text-zinc-600 hover:text-red-400 p-0.5"
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
      <div className="flex-1 p-6 border-r border-[#27272a] flex flex-col overflow-hidden bg-[#121215]/30">
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4 flex-shrink-0">
          Tools Directory {selectedServer ? `(${tools.length})` : ''}
        </h3>

        {!selectedServer ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center select-none">
            <Cpu className="w-12 h-12 text-zinc-800 mb-2" />
            <h4 className="font-mono text-xs text-zinc-500">Inspector Dormant</h4>
            <p className="font-mono text-[11px] text-zinc-600 max-w-xs mt-1">
              Select one of the registered MCP servers to review tools exported, explore call parameters, or test execute API tools directly.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
            {tools.length === 0 ? (
              <div className="p-4 bg-zinc-950/20 rounded border border-[#27272a] text-xs font-mono text-zinc-500 text-center">
                Establishing RPC connection and scanning tools...
              </div>
            ) : (
              tools.map((tool) => {
                const isSelected = selectedTool?.name === tool.name;
                return (
                  <div
                    key={tool.name}
                    onClick={() => selectTool(tool)}
                    className={`p-4 rounded border transition-all cursor-pointer flex flex-col gap-2.5 ${
                      isSelected
                        ? 'bg-[#121215] border-[#f59e0b]'
                        : 'bg-[#121215] border-[#27272a] hover:border-zinc-500'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <h4 className="font-mono text-sm font-bold text-zinc-200">{tool.name}</h4>
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 border border-[#27272a] px-2 py-0.5 rounded uppercase font-bold">
                        Tool
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
      <div className="w-[420px] p-6 flex flex-col justify-between overflow-hidden bg-[#121215]">
        {selectedTool ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-[#27272a] pb-4 mb-4 flex justify-between items-center flex-shrink-0">
              <div>
                <span className="text-[9px] font-mono text-[#f59e0b] uppercase font-bold tracking-widest block">Interactive sandbox</span>
                <h3 className="text-base font-bold font-mono text-white mt-1 break-all">{selectedTool.name}</h3>
              </div>
              <button
                onClick={() => setSelectedTool(null)}
                className="font-mono text-xs text-zinc-500 hover:text-zinc-300"
              >
                Reset Sandbox
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5 pr-1">
              {/* Tool Parameters input form */}
              <div className="space-y-3.5">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold font-mono">Parameters</span>
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
                          <label className="text-zinc-300 font-semibold uppercase">{key}</label>
                          {isRequired && <span className="text-[#f59e0b] text-[10px] uppercase font-bold">Required</span>}
                        </div>
                        <input
                          type={propVal.type === 'number' || propVal.type === 'integer' ? 'number' : 'text'}
                          placeholder={propVal.description ? String(propVal.description) : `Enter ${key}`}
                          value={toolArgs[key] || ''}
                          onChange={(e) => setToolArgs({ ...toolArgs, [key]: e.target.value })}
                          className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                        />
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Memory Integration Toggles */}
              <div className="space-y-3 pt-4 border-t border-zinc-800/40">
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold font-mono">Memory Integration</span>
                
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="text-zinc-300">Auto-Save Result to Amneshia</span>
                  <button
                    onClick={() => setStoreAsMemory(!storeAsMemory)}
                    className="text-zinc-400 hover:text-zinc-200 p-1"
                  >
                    {storeAsMemory ? (
                      <ToggleRight className="w-8 h-8 text-[#f59e0b]" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-zinc-600" />
                    )}
                  </button>
                </div>

                {storeAsMemory && (
                  <div className="space-y-1.5 font-mono text-xs">
                    <label className="text-zinc-400 block font-bold uppercase">Record Destination (Entity Name)</label>
                    <input
                      type="text"
                      placeholder={`e.g. ${selectedServer?.name}`}
                      value={entityName}
                      onChange={(e) => setEntityName(e.target.value)}
                      className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                    />
                    <span className="text-[10px] text-zinc-500 block leading-normal mt-1">
                      Defaults to the bridged server name if not specified. Results are injected as observations.
                    </span>
                  </div>
                )}
              </div>

              {/* Output / Results display */}
              {(executionResult !== null || executionError !== null) && (
                <div className="space-y-2.5 pt-4 border-t border-zinc-800/40">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold font-mono flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-blue-400" />
                    <span>Response Output</span>
                  </span>
                  {executionError ? (
                    <pre className="bg-red-950/20 border border-red-900/30 p-3 rounded font-mono text-[11px] text-red-400 overflow-x-auto whitespace-pre-wrap">
                      Error: {executionError}
                    </pre>
                  ) : (
                    <pre className="bg-[#09090b] border border-[#27272a] p-3 rounded font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-56">
                      {JSON.stringify(executionResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* Run Button */}
            <div className="pt-4 border-t border-[#27272a] mt-4 flex justify-end flex-shrink-0">
              <button
                onClick={handleCallTool}
                disabled={isRunning}
                className="w-full flex items-center justify-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] disabled:bg-zinc-800 text-black disabled:text-zinc-600 py-2.5 rounded font-mono text-xs font-semibold select-none transition-all active:scale-[0.98]"
              >
                {isRunning ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin"></span>
                    <span>Running Tool Session...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Execute Tool</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center select-none">
            <Terminal className="w-12 h-12 text-zinc-800 mb-2" />
            <h4 className="font-mono text-xs text-zinc-500">Sandbox Idle</h4>
            <p className="font-mono text-[11px] text-zinc-600 max-w-xs mt-1">
              Select one of the tool definitions from the middle panel directory to configure parameters, specify memory save options, and run interactive tests.
            </p>
          </div>
        )}
      </div>

      {/* Modal: Create Server */}
      {showAddServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4">
          <div className="bg-[#121215] border border-[#27272a] p-6 rounded max-w-md w-full font-mono text-xs shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#27272a] pb-3 mb-4 select-none">
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Register MCP Server</h3>
              <button onClick={() => setShowAddServer(false)} className="text-zinc-500 hover:text-zinc-300">×</button>
            </div>
            <form onSubmit={handleAddServer} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Friendly Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Filesystem MCP"
                  value={newServer.name}
                  onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Executable Command</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. npx, node, python"
                  value={newServer.command}
                  onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 uppercase font-bold">Arguments (space-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. @modelcontextprotocol/server-filesystem /home/user"
                  value={newServer.args}
                  onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-[#f59e0b]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#27272a] select-none">
                <button
                  type="button"
                  onClick={() => setShowAddServer(false)}
                  className="px-4 py-2 border border-[#27272a] text-zinc-400 hover:text-zinc-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold rounded"
                >
                  Register Server
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
