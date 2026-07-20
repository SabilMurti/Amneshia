import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import type {
  AddObservationInput,
  BridgeServer,
  CreateEntityInput,
  Entity,
  ExportTarget,
  GraphSnapshot,
  MemoryStats,
  Observation,
  ObservationHistory,
  Relation,
  RelationWithNames,
  SearchResult,
} from './types.js';

interface FtsSearchRow {
  entity_id: string;
  observation_id: string | null;
  observation_content: string;
  rank: number;
}

interface BridgeServerRow {
  id: string;
  name: string;
  command: string;
  args: string;
  enabled: number;
  created_at: string;
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

interface EntityWithObservedName {
  entity: Entity;
  allowedAgents: string[];
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
    // ignore malformed storage; return empty to avoid crashes
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

function isExpired(observation: ObservationRow): boolean {
  return observation.expires_at !== null && new Date(observation.expires_at).getTime() <= Date.now();
}

function normalizeArray(value: string[] | undefined): string {
  return JSON.stringify(value ?? []);
}

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
    getObservationById: Database.Statement;
    updateObservation: Database.Statement;
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
    entitiesByType: Database.Statement;
    entitiesByDomain: Database.Statement;
    recentActivity: Database.Statement;
    cleanupExpired: Database.Statement;
    getExportTargets: Database.Statement;
    addExportTarget: Database.Statement;
    removeExportTarget: Database.Statement;
    observationHistory: Database.Statement;
    updateEntityTimestamps: Database.Statement;
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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT 'personal',
        visibility TEXT NOT NULL DEFAULT 'public',
        allowed_agents TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bridge_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        args TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        source TEXT,
        importance TEXT NOT NULL,
        confidence REAL NOT NULL,
        expires_at TEXT,
        supersedes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (supersedes) REFERENCES observations(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        from_entity TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        to_entity TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(from_entity, to_entity, relation_type)
      );

      CREATE TABLE IF NOT EXISTS observation_history (
        id TEXT PRIMARY KEY,
        observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
        old_content TEXT NOT NULL,
        new_content TEXT NOT NULL,
        changed_by TEXT,
        changed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS export_targets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL,
        format TEXT NOT NULL DEFAULT 'markdown',
        auto_export INTEGER NOT NULL DEFAULT 0
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        entity_name,
        entity_type,
        observation_content,
        observation_id UNINDEXED,
        entity_id UNINDEXED,
        tokenize = 'porter unicode61'
      );
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
        INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
        SELECT e.name, e.entity_type, NEW.content, NEW.id, NEW.entity_id
        FROM entities e
        WHERE e.id = NEW.entity_id;
      END;

      CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
        DELETE FROM memory_fts WHERE observation_id = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
        DELETE FROM memory_fts WHERE observation_id = OLD.id;
        INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
        SELECT e.name, e.entity_type, NEW.content, NEW.id, NEW.entity_id
        FROM entities e
        WHERE e.id = NEW.entity_id;
      END;

      CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
        INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
        VALUES (NEW.name, NEW.entity_type, NEW.name || ' ' || NEW.entity_type, NULL, NEW.id);
      END;

      CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
        DELETE FROM memory_fts WHERE observation_id IS NULL AND entity_id = OLD.id;
        INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
        VALUES (NEW.name, NEW.entity_type, NEW.name || ' ' || NEW.entity_type, NULL, NEW.id);
        UPDATE observations SET updated_at = updated_at WHERE entity_id = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
        DELETE FROM memory_fts WHERE entity_id = OLD.id;
      END;
    `);

    try { this.db.exec("ALTER TABLE export_targets ADD COLUMN format TEXT DEFAULT 'markdown';"); } catch {}
    try { this.db.exec("ALTER TABLE export_targets ADD COLUMN auto_export INTEGER DEFAULT 0;"); } catch {}

    try {
      this.db.prepare("DELETE FROM export_targets WHERE path = ?").run('/home/Memory.md');
      
      const check1 = this.db.prepare("SELECT count(*) as count FROM export_targets WHERE path = ?").get('/home/murtix/.amneshia/export/MEMORY.md') as { count: number };
      if (check1.count === 0) {
        this.db.prepare("INSERT INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)")
          .run(uuid(), 'Memory Default', '/home/murtix/.amneshia/export/MEMORY.md', 'markdown', 1);
      } else {
        this.db.prepare("UPDATE export_targets SET auto_export = 1 WHERE path = ?").run('/home/murtix/.amneshia/export/MEMORY.md');
      }

      const check2 = this.db.prepare("SELECT count(*) as count FROM export_targets WHERE path = ?").get('/home/murtix/projects/Amneshia/MEMORY.md') as { count: number };
      if (check2.count === 0) {
        this.db.prepare("INSERT INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)")
          .run(uuid(), 'Amneshia Project', '/home/murtix/projects/Amneshia/MEMORY.md', 'markdown', 1);
      } else {
        this.db.prepare("UPDATE export_targets SET auto_export = 1 WHERE path = ?").run('/home/murtix/projects/Amneshia/MEMORY.md');
      }
    } catch (e) {
      console.error('Failed to clean up / migrate export targets:', e);
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
        'INSERT INTO observations (id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ),
      getObservationsByEntity: this.db.prepare(
        'SELECT id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? ORDER BY created_at ASC'
      ),
      getObservationById: this.db.prepare(
        'SELECT id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at FROM observations WHERE id = ? LIMIT 1'
      ),
      updateObservation: this.db.prepare('UPDATE observations SET content = ?, updated_at = ? WHERE id = ?'),
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
        'SELECT id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? ORDER BY created_at ASC'
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
        'SELECT id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id IN (SELECT id FROM entities WHERE name IN (SELECT value FROM json_each(?))) ORDER BY created_at ASC'
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
      entitiesByType: this.db.prepare('SELECT entity_type AS key, COUNT(*) AS value FROM entities GROUP BY entity_type ORDER BY entity_type ASC'),
      entitiesByDomain: this.db.prepare('SELECT domain AS key, COUNT(*) AS value FROM entities GROUP BY domain ORDER BY domain ASC'),
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
        'DELETE FROM observations WHERE expires_at IS NOT NULL AND expires_at <= ? AND importance = ?'
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
    expiresAt?: string
  ): Observation {
    const now = nowIso();
    const observation: Observation = {
      id: uuid(),
      entityId,
      content,
      source: source ?? null,
      importance,
      confidence,
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
      observation.expiresAt,
      observation.supersedes,
      observation.createdAt,
      observation.updatedAt
    );
    return observation;
  }

  getObservationsByEntity(entityId: string): Observation[] {
    return (this.statements.getObservationsByEntity.all(entityId) as ObservationRow[]).map(toObservation);
  }

  updateObservation(id: string, newContent: string, changedBy?: string): Observation {
    const existing = this.getObservationRowById(id);
    if (!existing) {
      throw new Error(`Observation not found: ${id}`);
    }

    const now = nowIso();
    this.db.transaction(() => {
      this.statements.observationHistory.run(uuid(), id, existing.content, newContent, changedBy ?? null, now);
      this.statements.updateObservation.run(newContent, now, id);
    })();

    const updated = this.getObservationRowById(id);
    if (!updated) {
      throw new Error(`Observation update failed: ${id}`);
    }
    return toObservation(updated);
  }

  setSupersedes(id: string, supersedingId: string, changedBy?: string): void {
    const existing = this.getObservationRowById(id);
    if (!existing) {
      throw new Error(`Observation not found: ${id}`);
    }
    const now = nowIso();
    this.db.transaction(() => {
      this.statements.observationHistory.run(
        uuid(),
        id,
        existing.content,
        existing.content,
        changedBy ?? null,
        now
      );
      this.db.prepare('UPDATE observations SET supersedes = ?, updated_at = ? WHERE id = ?')
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
    return (this.statements.getRelationsByEntity.all(entityId, entityId) as Array<RelationRow & { from_entity_name: string; to_entity_name: string }>).map(
      toRelationWithNames
    );
  }

  deleteRelation(id: string): boolean {
    const result = this.statements.deleteRelation.run(id);
    return result.changes > 0;
  }

  searchFTS(query: string, limit = 20): SearchResult[] {
    try {
      const sanitized = sanitizeFtsQuery(query);
      if (sanitized === '""') return [];
      const rows = this.statements.searchFts.all(sanitized, limit) as FtsSearchRow[];
      const matches = new Map<string, SearchMatch>();

      for (const row of rows) {
        const entityRow = this.getEntityRowById(row.entity_id);
        if (!entityRow) continue;
        const entity = toEntity(entityRow);
        const observations = row.observation_id ? this.getObservationsByEntity(row.entity_id).filter((obs) => obs.id === row.observation_id) : [];
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

  readGraph(domain?: string, entityType?: string): GraphSnapshot {
    const rows = this.statements.readGraphEntities.all(domain ?? null, domain ?? null, entityType ?? null, entityType ?? null) as EntityRow[];
    const entities = rows.map((row) => {
      const entity = toEntity(row);
      const observations = this.getObservationsByEntity(entity.id);
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
    const entityMap = new Map<string, EntityWithObservedName>();
    for (const row of entityRows) {
      entityMap.set(row.id, { entity: toEntity(row), allowedAgents: toAllowedAgents(row.allowed_agents) });
    }
    const entities = [...entityMap.values()].map(({ entity }) => ({
      ...entity,
      observations: this.getObservationsByEntity(entity.id),
      relations: this.getRelationsByEntity(entity.id),
    }));
    return { entities };
  }

  getStats(): MemoryStats {
    const entitiesByTypeRows = this.statements.entitiesByType.all() as GroupCountRow[];
    const entitiesByDomainRows = this.statements.entitiesByDomain.all() as GroupCountRow[];
    const recentActivityRows = this.statements.recentActivity.all() as RecentActivityRow[];
    return {
      totalEntities: (this.statements.countEntities.get() as StatsRow).value,
      totalObservations: (this.statements.countObservations.get() as StatsRow).value,
      totalRelations: (this.statements.countRelations.get() as StatsRow).value,
      totalExportTargets: (this.statements.countExportTargets.get() as StatsRow).value,
      entitiesByType: Object.fromEntries(entitiesByTypeRows.map((row) => [row.key, row.value])),
      entitiesByDomain: Object.fromEntries(entitiesByDomainRows.map((row) => [row.key, row.value])),
      recentActivity: recentActivityRows.map((row) => ({ type: row.type, content: row.content, createdAt: row.created_at })),
    };
  }

  cleanupExpired(): number {
    const now = nowIso();
    const result = this.statements.cleanupExpired.run(now, 'ephemeral');
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

  getBridgeServers(): BridgeServer[] {
    const rows = this.db.prepare('SELECT * FROM bridge_servers').all() as BridgeServerRow[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      command: row.command,
      args: JSON.parse(row.args) as string[],
      enabled: row.enabled === 1,
      createdAt: row.created_at
    }));
  }

  getBridgeServerById(id: string): BridgeServer | null {
    const row = this.db.prepare('SELECT * FROM bridge_servers WHERE id = ?').get(id) as BridgeServerRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      command: row.command,
      args: JSON.parse(row.args) as string[],
      enabled: row.enabled === 1,
      createdAt: row.created_at
    };
  }

  addBridgeServer(name: string, command: string, args: string[]): BridgeServer {
    const id = uuid();
    const createdAt = nowIso();
    this.db.prepare('INSERT INTO bridge_servers (id, name, command, args, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(
      id, name, command, JSON.stringify(args), createdAt
    );
    return { id, name, command, args, enabled: true, createdAt };
  }

  removeBridgeServer(id: string): boolean {
    const result = this.db.prepare('DELETE FROM bridge_servers WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

export const AmneshiaDatabase = DatabaseLayer;
export type AmneshiaDatabase = DatabaseLayer;

