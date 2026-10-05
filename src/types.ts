/**
 * @module
 * Core type definitions and data models for the Amneshia knowledge graph engine.
 */

/**
 * Authority tier determining the lifecycle, retention weight, and decay curve of an observation.
 * - `invariant`: Immutable truth, user constraints, or security rules that never decay.
 * - `architectural`: Framework choices, core database schemas, and API contracts (365 days retention).
 * - `contextual`: Working conventions, active configurations, and environment state (90 days retention).
 * - `ephemeral`: Scratchpad notes, temporary debug logs, and short-lived state (7 days TTL).
 */
export type AuthorityTier = 'invariant' | 'architectural' | 'contextual' | 'ephemeral';

/**
 * Operational status of an observation within the Truth Maintenance DAG.
 * - `active`: Valid and queryable fact.
 * - `stale`: A premise in the dependency chain was revoked or updated.
 * - `invalidated`: Explicitly negated or revoked by an agent or user.
 * - `superseded`: Replaced by a newer version of the observation.
 * - `decayed`: Dropped below the mathematical decay threshold.
 */
export type ObservationStatus = 'active' | 'stale' | 'invalidated' | 'superseded' | 'decayed';

/**
 * Represents a named entity node within the knowledge graph.
 */
export interface Entity {
  /** Unique entity UUID */
  id: string;
  /** Unique entity name (e.g. "React Architecture", "Production Database") */
  name: string;
  /** Categorical type of the entity (e.g. "infrastructure", "concept", "person") */
  entityType: string;
  /** Domain namespace grouping related entities (e.g. "backend", "frontend", "personal") */
  domain: string;
  /** Visibility scope ("public" or "private") */
  visibility: string;
  /** List of agent identifiers authorized to view this entity */
  allowedAgents: string[];
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last update timestamp */
  updatedAt: string;
}

/**
 * Represents a discrete factual claim or observation recorded about an entity.
 */
export interface Observation {
  /** Unique observation UUID */
  id: string;
  /** ID of the entity this observation describes */
  entityId: string;
  /** The natural language factual content of the observation */
  content: string;
  /** Provenance source (e.g. file path, URL, agent ID, or user prompt) */
  source: string | null;
  /** Importance descriptor or numerical weight */
  importance: string;
  /** Confidence score between 0.0 and 1.0 */
  confidence: number;
  /** Authority tier dictating decay and eviction policy */
  authorityTier: AuthorityTier;
  /** Observation UUIDs that this fact logically depends upon */
  derivedFrom: string[];
  /** Total number of times this observation was retrieved */
  accessCount: number;
  /** ISO-8601 timestamp of last retrieval */
  lastAccessedAt: string | null;
  /** Lifecycle status in the Truth Maintenance DAG */
  status: ObservationStatus;
  /** Optional TTL expiration timestamp */
  expiresAt: string | null;
  /** UUID of the prior observation this fact replaces */
  supersedes: string | null;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last update timestamp */
  updatedAt: string;
}

/**
 * Directed relationship edge connecting two entities in the knowledge graph.
 */
export interface Relation {
  /** Unique relation UUID */
  id: string;
  /** Source entity UUID */
  fromEntity: string;
  /** Target entity UUID */
  toEntity: string;
  /** Semantic predicate describing the relationship (e.g. "depends_on", "implements") */
  relationType: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
}

/**
 * Configuration for an automated export destination (e.g. Markdown file synchronization).
 */
export interface ExportTarget {
  /** Unique target UUID */
  id: string;
  /** Descriptive name of the target */
  name: string;
  /** Absolute directory or file path for the export */
  path: string;
  /** Serialization format (e.g. "markdown") */
  format: string;
  /** Whether automatic synchronization runs on graph mutations */
  autoExport: boolean;
}

/**
 * Historical audit log of mutations made to an observation.
 */
