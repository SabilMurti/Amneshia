export interface Entity {
  id: string;
  name: string;
  entityType: string;
  domain: string;
  visibility: string;
  allowedAgents: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Observation {
  id: string;
  entityId: string;
  content: string;
  confidence: number;
  importance: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Relation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: string;
  createdAt: string;
}

export interface RelationWithNames {
  id: string;
  fromEntityId: string;
  fromEntityName: string;
  toEntityId: string;
  toEntityName: string;
  relationType: string;
  createdAt: string;
}

export interface ExportTarget {
  id: string;
  name: string;
  path: string;
  format: string;
  autoExport: boolean;
}

export interface BridgeServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  createdAt: string;
}

export interface BridgeToolInfo {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MemoryStats {
  totalEntities: number;
  totalObservations: number;
  totalRelations: number;
  totalExportTargets: number;
  entitiesByType: Record<string, number>;
  entitiesByDomain: Record<string, number>;
  recentActivity: Array<{
    type: string;
    content: string;
    createdAt: string;
  }>;
}

export interface GraphSnapshot {
  entities: Array<Entity & { observations: Observation[]; relations: RelationWithNames[] }>;
}

export interface SearchResult {
  entity: Entity;
  observations: Observation[];
  relations: RelationWithNames[];
}
