/**
 * @module
 * Embedded SQLite FTS5 database persistence layer for Amneshia.
 * Provides ACID transactional storage, BM25 indexing, and DAG dependency queries.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import type {
  AccessLogEntry,
  AddObservationInput,
  AuthorityTier,
  ContradictionLogEntry,
  CreateEntityInput,
  Entity,
  ExportTarget,
  GraphSnapshot,
  MemoryStats,
  Observation,
  ObservationHistory,
  ObservationStatus,
  Relation,
  RelationWithNames,
  SearchResult,
} from '../types.js';
import { SCHEMA_SQL } from './schema.js';
import { runMigrations } from './migrations.js';
import { fuseRRF, LocalOnnxEmbedder } from '../search/index.js';

interface FtsSearchRow {
  entity_id: string;
  observation_id: string | null;
  observation_content: string;
  rank: number;
}

interface EntityRow {
  id: string;
  name: string;
  entity_type: string;
  domain: string;
  visibility: string;
  allowed_agents: string;
  created_at: string;
  updated_at: string;
}

interface ObservationRow {
  id: string;
  entity_id: string;
  content: string;
  source: string | null;
  importance: string;
  confidence: number;
  authority_tier: string;
  derived_from: string;
  access_count: number;
  last_accessed_at: string | null;
  status: string;
  expires_at: string | null;
  supersedes: string | null;
  created_at: string;
  updated_at: string;
}

interface RelationRow {
  id: string;
  from_entity: string;
  to_entity: string;
  relation_type: string;
  created_at: string;
}

interface ExportTargetRow {
  id: string;
  name: string;
  path: string;
  format: string;
  auto_export: number;
}

interface ObservationHistoryRow {
  id: string;
  observation_id: string;
  old_content: string;
  new_content: string;
  changed_by: string | null;
  changed_at: string;
}

interface ContradictionLogRow {
  id: string;
  observation_id: string;
  conflicting_observation_id: string;
  entity_id: string;
  reason: string;
  resolution: string | null;
  detected_at: string;
  resolved_at: string | null;
}

interface StatsRow {
  value: number;
}

interface GroupCountRow {
  key: string;
  value: number;
}

interface RecentActivityRow {
  type: string;
  content: string;
  created_at: string;
}

interface SearchMatch {
  entity: Entity;
  observations: Observation[];
  matchedContent: string;
  rank: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

function homedirDataDir(): string {
  return path.join(os.homedir(), '.amneshia');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function toAllowedAgents(value: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed;
    }
  } catch {
    // ignore malformed storage
  }
  return [];
}

function toDerivedFrom(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed;
    }
  } catch {
    // ignore malformed storage
  }
  return [];
}

function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    name: row.name,
    entityType: row.entity_type,
    domain: row.domain,
    visibility: row.visibility,
    allowedAgents: toAllowedAgents(row.allowed_agents),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toObservation(row: ObservationRow): Observation {
  return {
    id: row.id,
    entityId: row.entity_id,
    content: row.content,
    source: row.source,
    importance: row.importance,
    confidence: row.confidence,
    authorityTier: (row.authority_tier as AuthorityTier) || 'contextual',
    derivedFrom: toDerivedFrom(row.derived_from),
    accessCount: row.access_count ?? 0,
    lastAccessedAt: row.last_accessed_at,
    status: (row.status as ObservationStatus) || 'active',
    expiresAt: row.expires_at,
    supersedes: row.supersedes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRelation(row: RelationRow): Relation {
  return {
    id: row.id,
    fromEntity: row.from_entity,
    toEntity: row.to_entity,
    relationType: row.relation_type,
    createdAt: row.created_at,
  };
}

function toRelationWithNames(row: RelationRow & { from_entity_name: string; to_entity_name: string }): RelationWithNames {
  return {
    id: row.id,
    fromEntity: row.from_entity,
    fromEntityName: row.from_entity_name,
    toEntity: row.to_entity,
    toEntityName: row.to_entity_name,
    relationType: row.relation_type,
    createdAt: row.created_at,
  };
}

function toExportTarget(row: ExportTargetRow): ExportTarget {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    format: row.format,
    autoExport: row.auto_export === 1,
  };
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
  'who', 'what', 'which', 'this', 'that', 'these', 'those', 'to', 'of', 'in', 'on', 'at', 'by',
  'for', 'with', 'about', 'from', 'up', 'down', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could',
  'may', 'might', 'must', 'just', 'only', 'also', 'some', 'any', 'no', 'not', 'other', 'than',
  'yang', 'di', 'ke', 'dari', 'ini', 'itu', 'untuk', 'dengan', 'pada', 'adalah', 'dan', 'atau',
  'tapi', 'tetapi', 'jika', 'maka', 'kapan', 'dimana', 'mengapa', 'bagaimana', 'siapa', 'apa',
  'secara', 'oleh', 'tentang', 'ada', 'adapun', 'bagi', 'sebagai', 'ia', 'mereka', 'kita',
  'kami', 'saya', 'anda', 'kamu', 'dia', 'yaitu', 'yakni', 'seperti', 'serta', 'bisa',
  'dapat', 'harus', 'akan', 'telah', 'sudah', 'belum', 'sedang', 'boleh', 'hanya', 'saja',
  'juga', 'pun', 'lah', 'kah', 'deh', 'sih', 'dong', 'kok', 'tuh',
]);

function stripStopWords(query: string): string {
  const cleaned = query
    .split(/\s+/)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase().replace(/[^a-zA-Z0-9]/g, '')))
    .join(' ');
  return cleaned.trim().length > 0 ? cleaned : query;
}

function sanitizeFtsQuery(query: string): string {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/["'`]/g, ' ').replace(/[\-+<>~*():]/g, ' '))
    .flatMap((token) => token.split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return '""';
  }

  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' OR ');
}

function normalizeArray(value: string[] | undefined): string {
  return JSON.stringify(value ?? []);
}

/**
 * SQLite FTS5 database persistence manager for entities, observations, and DAG relations.
 */