export interface ObservationHistory {
  /** Unique history record UUID */
  id: string;
  /** ID of the modified observation */
  observationId: string;
  /** Content before modification */
  oldContent: string;
  /** Content after modification */
  newContent: string;
  /** Identifier of the user or agent who executed the modification */
  changedBy: string | null;
  /** ISO-8601 timestamp of the mutation */
  changedAt: string;
}

/**
 * Log entry recording detected factual opposition or contradiction between observations.
 */
export interface ContradictionLogEntry {
  /** Unique contradiction UUID */
  id: string;
  /** New observation UUID */
  observationId: string;
  /** Existing conflicting observation UUID */
  conflictingObservationId: string;
  /** Entity UUID where contradiction occurred */
  entityId: string;
  /** Explanation of why polarity or token opposition was detected */
  reason: string;
  /** Resolution status */
  resolution?: 'override' | 'kept_both' | 'rejected' | null;
  /** ISO-8601 detection timestamp */
  detectedAt: string;
  /** Optional ISO-8601 resolution timestamp */
  resolvedAt?: string | null;
}

/**
 * Access log entry tracking retrieval events for memory decay and reinforcement calculations.
 */
export interface AccessLogEntry {
  /** Unique access log UUID */
  id: string;
  /** ID of the accessed entity */
  entityId: string;
  /** ID of the specific observation retrieved, if applicable */
  observationId?: string | null;
  /** ISO-8601 timestamp of the access */
  accessedAt: string;
}

/**
 * Quantitative health metrics and breakdown of the Amneshia knowledge graph.
 */
export interface MemoryStats {
  /** Total count of entities */
  totalEntities: number;
  /** Total count of observations across all statuses */
  totalObservations: number;
  /** Total count of relationship edges */
  totalRelations: number;
  /** Total count of configured export targets */
  totalExportTargets: number;
  /** Total count of media assets stored in CAS */
  totalMediaAssets?: number;
  /** Count of open unresolved contradictions */
  totalContradictions?: number;
  /** Breakdown of observations by authority tier */
  observationsByTier?: Record<string, number>;
  /** Breakdown of observations by lifecycle status */
  observationsByStatus?: Record<string, number>;
  /** Entity counts grouped by entity type */
  entitiesByType: Record<string, number>;
  /** Entity counts grouped by domain namespace */
  entitiesByDomain: Record<string, number>;
  /** Recent mutation activity timeline */
  recentActivity: Array<{
    type: string;
    content: string;
    createdAt: string;
  }>;
}

/**
 * Relational edge enriched with human-readable entity names for graph inspection.
 */
export interface RelationWithNames {
  /** Unique relation UUID */
  id: string;
  /** Source entity UUID */
  fromEntity: string;
  /** Source entity human-readable name */
  fromEntityName: string;
  /** Target entity UUID */
  toEntity: string;
  /** Target entity human-readable name */
  toEntityName: string;
  /** Semantic relationship predicate */
  relationType: string;
  /** ISO-8601 creation timestamp */
  createdAt: string;
}

/**
 * Full knowledge graph snapshot containing entities with their observations and relations.
 */
export interface GraphSnapshot {
  /** List of enriched entities */
  entities: Array<Entity & { observations: Observation[]; relations: RelationWithNames[] }>;
}

/**
 * Search hit returned from an FTS5 full-text search query.
 */
export interface SearchResult {
  /** Matched entity record */
  entity: Entity;
  /** Observations belonging to the entity */
  observations: Observation[];
  /** Snippet or matching text content */
  matchedContent: string;
  /** BM25 search ranking score */
  rank: number;
}

/**
 * Input payload for registering a new entity.
 */
export interface CreateEntityInput {
  /** Unique name of the entity */
  name: string;
  /** Categorical entity type */
  entityType: string;
  /** Optional domain namespace */
  domain?: string;
  /** Visibility scope */
  visibility?: string;
  /** Authorized agent IDs */
  allowedAgents?: string[];
}

/**
 * Input payload for creating a relationship edge.
 */
export interface CreateRelationInput {
  /** Source entity UUID or name */
  from: string;
  /** Target entity UUID or name */
  to: string;
  /** Semantic predicate (e.g. "depends_on", "implements") */
  relationType: string;
}

