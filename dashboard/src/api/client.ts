import type {
  GraphSnapshot,
  SearchResult,
  MemoryStats,
  BridgeServer,
  BridgeToolInfo,
  ExportTarget
} from '../types';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const errText = await res.text();
    let parsedErr;
    try {
      parsedErr = JSON.parse(errText);
    } catch {
      // Ignored
    }
    throw new Error(parsedErr?.error || parsedErr?.message || `HTTP ${res.status}: ${errText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getGraph: (domain?: string): Promise<GraphSnapshot> => {
    const url = domain ? `/api/graph?domain=${encodeURIComponent(domain)}` : '/api/graph';
    return fetchJson<GraphSnapshot>(url);
  },

  search: (query: string): Promise<SearchResult[]> => {
    return fetchJson<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`);
  },

  getStats: (): Promise<MemoryStats> => {
    return fetchJson<MemoryStats>('/api/stats');
  },

  createEntities: (entities: Array<{ name: string; entityType: string; domain: string; visibility?: string; allowedAgents?: string[] }>): Promise<unknown> => {
    return fetchJson('/api/entities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entities }),
    });
  },

  deleteEntities: (names: string[]): Promise<unknown> => {
    return fetchJson('/api/entities', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    });
  },

  addObservations: (observations: Array<{ entityName: string; content: string; confidence?: number; importance?: string; expiresAt?: string | null }>): Promise<unknown> => {
    return fetchJson('/api/observations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observations }),
    });
  },

  deleteObservations: (ids: string[]): Promise<unknown> => {
    return fetchJson('/api/observations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  },

  updateObservation: (observationId: string, newContent: string, changedBy: string): Promise<unknown> => {
    return fetchJson('/api/observations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observationId, newContent, changedBy }),
    });
  },

  createRelations: (relations: Array<{ fromEntityName: string; toEntityName: string; relationType: string }>): Promise<unknown> => {
    return fetchJson('/api/relations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relations }),
    });
  },

  deleteRelations: (ids: string[]): Promise<unknown> => {
    return fetchJson('/api/relations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  },

  getBridgeServers: (): Promise<BridgeServer[]> => {
    return fetchJson<BridgeServer[]>('/api/bridge/servers');
  },

  addBridgeServer: (name: string, command: string, args: string[]): Promise<BridgeServer> => {
    return fetchJson<BridgeServer>('/api/bridge/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, command, args }),
    });
  },

  removeBridgeServer: (id: string): Promise<unknown> => {
    return fetchJson(`/api/bridge/servers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getBridgeTools: (serverId: string): Promise<BridgeToolInfo[]> => {
    return fetchJson<BridgeToolInfo[]>(`/api/bridge/tools?serverId=${encodeURIComponent(serverId)}`);
  },

  callBridgeTool: (options: { serverId: string; toolName: string; arguments?: Record<string, unknown>; storeAsMemory?: boolean; entityName?: string }): Promise<unknown> => {
    return fetchJson('/api/bridge/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
  },

  getExportTargets: (): Promise<ExportTarget[]> => {
    return fetchJson<ExportTarget[]>('/api/exports');
  },

  addExportTarget: (name: string, path: string, format = 'markdown', autoExport = true): Promise<ExportTarget> => {
    return fetchJson<ExportTarget>('/api/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, format, autoExport }),
    });
  },

  removeExportTarget: (id: string): Promise<unknown> => {
    return fetchJson(`/api/exports/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  toggleExportTarget: (id: string): Promise<{ id: string; autoExport: boolean }> => {
    return fetchJson(`/api/exports/${encodeURIComponent(id)}/toggle`, {
      method: 'POST',
    });
  },

  syncBridge: (): Promise<{ ok: boolean; stats: { projectsSynced: string[]; observationsAdded: number; relationsCreated: number } }> => {
    return fetchJson('/api/bridge/sync', {
      method: 'POST',
    });
  },

  setAIProvider: (provider: 'openai' | 'ollama' | '9router' | 'none' | string): Promise<unknown> => {
    return fetchJson('/api/config/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
  },

  cleanupExpired: (): Promise<{ cleanedCount: number }> => {
    return fetchJson<{ cleanedCount: number }>('/api/cleanup', {
      method: 'POST',
    });
  },

  consolidateMemory: (domain?: string): Promise<{ ok: boolean; result: { purgedCount: number; supersededCount: number; consolidatedCount: number } }> => {
    return fetchJson('/api/consolidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
  }
};
