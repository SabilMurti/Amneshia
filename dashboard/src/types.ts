export type AuthorityTier = 'invariant' | 'architectural' | 'contextual' | 'ephemeral';
export type ObservationStatus = 'active' | 'stale' | 'invalidated' | 'superseded' | 'decayed';

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
  authorityTier: AuthorityTier;
  derivedFrom: string[];
  accessCount: number;
  lastAccessedAt: string | null;
  status: ObservationStatus;
  supersedes?: string | null;
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
  fromEntity: string;
  fromEntityName: string;
  toEntity: string;
  toEntityName: string;
  fromEntityId?: string;
  toEntityId?: string;
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

export interface ContradictionLogEntry {
  id: string;
  observationId: string;
  conflictingObservationId: string;
  entityId: string;
  reason: string;
  resolution?: 'override' | 'kept_both' | 'rejected' | null;
  detectedAt: string;
  resolvedAt?: string | null;
}

export interface MemoryStats {
  totalEntities: number;
  totalObservations: number;
  totalRelations: number;
  totalExportTargets: number;
  totalContradictions?: number;
  observationsByTier?: Record<string, number>;
  observationsByStatus?: Record<string, number>;
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
  relations?: RelationWithNames[];
}