/**
 * Input payload for adding observations to an entity.
 */
export interface AddObservationInput {
  /** Target entity name */
  entityName: string;
  /** Array of factual statements to attach */
  contents: string[];
  /** Optional source provenance */
  source?: string;
  /** Importance descriptor */
  importance?: string;
  /** Authority tier */
  authorityTier?: AuthorityTier;
  /** Dependency premise observation UUIDs */
  derivedFrom?: string[];
  /** Optional TTL expiration */
  expiresAt?: string;
}

/**
 * Input payload for modifying an existing observation.
 */
export interface UpdateObservationInput {
  /** Target observation UUID to update */
  observationId: string;
  /** New content text */
  newContent: string;
  /** Identifier of the user or agent initiating update */
  changedBy?: string;
  /** Updated authority tier */
  authorityTier?: AuthorityTier;
  /** Updated status */
  status?: ObservationStatus;
}

/**
 * High-level MCP input schema for the `remember` tool.
 */
export interface RememberInput {
  /** Entity name to associate facts with */
  entity: string;
  /** Optional entity category type */
  type?: string;
  /** Optional domain namespace */
  domain?: string;
  /** Array of facts to record */
  facts: string[];
  /** Authority tier */
  tier?: AuthorityTier;
  /** Observation IDs this observation logically depends on */
  derivedFrom?: string[];
}

/**
 * High-level MCP input schema for the `recall` tool.
 */
export interface RecallInput {
  /** Natural language or keyword query string */
  query: string;
  /** Maximum token budget allowed for retrieved facts */
  tokenBudget?: number;
  /** Optional domain filter */
  domain?: string;
  /** Graph traversal hop depth */
  depth?: number;
}

/**
 * High-level result payload returned by the `recall` tool.
 */
export interface RecallResult {
  /** Ranked list of search matches */
  results: SearchResult[];
  /** Approximate token consumption of the returned payload */
  tokensUsed: number;
  /** Whether the results were truncated to fit the token budget */
  truncated: boolean;
  /** Total matching observations before budget budgeting */
  totalAvailable: number;
}

/**
 * High-level MCP input schema for the `forget` tool.
 */
export interface ForgetInput {
  /** Target observation UUID or entity name to invalidate */
  target: string;
  /** If true, permanently purge from database; if false, mark as invalidated */
  hard?: boolean;
  /** If true, cascade invalidation to all dependent derived facts */
  cascade?: boolean;
}

/**
 * First-class immutable media asset stored in the Content-Addressable Storage (CAS).
 */
export interface MediaAsset {
  /** Unique media asset UUID */
  id: string;
  /** Associated entity ID in the knowledge graph */
  entityId: string;
  /** SHA-256 cryptographic digest of the raw media content */
  sha256: string;
  /** Standard MIME content type (e.g. "image/jpeg", "audio/ogg", "application/pdf") */
  mimeType: string;
  /** Original file basename when ingested */
  fileName: string;
  /** Physical byte length of the asset */
  fileSize: number;
  /** Relative storage path within the .amneshia/ directory tree */
  relativePath: string;
  /** ISO-8601 ingestion timestamp */
  createdAt: string;
}

/**
 * Payload for registering a media asset record into the database layer.
 */
export interface CreateMediaAssetInput {
  entityId: string;
  sha256: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  relativePath: string;
}

/**
 * High-level MCP input schema for the `remember_media` tool.
 */
export interface RememberMediaInput {
  /** Absolute or workspace-relative path to the source media file on disk */
  filePath: string;
  /** Unique entity name representing this media item */
  entity: string;
  /** Optional domain namespace */
  domain?: string;
  /** Atomic factual observations describing what the media depicts or contains */
  facts: string[];
  /** Optional authority tier for attached observations */
  tier?: AuthorityTier;
  /** Optional directed relationships connecting this media to other entities */
  relations?: Array<{ to: string; relationType: string }>;
}

