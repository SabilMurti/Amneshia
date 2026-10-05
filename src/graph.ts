/**
 * @module
 * High-level KnowledgeGraph domain orchestration layer for Amneshia.
 * Coordinates entity management, observations, relational traversal, and dual-write markdown sync.
 */

import type { AddObservationInput, CreateEntityInput, CreateRelationInput, Entity, GraphSnapshot, MemoryStats, SearchResult, UpdateObservationInput, ExportTarget, RelationWithNames, Observation, MediaAsset, RememberMediaInput } from './types.js';
import { DatabaseLayer } from './database.js';
import { exportToMarkdown } from './export/markdown.js';
import type { DualWriteSync } from './storage/index.js';
import { storeMediaAsset } from './storage/media-store.js';

/**
 * Input arguments for export target configuration operations.
 */
export interface ExportTargetActionInput {
  /** Target management action to execute */
  action: 'list' | 'add' | 'remove' | 'toggle';
  /** Target destination name */
  name?: string;
  /** Filesystem path */
  path?: string;
  /** Target format */
  format?: string;
  /** Existing target UUID */
  id?: string;
  /** Whether auto-export should run on graph mutations */
  autoExport?: boolean;
}

/**
 * Search results payload returned by full-text memory queries.
 */
export interface SearchMemoryResult {
  /** The original search query string */
  query: string;
  /** Maximum match limit requested */
  limit: number;
  /** Matching entity and observation records */
  results: SearchResult[];
}

/**
 * Result payload from executing a manual memory export.
 */
export interface ExportMemoryResult {
  /** Count of exported targets */
  exported: number;
  /** Target configurations processed */
  targets: ExportTarget[];
}

/**
 * Orchestrates knowledge graph operations over the SQLite database layer and dual-write filesystem sync.
 */
export class KnowledgeGraph {
  /**
   * Initializes the KnowledgeGraph orchestration service.
   * @param database Database storage layer instance
   * @param dualWriteSync Optional dual-write markdown synchronization handler
   */
  constructor(
    private readonly database: DatabaseLayer,
    private readonly dualWriteSync?: DualWriteSync
  ) {}

  /**
   * Creates one or more named entities in the graph.
   * @param inputs List of entity definitions to create
   * @returns Array of created entity records
   */
  createEntities(inputs: CreateEntityInput[]): Entity[] {
    const created: Entity[] = [];
    for (const input of inputs) {
      const existing = this.database.getEntityByName(input.name);
      if (existing) {
        continue;
      }
      created.push(this.database.createEntity(input));
    }
    this.triggerAutoExport();
    return created;
  }

  /**
   * Creates directed relationship edges between existing entities.
   * @param inputs Array of relations to establish
   * @returns Array of created relation identifiers
   */
  createRelations(inputs: CreateRelationInput[]): Array<{ relation: string }> {
    const created: Array<{ relation: string }> = [];
    for (const input of inputs) {
      const fromEntity = this.database.getEntityByName(input.from);
      const toEntity = this.database.getEntityByName(input.to);
      if (!fromEntity || !toEntity) {
        continue;
      }
      const rel = this.database.createRelation(fromEntity.id, toEntity.id, input.relationType);
      created.push({ relation: rel.id });
    }
    this.triggerAutoExport();
    return created;
  }

  /**
   * Attaches factual observations to entities.
   * @param inputs List of observation insertion payloads
   * @returns Array of mapped entity names and assigned observation UUIDs
   */
  async addObservations(inputs: AddObservationInput[]): Promise<Array<{ entityName: string; observationIds: string[] }>> {
    const created: Array<{ entityName: string; observationIds: string[] }> = [];

    for (const input of inputs) {
      const entity = this.database.getEntityByName(input.entityName);
      if (!entity) {
        continue;
      }
      const observationIds: string[] = [];

      for (const content of input.contents) {
        const observation = this.database.addObservation(
          entity.id,
          content,
          input.source,
          input.importance ?? 'normal',
          1,
          input.expiresAt,
          input.authorityTier ?? 'contextual',
          input.derivedFrom ?? []
        );
        observationIds.push(observation.id);
      }
      created.push({ entityName: entity.name, observationIds });
    }
    this.triggerAutoExport();
    return created;
  }

