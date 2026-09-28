import type {
  GraphSnapshot,
  SearchResult,
  MemoryStats,
  ExportTarget,
  ContradictionLogEntry,
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

  addObservations: (observations: Array<{ entityName: string; contents: string[]; source?: string; importance?: string; authorityTier?: string; derivedFrom?: string[]; expiresAt?: string | null }>): Promise<unknown> => {
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

  updateObservation: (observationId: string, newContent: string, changedBy?: string, authorityTier?: string, status?: string): Promise<unknown> => {
    return fetchJson('/api/observations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observationId, newContent, changedBy, authorityTier, status }),
    });
  },

  createRelations: (relations: Array<{ from: string; to: string; relationType: string }>): Promise<unknown> => {
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

  getContradictions: (entityId?: string): Promise<ContradictionLogEntry[]> => {
    const url = entityId ? `/api/contradictions?entityId=${encodeURIComponent(entityId)}` : '/api/contradictions';
    return fetchJson<ContradictionLogEntry[]>(url);
  },

  resolveContradiction: (id: string, resolution: 'override' | 'kept_both' | 'rejected'): Promise<{ ok: boolean }> => {
    return fetchJson<{ ok: boolean }>(`/api/contradictions/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    });
  },

  reindex: (): Promise<{ entities: number; observations: number; relations: number }> => {
    return fetchJson<{ entities: number; observations: number; relations: number }>('/api/reindex', {
      method: 'POST',
    });
  },

  gc: (): Promise<{ removed: number }> => {
    return fetchJson<{ removed: number }>('/api/gc', {
      method: 'POST',
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

  cleanupExpired: (): Promise<{ cleanedCount: number }> => {
    return fetchJson<{ cleanedCount: number }>('/api/cleanup', {
      method: 'POST',
    });
  },

  runMaintenance: (domain?: string, dryRun = false): Promise<{ ok: boolean; result: { purgedCount: number; decayedCount: number; supersededCount: number; details?: { superseded: any[] } } }> => {
    return fetchJson('/api/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, dryRun }),
    });
  },
};