export class DatabaseLayer {
  private readonly db: Database.Database;
  private readonly dataDir: string;
  private readonly statements: {
    createEntity: Database.Statement;
    getEntityByName: Database.Statement;
    getEntityById: Database.Statement;
    deleteEntity: Database.Statement;
    insertObservation: Database.Statement;
    getObservationsByEntity: Database.Statement;
    getActiveObservationsByEntity: Database.Statement;
    getObservationById: Database.Statement;
    updateObservation: Database.Statement;
    setObservationStatus: Database.Statement;
    deleteObservation: Database.Statement;
    createRelation: Database.Statement;
    getRelationsByEntity: Database.Statement;
    deleteRelation: Database.Statement;
    deleteFtsObservation: Database.Statement;
    insertFtsObservation: Database.Statement;
    insertFtsEntity: Database.Statement;
    searchFts: Database.Statement;
    readGraphEntities: Database.Statement;
    readGraphObservations: Database.Statement;
    readGraphRelations: Database.Statement;
    openNodesEntities: Database.Statement;
    openNodesObservations: Database.Statement;
    openNodesRelations: Database.Statement;
    countEntities: Database.Statement;
    countObservations: Database.Statement;
    countRelations: Database.Statement;
    countExportTargets: Database.Statement;
    countContradictions: Database.Statement;
    entitiesByType: Database.Statement;
    entitiesByDomain: Database.Statement;
    observationsByTier: Database.Statement;
    observationsByStatus: Database.Statement;
    recentActivity: Database.Statement;
    cleanupExpired: Database.Statement;
    gcObservations: Database.Statement;
    getExportTargets: Database.Statement;
    addExportTarget: Database.Statement;
    removeExportTarget: Database.Statement;
    observationHistory: Database.Statement;
    updateEntityTimestamps: Database.Statement;
    insertContradiction: Database.Statement;
    getContradictionsByEntity: Database.Statement;
    getAllContradictions: Database.Statement;
    resolveContradiction: Database.Statement;
    insertAccessLog: Database.Statement;
    incrementAccess: Database.Statement;
    upsertEmbedding: Database.Statement;
    getEmbedding: Database.Statement;
    getAllEmbeddings: Database.Statement;
    getUnembeddedObservations: Database.Statement;
  };

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? homedirDataDir();
    ensureDir(this.dataDir);
    const databasePath = path.join(this.dataDir, 'memory.db');
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');
    this.initializeSchema();
    this.statements = this.prepareStatements();
  }

  private initializeSchema(): void {
    runMigrations(this.db);
    this.db.exec(SCHEMA_SQL);
    this.ensureDefaultExportTargets();
  }

  private ensureDefaultExportTargets(): void {
    try {
      const defaultPath = path.join(os.homedir(), '.amneshia', 'export', 'MEMORY.md');
      const check1 = this.db.prepare('SELECT count(*) as count FROM export_targets WHERE name = ? OR path = ?').get('Memory Default', defaultPath) as {
        count: number;
      };
      if (check1.count === 0) {
        this.db
          .prepare('INSERT OR IGNORE INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)')
          .run(uuid(), 'Memory Default', defaultPath, 'markdown', 1);
      }

      const projectPath = path.join(process.cwd(), 'MEMORY.md');
      const check2 = this.db.prepare('SELECT count(*) as count FROM export_targets WHERE name = ? OR path = ?').get('Amneshia Project', projectPath) as {
        count: number;
      };
      if (check2.count === 0) {
        this.db
          .prepare('INSERT OR IGNORE INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)')
          .run(uuid(), 'Amneshia Project', projectPath, 'markdown', 1);
      }
    } catch (e) {
      console.error('Failed to configure default export targets:', e);
    }
  }

  private prepareStatements(): DatabaseLayer['statements'] {
    return {
      createEntity: this.db.prepare(
        'INSERT INTO entities (id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ),
      getEntityByName: this.db.prepare(
        'SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE name = ? COLLATE NOCASE LIMIT 1'
      ),
      getEntityById: this.db.prepare(
        'SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE id = ? LIMIT 1'
      ),
      deleteEntity: this.db.prepare('DELETE FROM entities WHERE id = ?'),
      insertObservation: this.db.prepare(
        'INSERT INTO observations (id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ),
      getObservationsByEntity: this.db.prepare(
        'SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? ORDER BY created_at ASC'
      ),
      getActiveObservationsByEntity: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? AND status = 'active' ORDER BY created_at ASC"
      ),
      getObservationById: this.db.prepare(
        'SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE id = ? LIMIT 1'
      ),
      updateObservation: this.db.prepare(
        'UPDATE observations SET content = ?, authority_tier = ?, status = ?, updated_at = ? WHERE id = ?'
      ),
      setObservationStatus: this.db.prepare('UPDATE observations SET status = ?, updated_at = ? WHERE id = ?'),
      deleteObservation: this.db.prepare('DELETE FROM observations WHERE id = ?'),
      createRelation: this.db.prepare(
        'INSERT OR IGNORE INTO relations (id, from_entity, to_entity, relation_type, created_at) VALUES (?, ?, ?, ?, ?)'
      ),
      getRelationsByEntity: this.db.prepare(
        `SELECT r.id, r.from_entity, fe.name AS from_entity_name, r.to_entity, te.name AS to_entity_name, r.relation_type, r.created_at
         FROM relations r
         JOIN entities fe ON fe.id = r.from_entity
         JOIN entities te ON te.id = r.to_entity
         WHERE r.from_entity = ? OR r.to_entity = ?
         ORDER BY r.created_at ASC`
      ),
      deleteRelation: this.db.prepare('DELETE FROM relations WHERE id = ?'),
      deleteFtsObservation: this.db.prepare('DELETE FROM memory_fts WHERE observation_id = ?'),
      insertFtsObservation: this.db.prepare(
        'INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id) VALUES (?, ?, ?, ?, ?)'
      ),
      insertFtsEntity: this.db.prepare(
        'INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id) VALUES (?, ?, ?, ?, ?)'
      ),
      searchFts: this.db.prepare(
        'SELECT entity_id, observation_id, observation_content, rank FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rank LIMIT ?'
      ),
      readGraphEntities: this.db.prepare(
        'SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE (? IS NULL OR domain = ?) AND (? IS NULL OR entity_type = ?) ORDER BY name ASC'
      ),
      readGraphObservations: this.db.prepare(
        'SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? ORDER BY created_at ASC'
      ),
      readGraphRelations: this.db.prepare(
        `SELECT r.id, r.from_entity, fe.name AS from_entity_name, r.to_entity, te.name AS to_entity_name, r.relation_type, r.created_at
         FROM relations r
         JOIN entities fe ON fe.id = r.from_entity
         JOIN entities te ON te.id = r.to_entity
         WHERE r.from_entity = ? OR r.to_entity = ?
         ORDER BY r.created_at ASC`
      ),
      openNodesEntities: this.db.prepare(
        'SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE name IN (SELECT value FROM json_each(?)) ORDER BY name ASC'
      ),
      openNodesObservations: this.db.prepare(
        'SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id IN (SELECT id FROM entities WHERE name IN (SELECT value FROM json_each(?))) ORDER BY created_at ASC'
      ),
      openNodesRelations: this.db.prepare(
        `SELECT r.id, r.from_entity, fe.name AS from_entity_name, r.to_entity, te.name AS to_entity_name, r.relation_type, r.created_at
         FROM relations r
         JOIN entities fe ON fe.id = r.from_entity
         JOIN entities te ON te.id = r.to_entity
         WHERE r.from_entity IN (SELECT id FROM entities WHERE name IN (SELECT value FROM json_each(?)))
            OR r.to_entity IN (SELECT id FROM entities WHERE name IN (SELECT value FROM json_each(?)))
         ORDER BY r.created_at ASC`
      ),
      countEntities: this.db.prepare('SELECT COUNT(*) AS value FROM entities'),
      countObservations: this.db.prepare('SELECT COUNT(*) AS value FROM observations'),
      countRelations: this.db.prepare('SELECT COUNT(*) AS value FROM relations'),
      countExportTargets: this.db.prepare('SELECT COUNT(*) AS value FROM export_targets'),
      countContradictions: this.db.prepare('SELECT COUNT(*) AS value FROM contradiction_log WHERE resolution IS NULL'),
      entitiesByType: this.db.prepare(
        'SELECT entity_type AS key, COUNT(*) AS value FROM entities GROUP BY entity_type ORDER BY entity_type ASC'
      ),
      entitiesByDomain: this.db.prepare(
        'SELECT domain AS key, COUNT(*) AS value FROM entities GROUP BY domain ORDER BY domain ASC'
      ),
      observationsByTier: this.db.prepare(
        'SELECT authority_tier AS key, COUNT(*) AS value FROM observations GROUP BY authority_tier ORDER BY authority_tier ASC'
      ),
      observationsByStatus: this.db.prepare(
        'SELECT status AS key, COUNT(*) AS value FROM observations GROUP BY status ORDER BY status ASC'
      ),
      recentActivity: this.db.prepare(
        `SELECT 'observation' AS type, content, created_at
         FROM observations
         UNION ALL
         SELECT 'entity' AS type, name AS content, created_at
         FROM entities
         ORDER BY created_at DESC
         LIMIT 10`
      ),
      cleanupExpired: this.db.prepare(
        "DELETE FROM observations WHERE expires_at IS NOT NULL AND expires_at <= ? AND (authority_tier = 'ephemeral' OR importance = 'ephemeral')"
      ),
      gcObservations: this.db.prepare(
        "DELETE FROM observations WHERE status IN ('decayed', 'invalidated')"
      ),
      getExportTargets: this.db.prepare('SELECT id, name, path, format, auto_export FROM export_targets ORDER BY name ASC'),
      addExportTarget: this.db.prepare(
        'INSERT INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)'
      ),
      removeExportTarget: this.db.prepare('DELETE FROM export_targets WHERE id = ?'),
      observationHistory: this.db.prepare(
        'INSERT INTO observation_history (id, observation_id, old_content, new_content, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)'
      ),
      updateEntityTimestamps: this.db.prepare('UPDATE entities SET updated_at = ? WHERE id = ?'),
      insertContradiction: this.db.prepare(
        'INSERT INTO contradiction_log (id, observation_id, conflicting_observation_id, entity_id, reason, resolution, detected_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ),
      getContradictionsByEntity: this.db.prepare(
        'SELECT id, observation_id, conflicting_observation_id, entity_id, reason, resolution, detected_at, resolved_at FROM contradiction_log WHERE entity_id = ? ORDER BY detected_at DESC'
      ),
      getAllContradictions: this.db.prepare(
        'SELECT id, observation_id, conflicting_observation_id, entity_id, reason, resolution, detected_at, resolved_at FROM contradiction_log ORDER BY detected_at DESC LIMIT ?'
      ),
      resolveContradiction: this.db.prepare(
        'UPDATE contradiction_log SET resolution = ?, resolved_at = ? WHERE id = ?'
      ),
      insertAccessLog: this.db.prepare('INSERT INTO access_log (id, entity_id, observation_id, accessed_at) VALUES (?, ?, ?, ?)'),
      incrementAccess: this.db.prepare(
        'UPDATE observations SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?'
      ),
      upsertEmbedding: this.db.prepare(
        'INSERT OR REPLACE INTO observation_embeddings (observation_id, dimensions, vector, model, created_at) VALUES (?, ?, ?, ?, ?)'
      ),
      getEmbedding: this.db.prepare(
        'SELECT vector, dimensions, model FROM observation_embeddings WHERE observation_id = ?'
      ),
      getAllEmbeddings: this.db.prepare(
        'SELECT oe.observation_id, oe.vector, o.entity_id, o.content, o.status, o.authority_tier FROM observation_embeddings oe JOIN observations o ON oe.observation_id = o.id WHERE oe.model = ?'
      ),
      getUnembeddedObservations: this.db.prepare(
        "SELECT o.id, o.entity_id, o.content FROM observations o LEFT JOIN observation_embeddings oe ON o.id = oe.observation_id AND oe.model = ? WHERE oe.observation_id IS NULL AND o.status != 'invalidated' AND o.status != 'decayed'"
      ),
    };
  }

  private getEntityRowByName(name: string): EntityRow | undefined {
    return this.statements.getEntityByName.get(name) as EntityRow | undefined;
  }

  private getEntityRowById(id: string): EntityRow | undefined {
    return this.statements.getEntityById.get(id) as EntityRow | undefined;
  }

  private getObservationRowById(id: string): ObservationRow | undefined {
    return this.statements.getObservationById.get(id) as ObservationRow | undefined;
  }

  createEntity(input: CreateEntityInput): Entity {
    const now = nowIso();
    const entity: Entity = {
      id: uuid(),
      name: input.name.trim(),
      entityType: input.entityType.trim(),
      domain: (input.domain ?? 'personal').trim(),
      visibility: (input.visibility ?? 'public').trim(),
      allowedAgents: input.allowedAgents ?? [],
      createdAt: now,
      updatedAt: now,
    };

    this.statements.createEntity.run(
      entity.id,
      entity.name,
      entity.entityType,
      entity.domain,
      entity.visibility,
      normalizeArray(entity.allowedAgents),
      entity.createdAt,
      entity.updatedAt
    );

    this.statements.insertFtsEntity.run(entity.name, entity.entityType, `${entity.name} ${entity.entityType}`, null, entity.id);
    return entity;
  }

  getEntityByName(name: string): Entity | null {
    const row = this.getEntityRowByName(name);
    return row ? toEntity(row) : null;
  }

  getEntityById(id: string): Entity | null {
    const row = this.getEntityRowById(id);
    return row ? toEntity(row) : null;
  }

  deleteEntity(id: string): boolean {
    const result = this.statements.deleteEntity.run(id);
    return result.changes > 0;
  }

  addObservation(
    entityId: string,
    content: string,
    source?: string,
    importance: string = 'normal',
    confidence: number = 1,
    expiresAt?: string,
    authorityTier: AuthorityTier = 'contextual',
    derivedFrom: string[] = []
  ): Observation {
    const now = nowIso();
    const observation: Observation = {
      id: uuid(),
      entityId,
      content,
      source: source ?? null,
      importance,
      confidence,
      authorityTier,
      derivedFrom,
      accessCount: 0,
      lastAccessedAt: null,
      status: 'active',
      expiresAt: expiresAt ?? null,
      supersedes: null,
      createdAt: now,
      updatedAt: now,
    };

    this.statements.insertObservation.run(
      observation.id,
      observation.entityId,
      observation.content,
      observation.source,
      observation.importance,
      observation.confidence,
      observation.authorityTier,
      JSON.stringify(observation.derivedFrom),
      observation.accessCount,
      observation.lastAccessedAt,
      observation.status,
      observation.expiresAt,
      observation.supersedes,
      observation.createdAt,
      observation.updatedAt
    );
    return observation;
  }

  getObservationsByEntity(entityId: string, activeOnly = false): Observation[] {
    const stmt = activeOnly ? this.statements.getActiveObservationsByEntity : this.statements.getObservationsByEntity;
    return (stmt.all(entityId) as ObservationRow[]).map(toObservation);
  }

  getObservationById(id: string): Observation | null {
    const row = this.getObservationRowById(id);
    return row ? toObservation(row) : null;
  }

  updateObservation(
    id: string,
    newContent: string,
    changedBy?: string,
    authorityTier?: AuthorityTier,
    status?: ObservationStatus
  ): Observation {
    const existing = this.getObservationRowById(id);
    if (!existing) {
      throw new Error(`Observation not found: ${id}`);
    }

    const now = nowIso();
    const finalTier = authorityTier ?? (existing.authority_tier as AuthorityTier) ?? 'contextual';
    const finalStatus = status ?? (existing.status as ObservationStatus) ?? 'active';

    this.db.transaction(() => {
      this.statements.observationHistory.run(uuid(), id, existing.content, newContent, changedBy ?? null, now);
      this.statements.updateObservation.run(newContent, finalTier, finalStatus, now, id);
    })();

    const updated = this.getObservationRowById(id);
    if (!updated) {
      throw new Error(`Observation update failed: ${id}`);
    }
    return toObservation(updated);
  }

  setObservationStatus(id: string, status: ObservationStatus): boolean {
    const now = nowIso();
    const result = this.statements.setObservationStatus.run(status, now, id);
    return result.changes > 0;
  }

  setSupersedes(id: string, supersedingId: string, changedBy?: string): void {
    const existing = this.getObservationRowById(id);
    if (!existing) {
      throw new Error(`Observation not found: ${id}`);
    }
    const now = nowIso();
    this.db.transaction(() => {
      this.statements.observationHistory.run(uuid(), id, existing.content, existing.content, changedBy ?? null, now);
      this.db
        .prepare("UPDATE observations SET supersedes = ?, status = 'superseded', updated_at = ? WHERE id = ?")
        .run(supersedingId, now, id);
    })();
  }

  deleteObservation(id: string): boolean {
    const result = this.statements.deleteObservation.run(id);
    return result.changes > 0;
  }

  createRelation(fromId: string, toId: string, relationType: string): Relation {
    const relation: Relation = {
      id: uuid(),
      fromEntity: fromId,
      toEntity: toId,
      relationType,
      createdAt: nowIso(),
    };
    this.statements.createRelation.run(relation.id, relation.fromEntity, relation.toEntity, relation.relationType, relation.createdAt);
    return relation;
  }

  getRelationsByEntity(entityId: string): RelationWithNames[] {
    return (
      this.statements.getRelationsByEntity.all(entityId, entityId) as Array<
        RelationRow & { from_entity_name: string; to_entity_name: string }
      >
    ).map(toRelationWithNames);
  }

  deleteRelation(id: string): boolean {
    const result = this.statements.deleteRelation.run(id);
    return result.changes > 0;
  }

  // --- Truth Maintenance & Provenance Helpers ---

  getDependentObservations(observationId: string): Observation[] {
    // Find observations where derived_from JSON array contains observationId
    const rows = this.db
      .prepare(
        "SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE derived_from LIKE ? AND status = 'active'"
      )
      .all(`%${observationId}%`) as ObservationRow[];

    return rows.map(toObservation).filter((obs) => obs.derivedFrom.includes(observationId));
  }

  cascadeInvalidate(observationId: string): { invalidatedIds: string[]; staleIds: string[] } {
    const staleIds: string[] = [];
    const queue: string[] = [observationId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const dependents = this.getDependentObservations(currentId);
      for (const dep of dependents) {
        if (!visited.has(dep.id)) {
          this.setObservationStatus(dep.id, 'stale');
          staleIds.push(dep.id);
          queue.push(dep.id);
        }
      }
    }

    return { invalidatedIds: [observationId], staleIds };
  }

  // --- Contradiction Log Helpers ---

  recordContradiction(
    observationId: string,
    conflictingObservationId: string,
    entityId: string,
    reason: string
  ): ContradictionLogEntry {
    const entry: ContradictionLogEntry = {
      id: uuid(),
      observationId,
      conflictingObservationId,
      entityId,
      reason,
      resolution: null,
      detectedAt: nowIso(),
      resolvedAt: null,
    };

    this.statements.insertContradiction.run(
      entry.id,
      entry.observationId,
      entry.conflictingObservationId,
      entry.entityId,
      entry.reason,
      entry.resolution,
      entry.detectedAt,
      entry.resolvedAt
    );
    return entry;
  }

  getContradictions(entityId?: string, limit = 50): ContradictionLogEntry[] {
    const rows = entityId
      ? (this.statements.getContradictionsByEntity.all(entityId) as ContradictionLogRow[])
      : (this.statements.getAllContradictions.all(limit) as ContradictionLogRow[]);

    return rows.map((r) => ({
      id: r.id,
      observationId: r.observation_id,
      conflictingObservationId: r.conflicting_observation_id,
      entityId: r.entity_id,
      reason: r.reason,
      resolution: r.resolution as ContradictionLogEntry['resolution'],
      detectedAt: r.detected_at,
      resolvedAt: r.resolved_at,
    }));
  }

  resolveContradiction(id: string, resolution: 'override' | 'kept_both' | 'rejected'): boolean {
    const now = nowIso();
    const result = this.statements.resolveContradiction.run(resolution, now, id);
    return result.changes > 0;
  }

  // --- Access Tracking ---

  recordAccess(entityId: string, observationId?: string | null): void {
    const now = nowIso();
    this.statements.insertAccessLog.run(uuid(), entityId, observationId ?? null, now);
    if (observationId) {
      this.statements.incrementAccess.run(now, observationId);
    }
  }

  // --- Search & Retrieval ---

  searchFTS(query: string, limit = 20, includeInactive = false): SearchResult[] {
    try {
      const sanitized = sanitizeFtsQuery(query);
      if (sanitized === '""') return [];
      const rows = this.statements.searchFts.all(sanitized, limit) as FtsSearchRow[];
      const matches = new Map<string, SearchMatch>();

      for (const row of rows) {
        const entityRow = this.getEntityRowById(row.entity_id);
        if (!entityRow) continue;
        const entity = toEntity(entityRow);
        const observations = row.observation_id
          ? this.getObservationsByEntity(row.entity_id)
              .filter((obs) => obs.id === row.observation_id)
              .filter((obs) => includeInactive || (obs.status !== 'invalidated' && obs.status !== 'decayed'))
          : [];

        // If observation was filtered out due to status, skip
        if (row.observation_id && observations.length === 0) {
          continue;
        }

        const existing = matches.get(entity.id);
        if (existing) {
          if (row.observation_content && !existing.observations.some((obs) => obs.id === row.observation_id)) {
            existing.observations.push(...observations);
          }
          continue;
        }
        matches.set(entity.id, {
          entity,
          observations,
          matchedContent: row.observation_content,
          rank: row.rank,
        });
      }

      return [...matches.values()].map((match) => ({
        entity: match.entity,
        observations: match.observations,
        matchedContent: match.matchedContent,
        rank: match.rank,
      }));
    } catch (err) {
      console.warn('FTS5 search query error:', err);
      return [];
    }
  }

  searchFTSRelevant(query: string, limit = 20, includeInactive = false): SearchResult[] {
    const cleaned = stripStopWords(query);
    return this.searchFTS(cleaned, limit, includeInactive);
  }

  saveObservationEmbedding(observationId: string, vector: Float32Array, model = LocalOnnxEmbedder.DEFAULT_MODEL): void {
    const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
    this.statements.upsertEmbedding.run(observationId, vector.length, buffer, model, nowIso());
  }

  getObservationEmbedding(observationId: string): Float32Array | null {
    const row = this.statements.getEmbedding.get(observationId) as { vector: Buffer; dimensions: number } | undefined;
    if (!row) return null;
    return new Float32Array(row.vector.buffer, row.vector.byteOffset, row.dimensions);
  }

  getUnembeddedObservations(model = LocalOnnxEmbedder.DEFAULT_MODEL): { id: string; entity_id: string; content: string }[] {
    return this.statements.getUnembeddedObservations.all(model) as { id: string; entity_id: string; content: string }[];
  }

  clearEmbeddings(model?: string): void {
    if (model) {
      this.db.prepare('DELETE FROM observation_embeddings WHERE model = ?').run(model);
    } else {
      this.db.prepare('DELETE FROM observation_embeddings').run();
    }
  }

  searchVector(
    queryVector: Float32Array,
    limit = 20,
    model = LocalOnnxEmbedder.DEFAULT_MODEL,
    minSimilarity = 0.25
  ): { entity: Entity; observations: Observation[]; matchedContent: string; similarity: number }[] {
    interface EmbeddingRow {
      observation_id: string;
      entity_id: string;
      vector: Buffer;
      content: string;
      status: string;
      authority_tier: string;
    }

    const rows = this.statements.getAllEmbeddings.all(model) as EmbeddingRow[];
    const scored: { row: EmbeddingRow; similarity: number }[] = [];

    const dim = queryVector.length;
    for (const r of rows) {
      if (r.status === 'invalidated' || r.status === 'decayed') continue;
      const v = new Float32Array(r.vector.buffer, r.vector.byteOffset, dim);
      let dot = 0;
      for (let i = 0; i < dim; i++) {
        dot += queryVector[i] * v[i];
      }
      if (dot >= minSimilarity) {
        scored.push({ row: r, similarity: dot });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    const topScored = scored.slice(0, limit);

    const results: { entity: Entity; observations: Observation[]; matchedContent: string; similarity: number }[] = [];

    for (const item of topScored) {
      const entityRow = this.getEntityRowById(item.row.entity_id);
      if (!entityRow) continue;
      const entity = toEntity(entityRow);
      const obs = this.getObservationsByEntity(entity.id).filter((o) => o.id === item.row.observation_id);

      results.push({
        entity,
        observations: obs,
        matchedContent: item.row.content,
        similarity: item.similarity,
      });
    }

    return results;
  }

  async searchHybrid(
    query: string,
    options?: { limit?: number; domain?: string; minSimilarity?: number; embedder?: LocalOnnxEmbedder }
  ): Promise<SearchResult[]> {
    const limit = options?.limit || 20;
    const lexicalResults = this.searchFTSRelevant(query, limit * 2);

    try {
      const embedder = options?.embedder ?? new LocalOnnxEmbedder();
      const queryVector = await embedder.embed(query);
      const semanticResults = this.searchVector(queryVector, limit * 2, embedder.getModelName(), options?.minSimilarity ?? 0.2);

      let fused = fuseRRF(lexicalResults, semanticResults, { limit, k: 60 });
      if (options?.domain) {
        fused = fused.filter((r) => r.entity.domain === options.domain);
      }
      return fused.slice(0, limit);
    } catch {
      // Fallback seamlessly to lexical FTS5 results if embedding inference is unavailable
      if (options?.domain) {
        return lexicalResults.filter((r) => r.entity.domain === options.domain).slice(0, limit);
      }
      return lexicalResults.slice(0, limit);
    }
  }

  readGraph(domain?: string, entityType?: string, statusFilter?: ObservationStatus): GraphSnapshot {
    const rows = this.statements.readGraphEntities.all(domain ?? null, domain ?? null, entityType ?? null, entityType ?? null) as EntityRow[];
    const entities = rows.map((row) => {
      const entity = toEntity(row);
      let observations = this.getObservationsByEntity(entity.id);
      if (statusFilter) {
        observations = observations.filter((obs) => obs.status === statusFilter);
      }
      const relations = this.getRelationsByEntity(entity.id);
      return { ...entity, observations, relations };
    });
    return { entities };
  }

  openNodes(names: string[]): GraphSnapshot {
    if (names.length === 0) {
      return { entities: [] };
    }
    const payload = JSON.stringify(names);
    const entityRows = this.statements.openNodesEntities.all(payload) as EntityRow[];
    const entityMap = new Map<string, Entity>();
    for (const row of entityRows) {
      entityMap.set(row.id, toEntity(row));
    }
    const entities = [...entityMap.values()].map((entity) => ({
      ...entity,
      observations: this.getObservationsByEntity(entity.id),
      relations: this.getRelationsByEntity(entity.id),
    }));
    return { entities };
  }

  getStats(): MemoryStats {
    const entitiesByTypeRows = this.statements.entitiesByType.all() as GroupCountRow[];
    const entitiesByDomainRows = this.statements.entitiesByDomain.all() as GroupCountRow[];
    const observationsByTierRows = this.statements.observationsByTier.all() as GroupCountRow[];
    const observationsByStatusRows = this.statements.observationsByStatus.all() as GroupCountRow[];
    const recentActivityRows = this.statements.recentActivity.all() as RecentActivityRow[];
    const contradictionCount = (this.statements.countContradictions.get() as StatsRow).value;

    return {
      totalEntities: (this.statements.countEntities.get() as StatsRow).value,
      totalObservations: (this.statements.countObservations.get() as StatsRow).value,
      totalRelations: (this.statements.countRelations.get() as StatsRow).value,
      totalExportTargets: (this.statements.countExportTargets.get() as StatsRow).value,
      totalContradictions: contradictionCount,
      entitiesByType: Object.fromEntries(entitiesByTypeRows.map((row) => [row.key, row.value])),
      entitiesByDomain: Object.fromEntries(entitiesByDomainRows.map((row) => [row.key, row.value])),
      observationsByTier: Object.fromEntries(observationsByTierRows.map((row) => [row.key, row.value])),
      observationsByStatus: Object.fromEntries(observationsByStatusRows.map((row) => [row.key, row.value])),
      recentActivity: recentActivityRows.map((row) => ({ type: row.type, content: row.content, createdAt: row.created_at })),
    };
  }

  cleanupExpired(): number {
    const now = nowIso();
    const result = this.statements.cleanupExpired.run(now);
    return result.changes;
  }

  gc(): number {
    const result = this.statements.gcObservations.run();
    return result.changes;
  }

  getExportTargets(): ExportTarget[] {
    return (this.statements.getExportTargets.all() as ExportTargetRow[]).map(toExportTarget);
  }

  addExportTarget(name: string, targetPath: string, format = 'markdown', autoExport = 1): ExportTarget {
    const target: ExportTarget = {
      id: uuid(),
      name,
      path: targetPath,
      format,
      autoExport: autoExport === 1,
    };
    this.statements.addExportTarget.run(target.id, target.name, target.path, target.format, autoExport);
    return target;
  }

  removeExportTarget(id: string): boolean {
    const result = this.statements.removeExportTarget.run(id);
    return result.changes > 0;
  }

  updateExportTarget(id: string, autoExport: boolean): boolean {
    const result = this.db.prepare('UPDATE export_targets SET auto_export = ? WHERE id = ?').run(autoExport ? 1 : 0, id);
    return result.changes > 0;
  }

  listObservationHistory(observationId: string): ObservationHistory[] {
    const rows = this.db
      .prepare(
        'SELECT id, observation_id, old_content, new_content, changed_by, changed_at FROM observation_history WHERE observation_id = ? ORDER BY changed_at ASC'
      )
      .all(observationId) as ObservationHistoryRow[];
    return rows.map((row) => ({
      id: row.id,
      observationId: row.observation_id,
      oldContent: row.old_content,
      newContent: row.new_content,
      changedBy: row.changed_by,
      changedAt: row.changed_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}

/** Alias for DatabaseLayer */
export const AmneshiaDatabase = DatabaseLayer;
/** Type alias for DatabaseLayer */
export type AmneshiaDatabase = DatabaseLayer;
