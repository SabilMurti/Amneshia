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
  source: string | null;
  importance: string;
  confidence: number;
  expiresAt: string | null;
  supersedes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Relation {
  id: string;
  fromEntity: string;
  toEntity: string;
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

export interface ObservationHistory {
  id: string;
  observationId: string;
  oldContent: string;
  newContent: string;
  changedBy: string | null;
  changedAt: string;
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

export interface RelationWithNames {
  id: string;
  fromEntity: string;
  fromEntityName: string;
  toEntity: string;
  toEntityName: string;
  relationType: string;
  createdAt: string;
}

export interface GraphSnapshot {
  entities: Array<Entity & { observations: Observation[]; relations: RelationWithNames[] }>;
}

export interface SearchResult {
  entity: Entity;
  observations: Observation[];
  matchedContent: string;
  rank: number;
}

export interface CreateEntityInput {
  name: string;
  entityType: string;
  domain?: string;
  visibility?: string;
  allowedAgents?: string[];
}

export interface CreateRelationInput {
  from: string;
  to: string;
  relationType: string;
}

export interface AddObservationInput {
  entityName: string;
  contents: string[];
  source?: string;
  importance?: string;
  expiresAt?: string;
}

export interface UpdateObservationInput {
  observationId: string;
  newContent: string;
  changedBy?: string;
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
  description?: string;
  inputSchema?: Record<string, unknown>;
}