  /**
   * Deletes entities and their associated observations and relations by name.
   * @param names List of entity names to delete
   * @returns Number of entities removed
   */
  deleteEntities(names: string[]): number {
    let removed = 0;
    for (const name of names) {
      const entity = this.database.getEntityByName(name);
      if (!entity) continue;
      if (this.database.deleteEntity(entity.id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }

  /**
   * Deletes discrete observations by UUID.
   * @param ids Observation UUIDs to delete
   * @returns Count of observations removed
   */
  deleteObservations(ids: string[]): number {
    let removed = 0;
    for (const id of ids) {
      if (this.database.deleteObservation(id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }

  /**
   * Deletes relationship edges by UUID.
   * @param ids Relation UUIDs to delete
   * @returns Count of relations removed
   */
  deleteRelations(ids: string[]): number {
    let removed = 0;
    for (const id of ids) {
      if (this.database.deleteRelation(id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }

  /**
   * Updates an observation and executes cascading invalidation if marked stale or invalidated.
   * @param input Update observation payload
   * @returns Updated observation record
   */
  updateObservation(input: UpdateObservationInput): Observation {
    const updated = this.database.updateObservation(
      input.observationId,
      input.newContent,
      input.changedBy,
      input.authorityTier,
      input.status
    );
    if (input.status === 'invalidated' || input.status === 'stale') {
      this.database.cascadeInvalidate(input.observationId);
    }
    this.triggerAutoExport();
    return updated;
  }

  /**
   * Performs standard FTS5 full-text search against the knowledge graph.
   * @param query Search query string
   * @param limit Maximum results to return
   * @param domain Optional domain filter
   * @returns Formatted search result
   */
  searchMemory(query: string, limit = 20, domain?: string): SearchMemoryResult {
    const filtered = this.database.searchFTS(query, limit * 2).filter((result) => (domain ? result.entity.domain === domain : true));
    return {
      query,
      limit,
      results: filtered.slice(0, limit),
    };
  }

  /**
   * Performs BM25 relevance-ranked FTS5 search excluding invalidated facts.
   * @param query Search query string
   * @param limit Maximum results to return
   * @param domain Optional domain filter
   * @returns Formatted search result
   */
  searchRelevantMemory(query: string, limit = 20, domain?: string): SearchMemoryResult {
    const filtered = this.database.searchFTSRelevant(query, limit * 2).filter((result) => (domain ? result.entity.domain === domain : true));
    return {
      query,
      limit,
      results: filtered.slice(0, limit),
    };
  }

  /**
   * Executes multi-hop GraphRAG traversal to compile rich structured context for an agent.
   * @param query Search query topic
   * @param depth Graph hop traversal depth
   * @param limit Maximum seed entities
   * @param domain Optional domain filter
   * @returns Markdown-formatted GraphRAG context document
   */
  getContext(query: string, depth = 1, limit = 5, domain?: string): string {
    const seeds = this.database.searchFTSRelevant(query, limit).filter((result) => (domain ? result.entity.domain === domain : true));
    
    if (seeds.length === 0) return "No relevant context found.";

    const visitedEntityIds = new Set<string>();
    const currentLevelIds = new Set<string>();

    for (const seed of seeds) {
      visitedEntityIds.add(seed.entity.id);
      currentLevelIds.add(seed.entity.id);
    }

    const relationsCollected = new Map<string, RelationWithNames>();

    for (let currentDepth = 0; currentDepth < depth; currentDepth++) {
      const nextLevelIds = new Set<string>();
      
      for (const id of currentLevelIds) {
        const relations = this.database.getRelationsByEntity(id);
        for (const rel of relations) {
          relationsCollected.set(rel.id, rel);
          if (!visitedEntityIds.has(rel.fromEntity)) {
             nextLevelIds.add(rel.fromEntity);
             visitedEntityIds.add(rel.fromEntity);
          }
          if (!visitedEntityIds.has(rel.toEntity)) {
             nextLevelIds.add(rel.toEntity);
             visitedEntityIds.add(rel.toEntity);
          }
        }
      }
      
      currentLevelIds.clear();
      for (const id of nextLevelIds) currentLevelIds.add(id);
    }

    const entities = Array.from(visitedEntityIds).map(id => {
      const entity = this.database.getEntityById(id);
      if (!entity) return null;
      const observations = this.database.getObservationsByEntity(id).filter(
        (o) => o.status === 'active' && !o.supersedes && (o.expiresAt === null || new Date(o.expiresAt).getTime() > Date.now())
      );
      return { ...entity, observations };
    }).filter(e => e !== null);

    const lines: string[] = [];
    lines.push(`# GraphRAG Context for: "${query}"`);
    lines.push(`> Depth: ${depth}, Seed matches: ${seeds.length}, Total entities in subgraph: ${entities.length}\n`);

    for (const entity of entities) {
      lines.push(`### ${entity!.name} [${entity!.entityType}]`);
      if (entity!.observations.length === 0) {
        lines.push(`- (No active observations)`);
      } else {
        for (const obs of entity!.observations) {
          lines.push(`- ${obs.content}`);
        }
      }
      
      const entityRels = Array.from(relationsCollected.values()).filter(r => r.fromEntity === entity!.id || r.toEntity === entity!.id);
      if (entityRels.length > 0) {
        const relSummaries = Array.from(new Set(entityRels.map(r => {
           const other = r.fromEntity === entity!.id ? r.toEntityName : r.fromEntityName;
           const direction = r.fromEntity === entity!.id ? '→' : '←';
           return `${direction} ${r.relationType} ${other}`;
        })));
        lines.push(`**Relations:** ${relSummaries.join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd();
  }

  /**
   * Retrieves a full snapshot of the knowledge graph.
   * @param domain Optional domain filter
   * @param entityType Optional entity type filter
   * @returns Graph snapshot with entities, observations, and relations
   */
  readGraph(domain?: string, entityType?: string): GraphSnapshot {
    return this.database.readGraph(domain, entityType);
  }

  /**
   * Opens specific nodes by entity name, returning their complete subgraphs.
   * @param names List of entity names to inspect
   * @returns Graph snapshot for matching nodes
   */
  openNodes(names: string[]): GraphSnapshot {
    return this.database.openNodes(names);
  }

  /**
   * Fetches health metrics and quantitative storage breakdown.
   * @returns MemoryStats object
   */
  getStats(): MemoryStats {
    return this.database.getStats();
  }

  /**
   * Purges expired observations that have passed their TTL.
   * @returns Count of observations removed
   */
  cleanupExpired(): number {
    return this.database.cleanupExpired();
  }

  /**
   * Exports memory snapshot to all configured export targets.
   * @returns Summary of exported targets
   */
  exportMemory(): ExportMemoryResult {
    const targets = this.database.getExportTargets();
    return { exported: targets.length, targets };
  }

  /**
   * Manages export targets (list, add, remove, toggle).
   * @param input Action payload
   * @returns Target mutation result
   */
  manageExportTargets(input: ExportTargetActionInput): ExportTarget[] | ExportTarget | { removed: boolean } | { id: string; autoExport: boolean } {
    if (input.action === 'list') {
      return this.database.getExportTargets();
    }
    if (input.action === 'add') {
      if (!input.name || !input.path) {
        throw new Error('name and path are required when adding an export target');
      }
      const autoExport = input.autoExport !== false ? 1 : 0;
      return this.database.addExportTarget(input.name, input.path, input.format ?? 'markdown', autoExport);
    }
    if (input.action === 'remove') {
      if (!input.id) {
        throw new Error('id is required when removing an export target');
      }
      return { removed: this.database.removeExportTarget(input.id) };
    }
    if (input.action === 'toggle') {
      if (!input.id) {
        throw new Error('id is required when toggling an export target');
      }
      const targets = this.database.getExportTargets();
      const target = targets.find(t => t.id === input.id);
      if (!target) {
        throw new Error(`Export target with id ${input.id} not found`);
      }
      const newAutoExport = !target.autoExport;
      this.database.updateExportTarget(input.id, newAutoExport);
      return { id: input.id, autoExport: newAutoExport };
    }
    throw new Error(`Invalid action: ${input.action}`);
  }

  /**
   * Resolves the primary storage root directory for media CAS.
   * Prefers the Git-synced knowledgeDir if dual-write sync is active.
   */
  getStorageRoot(): string {
    return this.dualWriteSync ? this.dualWriteSync.getKnowledgeDir() : this.database.getDataDir();
  }

  /**
   * Ingests an immutable media asset into Content-Addressable Storage (CAS),
   * creates or links an entity, persists a media_assets record, attaches descriptive observations,
   * establishes directed relations, and triggers dual-write sync.
   * @param input High-level media ingestion payload
   * @returns Ingestion outcome including entity, media asset, and observation identifiers
   */
  async rememberMedia(input: RememberMediaInput): Promise<{
    ok: boolean;
    entity: Entity;
    media: MediaAsset;
    observationIds: string[];
    relations: string[];
    deduplicated: boolean;
  }> {
    const storageRoot = this.getStorageRoot();
    const stored = await storeMediaAsset(input.filePath, storageRoot);

    let entity = this.database.getEntityByName(input.entity);
    if (!entity) {
      entity = this.database.createEntity({
        name: input.entity,
        entityType: 'media',
        domain: input.domain ?? 'personal',
      });
    }

    let media = this.database.getMediaByEntity(entity.id);
    if (!media) {
      media = this.database.createMediaAsset({
        entityId: entity.id,
        sha256: stored.sha256,
        mimeType: stored.mimeType,
        fileName: stored.fileName,
        fileSize: stored.fileSize,
        relativePath: stored.relativePath,
      });
    }

    const observationIds: string[] = [];
    const tier = input.tier ?? 'contextual';
    for (const fact of input.facts) {
      const obs = this.database.addObservation(
        entity.id,
        fact,
        'media-ingest',
        'normal',
        1.0,
        undefined,
        tier
      );
      observationIds.push(obs.id);
    }

    const relationsCreated: string[] = [];
    if (input.relations && input.relations.length > 0) {
      for (const rel of input.relations) {
        const targetEntity = this.database.getEntityByName(rel.to);
        if (targetEntity) {
          const createdRel = this.database.createRelation(entity.id, targetEntity.id, rel.relationType);
          relationsCreated.push(createdRel.id);
        }
      }
    }

    this.triggerAutoExport();

    return {
      ok: true,
      entity,
      media,
      observationIds,
      relations: relationsCreated,
      deduplicated: stored.deduplicated,
    };
  }

  /**
   * Retrieves media asset details associated with an entity.
   * @param entityId Entity UUID
   * @returns MediaAsset record or null if not found
   */
  getMediaByEntity(entityId: string): MediaAsset | null {
    return this.database.getMediaByEntity(entityId);
  }

  /**
   * Retrieves media asset details by cryptographic SHA-256 hash.
   * @param sha256 Content digest
   * @returns MediaAsset record or null if not found
   */
  getMediaByHash(sha256: string): MediaAsset | null {
    return this.database.getMediaByHash(sha256);
  }

  private triggerAutoExport() {
    exportToMarkdown(this);
    if (this.dualWriteSync) {
      try {
        this.dualWriteSync.syncAll();
      } catch (err) {
        console.warn('Failed to sync to markdown storage:', err);
      }
    }
  }
}
