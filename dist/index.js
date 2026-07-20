#!/usr/bin/env node

// src/index.ts
import os2 from "os";
import path4 from "path";
import fs3 from "fs";
import { spawn } from "child_process";
import { Command } from "commander";

// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

// src/database.ts
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function uuid() {
  return crypto.randomUUID();
}
function homedirDataDir() {
  return path.join(os.homedir(), ".amneshia");
}
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function toAllowedAgents(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return parsed;
    }
  } catch {
  }
  return [];
}
function toEntity(row) {
  return {
    id: row.id,
    name: row.name,
    entityType: row.entity_type,
    domain: row.domain,
    visibility: row.visibility,
    allowedAgents: toAllowedAgents(row.allowed_agents),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function toObservation(row) {
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
    updatedAt: row.updated_at
  };
}
function toRelationWithNames(row) {
  return {
    id: row.id,
    fromEntity: row.from_entity,
    fromEntityName: row.from_entity_name,
    toEntity: row.to_entity,
    toEntityName: row.to_entity_name,
    relationType: row.relation_type,
    createdAt: row.created_at
  };
}
function toExportTarget(row) {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    format: row.format,
    autoExport: row.auto_export === 1
  };
}
function sanitizeFtsQuery(query) {
  const tokens = query.trim().split(/\s+/).map((token) => token.replace(/["'`]/g, " ").replace(/[\-+<>~*():]/g, " ")).flatMap((token) => token.split(/\s+/)).map((token) => token.trim()).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return '""';
  }
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" OR ");
}
function normalizeArray(value) {
  return JSON.stringify(value ?? []);
}
var DatabaseLayer = class {
  db;
  dataDir;
  statements;
  constructor(dataDir) {
    this.dataDir = dataDir ?? homedirDataDir();
    ensureDir(this.dataDir);
    const databasePath = path.join(this.dataDir, "memory.db");
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("synchronous = NORMAL");
    this.initializeSchema();
    this.statements = this.prepareStatements();
  }
  initializeSchema() {
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
    try {
      this.db.exec("ALTER TABLE export_targets ADD COLUMN format TEXT DEFAULT 'markdown';");
    } catch {
    }
    try {
      this.db.exec("ALTER TABLE export_targets ADD COLUMN auto_export INTEGER DEFAULT 0;");
    } catch {
    }
    try {
      this.db.prepare("DELETE FROM export_targets WHERE path = ?").run("/home/Memory.md");
      const check1 = this.db.prepare("SELECT count(*) as count FROM export_targets WHERE path = ?").get("/home/murtix/.amneshia/export/MEMORY.md");
      if (check1.count === 0) {
        this.db.prepare("INSERT INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)").run(uuid(), "Memory Default", "/home/murtix/.amneshia/export/MEMORY.md", "markdown", 1);
      } else {
        this.db.prepare("UPDATE export_targets SET auto_export = 1 WHERE path = ?").run("/home/murtix/.amneshia/export/MEMORY.md");
      }
      const check2 = this.db.prepare("SELECT count(*) as count FROM export_targets WHERE path = ?").get("/home/murtix/projects/Amneshia/MEMORY.md");
      if (check2.count === 0) {
        this.db.prepare("INSERT INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)").run(uuid(), "Amneshia Project", "/home/murtix/projects/Amneshia/MEMORY.md", "markdown", 1);
      } else {
        this.db.prepare("UPDATE export_targets SET auto_export = 1 WHERE path = ?").run("/home/murtix/projects/Amneshia/MEMORY.md");
      }
    } catch (e) {
      console.error("Failed to clean up / migrate export targets:", e);
    }
  }
  prepareStatements() {
    return {
      createEntity: this.db.prepare(
        "INSERT INTO entities (id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ),
      getEntityByName: this.db.prepare(
        "SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE name = ? COLLATE NOCASE LIMIT 1"
      ),
      getEntityById: this.db.prepare(
        "SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE id = ? LIMIT 1"
      ),
      deleteEntity: this.db.prepare("DELETE FROM entities WHERE id = ?"),
      insertObservation: this.db.prepare(
        "INSERT INTO observations (id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ),
      getObservationsByEntity: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? ORDER BY created_at ASC"
      ),
      getObservationById: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at FROM observations WHERE id = ? LIMIT 1"
      ),
      updateObservation: this.db.prepare("UPDATE observations SET content = ?, updated_at = ? WHERE id = ?"),
      deleteObservation: this.db.prepare("DELETE FROM observations WHERE id = ?"),
      createRelation: this.db.prepare(
        "INSERT OR IGNORE INTO relations (id, from_entity, to_entity, relation_type, created_at) VALUES (?, ?, ?, ?, ?)"
      ),
      getRelationsByEntity: this.db.prepare(
        `SELECT r.id, r.from_entity, fe.name AS from_entity_name, r.to_entity, te.name AS to_entity_name, r.relation_type, r.created_at
         FROM relations r
         JOIN entities fe ON fe.id = r.from_entity
         JOIN entities te ON te.id = r.to_entity
         WHERE r.from_entity = ? OR r.to_entity = ?
         ORDER BY r.created_at ASC`
      ),
      deleteRelation: this.db.prepare("DELETE FROM relations WHERE id = ?"),
      deleteFtsObservation: this.db.prepare("DELETE FROM memory_fts WHERE observation_id = ?"),
      insertFtsObservation: this.db.prepare(
        "INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id) VALUES (?, ?, ?, ?, ?)"
      ),
      insertFtsEntity: this.db.prepare(
        "INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id) VALUES (?, ?, ?, ?, ?)"
      ),
      searchFts: this.db.prepare(
        "SELECT entity_id, observation_id, observation_content, rank FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rank LIMIT ?"
      ),
      readGraphEntities: this.db.prepare(
        "SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE (? IS NULL OR domain = ?) AND (? IS NULL OR entity_type = ?) ORDER BY name ASC"
      ),
      readGraphObservations: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? ORDER BY created_at ASC"
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
        "SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE name IN (SELECT value FROM json_each(?)) ORDER BY name ASC"
      ),
      openNodesObservations: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id IN (SELECT id FROM entities WHERE name IN (SELECT value FROM json_each(?))) ORDER BY created_at ASC"
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
      countEntities: this.db.prepare("SELECT COUNT(*) AS value FROM entities"),
      countObservations: this.db.prepare("SELECT COUNT(*) AS value FROM observations"),
      countRelations: this.db.prepare("SELECT COUNT(*) AS value FROM relations"),
      countExportTargets: this.db.prepare("SELECT COUNT(*) AS value FROM export_targets"),
      entitiesByType: this.db.prepare("SELECT entity_type AS key, COUNT(*) AS value FROM entities GROUP BY entity_type ORDER BY entity_type ASC"),
      entitiesByDomain: this.db.prepare("SELECT domain AS key, COUNT(*) AS value FROM entities GROUP BY domain ORDER BY domain ASC"),
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
        "DELETE FROM observations WHERE expires_at IS NOT NULL AND expires_at <= ? AND importance = ?"
      ),
      getExportTargets: this.db.prepare("SELECT id, name, path, format, auto_export FROM export_targets ORDER BY name ASC"),
      addExportTarget: this.db.prepare(
        "INSERT INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)"
      ),
      removeExportTarget: this.db.prepare("DELETE FROM export_targets WHERE id = ?"),
      observationHistory: this.db.prepare(
        "INSERT INTO observation_history (id, observation_id, old_content, new_content, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
      ),
      updateEntityTimestamps: this.db.prepare("UPDATE entities SET updated_at = ? WHERE id = ?")
    };
  }
  getEntityRowByName(name) {
    return this.statements.getEntityByName.get(name);
  }
  getEntityRowById(id) {
    return this.statements.getEntityById.get(id);
  }
  getObservationRowById(id) {
    return this.statements.getObservationById.get(id);
  }
  createEntity(input) {
    const now = nowIso();
    const entity = {
      id: uuid(),
      name: input.name.trim(),
      entityType: input.entityType.trim(),
      domain: (input.domain ?? "personal").trim(),
      visibility: (input.visibility ?? "public").trim(),
      allowedAgents: input.allowedAgents ?? [],
      createdAt: now,
      updatedAt: now
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
  getEntityByName(name) {
    const row = this.getEntityRowByName(name);
    return row ? toEntity(row) : null;
  }
  getEntityById(id) {
    const row = this.getEntityRowById(id);
    return row ? toEntity(row) : null;
  }
  deleteEntity(id) {
    const result = this.statements.deleteEntity.run(id);
    return result.changes > 0;
  }
  addObservation(entityId, content, source, importance = "normal", confidence = 1, expiresAt) {
    const now = nowIso();
    const observation = {
      id: uuid(),
      entityId,
      content,
      source: source ?? null,
      importance,
      confidence,
      expiresAt: expiresAt ?? null,
      supersedes: null,
      createdAt: now,
      updatedAt: now
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
  getObservationsByEntity(entityId) {
    return this.statements.getObservationsByEntity.all(entityId).map(toObservation);
  }
  updateObservation(id, newContent, changedBy) {
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
  setSupersedes(id, supersedingId, changedBy) {
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
      this.db.prepare("UPDATE observations SET supersedes = ?, updated_at = ? WHERE id = ?").run(supersedingId, now, id);
    })();
  }
  deleteObservation(id) {
    const result = this.statements.deleteObservation.run(id);
    return result.changes > 0;
  }
  createRelation(fromId, toId, relationType) {
    const relation = {
      id: uuid(),
      fromEntity: fromId,
      toEntity: toId,
      relationType,
      createdAt: nowIso()
    };
    this.statements.createRelation.run(relation.id, relation.fromEntity, relation.toEntity, relation.relationType, relation.createdAt);
    return relation;
  }
  getRelationsByEntity(entityId) {
    return this.statements.getRelationsByEntity.all(entityId, entityId).map(
      toRelationWithNames
    );
  }
  deleteRelation(id) {
    const result = this.statements.deleteRelation.run(id);
    return result.changes > 0;
  }
  searchFTS(query, limit = 20) {
    try {
      const sanitized = sanitizeFtsQuery(query);
      if (sanitized === '""') return [];
      const rows = this.statements.searchFts.all(sanitized, limit);
      const matches = /* @__PURE__ */ new Map();
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
          rank: row.rank
        });
      }
      return [...matches.values()].map((match) => ({
        entity: match.entity,
        observations: match.observations,
        matchedContent: match.matchedContent,
        rank: match.rank
      }));
    } catch (err) {
      console.warn("FTS5 search query error:", err);
      return [];
    }
  }
  readGraph(domain, entityType) {
    const rows = this.statements.readGraphEntities.all(domain ?? null, domain ?? null, entityType ?? null, entityType ?? null);
    const entities = rows.map((row) => {
      const entity = toEntity(row);
      const observations = this.getObservationsByEntity(entity.id);
      const relations = this.getRelationsByEntity(entity.id);
      return { ...entity, observations, relations };
    });
    return { entities };
  }
  openNodes(names) {
    if (names.length === 0) {
      return { entities: [] };
    }
    const payload = JSON.stringify(names);
    const entityRows = this.statements.openNodesEntities.all(payload);
    const entityMap = /* @__PURE__ */ new Map();
    for (const row of entityRows) {
      entityMap.set(row.id, { entity: toEntity(row), allowedAgents: toAllowedAgents(row.allowed_agents) });
    }
    const entities = [...entityMap.values()].map(({ entity }) => ({
      ...entity,
      observations: this.getObservationsByEntity(entity.id),
      relations: this.getRelationsByEntity(entity.id)
    }));
    return { entities };
  }
  getStats() {
    const entitiesByTypeRows = this.statements.entitiesByType.all();
    const entitiesByDomainRows = this.statements.entitiesByDomain.all();
    const recentActivityRows = this.statements.recentActivity.all();
    return {
      totalEntities: this.statements.countEntities.get().value,
      totalObservations: this.statements.countObservations.get().value,
      totalRelations: this.statements.countRelations.get().value,
      totalExportTargets: this.statements.countExportTargets.get().value,
      entitiesByType: Object.fromEntries(entitiesByTypeRows.map((row) => [row.key, row.value])),
      entitiesByDomain: Object.fromEntries(entitiesByDomainRows.map((row) => [row.key, row.value])),
      recentActivity: recentActivityRows.map((row) => ({ type: row.type, content: row.content, createdAt: row.created_at }))
    };
  }
  cleanupExpired() {
    const now = nowIso();
    const result = this.statements.cleanupExpired.run(now, "ephemeral");
    return result.changes;
  }
  getExportTargets() {
    return this.statements.getExportTargets.all().map(toExportTarget);
  }
  addExportTarget(name, targetPath, format = "markdown", autoExport = 1) {
    const target = {
      id: uuid(),
      name,
      path: targetPath,
      format,
      autoExport: autoExport === 1
    };
    this.statements.addExportTarget.run(target.id, target.name, target.path, target.format, autoExport);
    return target;
  }
  removeExportTarget(id) {
    const result = this.statements.removeExportTarget.run(id);
    return result.changes > 0;
  }
  updateExportTarget(id, autoExport) {
    const result = this.db.prepare("UPDATE export_targets SET auto_export = ? WHERE id = ?").run(autoExport ? 1 : 0, id);
    return result.changes > 0;
  }
  listObservationHistory(observationId) {
    const rows = this.db.prepare(
      "SELECT id, observation_id, old_content, new_content, changed_by, changed_at FROM observation_history WHERE observation_id = ? ORDER BY changed_at ASC"
    ).all(observationId);
    return rows.map((row) => ({
      id: row.id,
      observationId: row.observation_id,
      oldContent: row.old_content,
      newContent: row.new_content,
      changedBy: row.changed_by,
      changedAt: row.changed_at
    }));
  }
  close() {
    this.db.close();
  }
  getBridgeServers() {
    const rows = this.db.prepare("SELECT * FROM bridge_servers").all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      command: row.command,
      args: JSON.parse(row.args),
      enabled: row.enabled === 1,
      createdAt: row.created_at
    }));
  }
  getBridgeServerById(id) {
    const row = this.db.prepare("SELECT * FROM bridge_servers WHERE id = ?").get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      command: row.command,
      args: JSON.parse(row.args),
      enabled: row.enabled === 1,
      createdAt: row.created_at
    };
  }
  addBridgeServer(name, command, args) {
    const id = uuid();
    const createdAt = nowIso();
    this.db.prepare("INSERT INTO bridge_servers (id, name, command, args, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)").run(
      id,
      name,
      command,
      JSON.stringify(args),
      createdAt
    );
    return { id, name, command, args, enabled: true, createdAt };
  }
  removeBridgeServer(id) {
    const result = this.db.prepare("DELETE FROM bridge_servers WHERE id = ?").run(id);
    return result.changes > 0;
  }
};

// src/export/markdown.ts
import fs2 from "fs";
import path2 from "path";
function groupTitle(entityType) {
  const normalized = entityType.trim().toLowerCase();
  if (normalized === "person" || normalized === "people") return "People";
  if (normalized === "tool") return "Tools";
  if (normalized === "project") return "Projects";
  if (normalized === "preference") return "Preferences";
  if (normalized === "skill") return "Skills";
  return "Concepts";
}
function relationSummary(entityName, relations) {
  if (relations.length === 0) return "";
  return relations.map((relation) => {
    const other = relation.fromEntityName === entityName ? relation.toEntityName : relation.fromEntityName;
    return `${relation.relationType} \u2192 ${other}`;
  }).join(", ");
}
function renderMarkdown(snapshot) {
  const lines = [];
  lines.push("# Amneshia Memory Export");
  lines.push(`> Generated at ${(/* @__PURE__ */ new Date()).toISOString()}`);
  lines.push("");
  const grouped = /* @__PURE__ */ new Map();
  for (const entity of snapshot.entities) {
    const key = groupTitle(entity.entityType);
    const current = grouped.get(key) ?? [];
    current.push(entity);
    grouped.set(key, current);
  }
  for (const [title, entities] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`## ${title}`);
    for (const entity of entities) {
      lines.push(`### ${entity.name}`);
      if (entity.observations.length === 0) {
        lines.push("- No observations yet");
      } else {
        for (const observation of entity.observations) {
          lines.push(`- ${observation.content}`);
        }
      }
      if (entity.relations.length > 0) {
        const relationText = relationSummary(entity.name, entity.relations);
        lines.push(`**Relations:** ${relationText}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}
`;
}
function resolveTargetPath(targetPath) {
  if (targetPath.endsWith(".md")) {
    return targetPath;
  }
  return path2.join(targetPath, "MEMORY.md");
}
function exportToMarkdown(graph, forceAll = false) {
  const targets = graph.manageExportTargets({ action: "list" });
  const snapshot = graph.readGraph();
  const markdown = renderMarkdown(snapshot);
  const writes = [];
  for (const target of targets) {
    if (target.format !== "markdown") continue;
    if (!forceAll && !target.autoExport) continue;
    try {
      const outputPath = resolveTargetPath(target.path);
      fs2.mkdirSync(path2.dirname(outputPath), { recursive: true });
      fs2.writeFileSync(outputPath, markdown, "utf8");
      writes.push({ target: target.name, path: outputPath });
    } catch (error) {
      console.warn(`Export target "${target.name}" failed:`, error instanceof Error ? error.message : error);
    }
  }
  return writes;
}

// src/ai/none.ts
var NoOpProvider = class {
  name = "none";
  async synthesize(newContent) {
    return { content: newContent, tags: [] };
  }
  async summarize(observations) {
    return observations.join("\n");
  }
  async deduplicate(observations) {
    return Array.from(new Set(observations));
  }
  async chat(messages) {
    return "";
  }
};

// src/ai/ollama.ts
var OllamaProvider = class {
  name = "ollama";
  url = process.env.AMNESHIA_OLLAMA_URL || "http://localhost:11434/api/chat";
  model = process.env.AMNESHIA_OLLAMA_MODEL || "llama3.2";
  async call(messages) {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, messages, stream: false })
      });
      if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);
      const data = await response.json();
      return data.message.content;
    } catch (e) {
      return "";
    }
  }
  async synthesize(newContent, contextObservations) {
    const prompt = contextObservations ? `Context: ${contextObservations.join("\n")}

New Content: ${newContent}

Synthesize and provide tags.` : newContent;
    const response = await this.call([{ role: "user", content: prompt }]);
    return response ? { content: response, tags: [] } : { content: newContent, tags: [] };
  }
  async summarize(observations) {
    const response = await this.call([{ role: "user", content: `Summarize:
${observations.join("\n")}` }]);
    return response || observations.join("\n");
  }
  async deduplicate(observations) {
    const response = await this.call([{ role: "user", content: `Deduplicate:
${observations.join("\n")}` }]);
    return response ? response.split("\n") : Array.from(new Set(observations));
  }
  async chat(messages) {
    return this.call(messages);
  }
};

// src/ai/openai.ts
var OpenAIProvider = class {
  name = "openai";
  apiKey = process.env.AMNESHIA_OPENAI_API_KEY;
  model = process.env.AMNESHIA_OPENAI_MODEL || "gpt-4o-mini";
  async call(messages) {
    if (!this.apiKey) return "";
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ model: this.model, messages })
      });
      if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (e) {
      return "";
    }
  }
  async synthesize(newContent, contextObservations) {
    const prompt = contextObservations ? `Context: ${contextObservations.join("\n")}

New Content: ${newContent}

Synthesize and provide tags.` : newContent;
    const response = await this.call([{ role: "user", content: prompt }]);
    return response ? { content: response, tags: [] } : { content: newContent, tags: [] };
  }
  async summarize(observations) {
    const response = await this.call([{ role: "user", content: `Summarize:
${observations.join("\n")}` }]);
    return response || observations.join("\n");
  }
  async deduplicate(observations) {
    const response = await this.call([{ role: "user", content: `Deduplicate:
${observations.join("\n")}` }]);
    return response ? response.split("\n") : Array.from(new Set(observations));
  }
  async chat(messages) {
    return this.call(messages);
  }
};

// src/ai/9router.ts
var NineRouterProvider = class {
  name = "9router";
  baseUrl = (process.env.AMNESHIA_NINEROUTER_BASE_URL || process.env.NINEROUTER_BASE_URL || "http://localhost:20128/v1").replace(/\/$/, "");
  apiKey = process.env.AMNESHIA_NINEROUTER_API_KEY || process.env.NINEROUTER_API_KEY || "sk-9router";
  model;
  constructor(model) {
    this.model = model || process.env.AMNESHIA_NINEROUTER_MODEL || process.env.NINEROUTER_MODEL || "9router/ag/gemini-3-flash";
  }
  async call(messages) {
    try {
      const url = `${this.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ model: this.model, messages })
      });
      if (!response.ok) {
        throw new Error(`9router API error: ${response.statusText} (${response.status})`);
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (e) {
      console.warn(`[9router Provider] Request failed: ${e instanceof Error ? e.message : String(e)}`);
      return "";
    }
  }
  async synthesize(newContent, contextObservations) {
    const prompt = contextObservations ? `Context:
${contextObservations.join("\n")}

New Content: ${newContent}

Synthesize into a clear, concise memory statement.` : newContent;
    const response = await this.call([{ role: "user", content: prompt }]);
    return response ? { content: response, tags: [] } : { content: newContent, tags: [] };
  }
  async summarize(observations) {
    const response = await this.call([{ role: "user", content: `Summarize the following memory observations concisely:
${observations.join("\n")}` }]);
    return response || observations.join("\n");
  }
  async deduplicate(observations) {
    const response = await this.call([{ role: "user", content: `Deduplicate the following lines, keeping unique memory statements:
${observations.join("\n")}` }]);
    return response ? response.split("\n").map((s) => s.trim()).filter(Boolean) : Array.from(new Set(observations));
  }
  async chat(messages) {
    return this.call(messages);
  }
};

// src/ai/index.ts
var activeProvider = new NoOpProvider();
function setAIProvider(providerName, modelName) {
  switch (providerName.toLowerCase()) {
    case "9router":
    case "ninerouter":
      activeProvider = new NineRouterProvider(modelName);
      break;
    case "ollama":
      activeProvider = new OllamaProvider();
      break;
    case "openai":
      activeProvider = new OpenAIProvider();
      break;
    default:
      activeProvider = new NoOpProvider();
      break;
  }
  return activeProvider;
}
function getAIProvider() {
  const envProvider = process.env.AMNESHIA_AI_PROVIDER;
  if (envProvider && activeProvider.name === "none") {
    setAIProvider(envProvider);
  }
  return activeProvider;
}
async function synthesizeObservations(observations) {
  const provider = getAIProvider();
  if (provider.name === "none") {
    return observations.join("\n");
  }
  return provider.summarize(observations);
}

// src/graph.ts
var KnowledgeGraph = class {
  constructor(database) {
    this.database = database;
  }
  database;
  createEntities(inputs) {
    const created = [];
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
  createRelations(inputs) {
    const created = [];
    for (const input of inputs) {
      const fromEntity = this.database.getEntityByName(input.from);
      const toEntity2 = this.database.getEntityByName(input.to);
      if (!fromEntity || !toEntity2) {
        continue;
      }
      const rel = this.database.createRelation(fromEntity.id, toEntity2.id, input.relationType);
      created.push({ relation: rel.id });
    }
    this.triggerAutoExport();
    return created;
  }
  async addObservations(inputs) {
    const created = [];
    const provider = getAIProvider();
    for (const input of inputs) {
      const entity = this.database.getEntityByName(input.entityName);
      if (!entity) {
        continue;
      }
      const observationIds = [];
      let contextObservations = [];
      if (provider.name !== "none") {
        contextObservations = this.database.getObservationsByEntity(entity.id).map((o) => o.content);
      }
      for (const content of input.contents) {
        let finalContent = content;
        if (provider.name !== "none") {
          const result = await provider.synthesize(content, contextObservations);
          finalContent = result.content;
          contextObservations.push(finalContent);
        }
        const observation = this.database.addObservation(
          entity.id,
          finalContent,
          input.source,
          input.importance ?? "normal",
          1,
          input.expiresAt
        );
        observationIds.push(observation.id);
      }
      created.push({ entityName: entity.name, observationIds });
    }
    this.triggerAutoExport();
    return created;
  }
  deleteEntities(names) {
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
  deleteObservations(ids) {
    let removed = 0;
    for (const id of ids) {
      if (this.database.deleteObservation(id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }
  deleteRelations(ids) {
    let removed = 0;
    for (const id of ids) {
      if (this.database.deleteRelation(id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }
  updateObservation(input) {
    const updated = this.database.updateObservation(input.observationId, input.newContent, input.changedBy);
    this.triggerAutoExport();
    return updated;
  }
  searchMemory(query, limit = 20, domain) {
    const filtered = this.database.searchFTS(query, limit * 2).filter((result) => domain ? result.entity.domain === domain : true);
    return {
      query,
      limit,
      results: filtered.slice(0, limit)
    };
  }
  readGraph(domain, entityType) {
    return this.database.readGraph(domain, entityType);
  }
  openNodes(names) {
    return this.database.openNodes(names);
  }
  getStats() {
    return this.database.getStats();
  }
  cleanupExpired() {
    return this.database.cleanupExpired();
  }
  exportMemory() {
    const targets = this.database.getExportTargets();
    return { exported: targets.length, targets };
  }
  manageExportTargets(input) {
    if (input.action === "list") {
      return this.database.getExportTargets();
    }
    if (input.action === "add") {
      if (!input.name || !input.path) {
        throw new Error("name and path are required when adding an export target");
      }
      const autoExport = input.autoExport !== false ? 1 : 0;
      return this.database.addExportTarget(input.name, input.path, input.format ?? "markdown", autoExport);
    }
    if (input.action === "remove") {
      if (!input.id) {
        throw new Error("id is required when removing an export target");
      }
      return { removed: this.database.removeExportTarget(input.id) };
    }
    if (input.action === "toggle") {
      if (!input.id) {
        throw new Error("id is required when toggling an export target");
      }
      const targets = this.database.getExportTargets();
      const target = targets.find((t) => t.id === input.id);
      if (!target) {
        throw new Error(`Export target with id ${input.id} not found`);
      }
      const newAutoExport = !target.autoExport;
      this.database.updateExportTarget(input.id, newAutoExport);
      return { id: input.id, autoExport: newAutoExport };
    }
    throw new Error(`Invalid action: ${input.action}`);
  }
  triggerAutoExport() {
    exportToMarkdown(this);
  }
};

// src/bridge/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
var BridgeClientManager = class {
  sessions;
  constructor() {
    this.sessions = /* @__PURE__ */ new Map();
  }
  async connectServer(serverId, command, args) {
    if (this.sessions.has(serverId)) {
      return this.sessions.get(serverId).client;
    }
    try {
      const transport = new StdioClientTransport({ command, args });
      const client = new Client(
        { name: "amneshia-bridge", version: "1.0.0" },
        { capabilities: {} }
      );
      await client.connect(transport);
      this.sessions.set(serverId, { client, transport });
      return client;
    } catch (error) {
      console.error(`Failed to connect to bridge server ${serverId}:`, error);
      throw error;
    }
  }
  async listTools(serverId, command, args) {
    try {
      const client = await this.connectServer(serverId, command, args);
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        serverId,
        serverName: "unknown",
        // Need to resolve server name
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));
    } catch (error) {
      console.error(`Failed to list tools for server ${serverId}:`, error);
      return [];
    }
  }
  async callTool(serverId, command, args, toolName, toolArguments) {
    try {
      const client = await this.connectServer(serverId, command, args);
      const result = await client.callTool({ name: toolName, arguments: toolArguments });
      return result.content;
    } catch (error) {
      console.error(`Failed to call tool ${toolName} on server ${serverId}, attempting reconnect...`, error);
      await this.disconnectServer(serverId);
      try {
        const reconnectedClient = await this.connectServer(serverId, command, args);
        const result = await reconnectedClient.callTool({ name: toolName, arguments: toolArguments });
        return result.content;
      } catch (retryError) {
        console.error(`Retry tool execution failed for ${toolName} on server ${serverId}:`, retryError);
        throw retryError;
      }
    }
  }
  async disconnectServer(serverId) {
    const session = this.sessions.get(serverId);
    if (session) {
      await session.client.close();
      session.transport.close();
      this.sessions.delete(serverId);
    }
  }
  async disconnectAll() {
    for (const serverId of this.sessions.keys()) {
      await this.disconnectServer(serverId);
    }
  }
};

// src/tools/index.ts
import { z as z8 } from "zod";

// src/tools/entities.ts
import { z } from "zod";
var entitySchema = {
  entities: z.array(
    z.object({
      name: z.string().min(1).describe("Unique human-readable entity name"),
      entityType: z.string().min(1).describe("Entity type such as person, tool, project, preference, concept, or skill"),
      domain: z.string().optional().describe("Domain scope such as personal or project:<name>"),
      visibility: z.enum(["public", "restricted", "private"]).optional().describe("Access level for the entity"),
      allowedAgents: z.array(z.string().min(1)).optional().describe("Explicit agent whitelist; empty means all agents")
    })
  ).min(1).describe("Entities to create")
};
function textContent(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerEntityTools(server, graph) {
  server.tool(
    "create_entities",
    "Create one or more entities in the knowledge graph. Use this when introducing a new person, tool, project, preference, concept, or skill that should have its own node and future observations/relations.",
    entitySchema,
    async ({ entities }) => {
      try {
        const created = graph.createEntities(entities);
        return textContent({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : "Failed to create entities" });
      }
    }
  );
  server.tool(
    "delete_entities",
    "Delete entities by name. This removes the entity node and cascades to its attached observations and relations. Use with care when a memory branch is obsolete or incorrect.",
    {
      names: z.array(z.string().min(1)).min(1).describe("Entity names to delete")
    },
    async ({ names }) => {
      try {
        const deleted = graph.deleteEntities(names);
        return textContent({ ok: true, deleted, requested: names.length });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : "Failed to delete entities" });
      }
    }
  );
}

// src/tools/relations.ts
import { z as z2 } from "zod";
var relationSchema = {
  relations: z2.array(
    z2.object({
      from: z2.string().min(1).describe("Source entity name"),
      to: z2.string().min(1).describe("Target entity name"),
      relationType: z2.string().min(1).describe("Relation type such as uses, prefers, works_on, knows, or depends_on")
    })
  ).min(1).describe("Relations to create")
};
function textContent2(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerRelationTools(server, graph) {
  server.tool(
    "create_relations",
    "Create one or more typed edges between existing entities. Use this when you want the graph to capture how people, tools, projects, and concepts connect.",
    relationSchema,
    async ({ relations }) => {
      try {
        const created = graph.createRelations(relations);
        return textContent2({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent2({ ok: false, error: error instanceof Error ? error.message : "Failed to create relations" });
      }
    }
  );
  server.tool(
    "delete_relations",
    "Delete relations by relation ID. Use this to remove stale or incorrect edges without touching the connected entities.",
    {
      ids: z2.array(z2.string().min(1)).min(1).describe("Relation IDs to delete")
    },
    async ({ ids }) => {
      try {
        const deleted = graph.deleteRelations(ids);
        return textContent2({ ok: true, deleted, requested: ids.length });
      } catch (error) {
        return textContent2({ ok: false, error: error instanceof Error ? error.message : "Failed to delete relations" });
      }
    }
  );
}

// src/tools/observations.ts
import { z as z3 } from "zod";
var observationSchema = {
  observations: z3.array(
    z3.object({
      entityName: z3.string().min(1).describe("Entity name to attach the observations to"),
      contents: z3.array(z3.string().min(1)).min(1).describe("Observation texts to add"),
      source: z3.string().optional().describe("Agent or system that supplied the observation"),
      importance: z3.enum(["permanent", "normal", "ephemeral"]).optional().describe("Retention tier for the observation"),
      expiresAt: z3.string().datetime().optional().describe("ISO 8601 expiration timestamp for ephemeral facts")
    })
  ).min(1).describe("Observation batches to store")
};
function textContent3(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerObservationTools(server, graph) {
  server.tool(
    "add_observations",
    "Add one or more observations to existing entities. Use this for facts, notes, corrections, or memory updates that should stay attached to an entity node.",
    observationSchema,
    async ({ observations }) => {
      try {
        const created = await graph.addObservations(observations);
        return textContent3({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent3({ ok: false, error: error instanceof Error ? error.message : "Failed to add observations" });
      }
    }
  );
  server.tool(
    "delete_observations",
    "Delete specific observations by ID. Use this when a fact is stale, incorrect, or superseded and should be removed from the record.",
    {
      ids: z3.array(z3.string().min(1)).min(1).describe("Observation IDs to delete")
    },
    async ({ ids }) => {
      try {
        const deleted = graph.deleteObservations(ids);
        return textContent3({ ok: true, deleted, requested: ids.length });
      } catch (error) {
        return textContent3({ ok: false, error: error instanceof Error ? error.message : "Failed to delete observations" });
      }
    }
  );
  server.tool(
    "update_observation",
    "Replace the text of an existing observation while recording the previous content in history. Use this for corrections rather than delete-and-recreate when you want an audit trail.",
    {
      observationId: z3.string().min(1).describe("Observation ID to update"),
      newContent: z3.string().min(1).describe("Replacement content"),
      changedBy: z3.string().optional().describe("Optional agent or actor making the change")
    },
    async ({ observationId, newContent, changedBy }) => {
      try {
        const updated = graph.updateObservation({ observationId, newContent, changedBy });
        return textContent3({ ok: true, updated });
      } catch (error) {
        return textContent3({ ok: false, error: error instanceof Error ? error.message : "Failed to update observation" });
      }
    }
  );
}

// src/tools/search.ts
import { z as z4 } from "zod";
function textContent4(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerSearchTools(server, graph) {
  server.tool(
    "search_memory",
    "Search the memory graph using SQLite FTS5 with BM25 ranking. Use this when you know part of a name, fact, or observation text and want the most relevant entities and observations.",
    {
      query: z4.string().min(1).describe("Search text to match against entity names, types, and observation content"),
      limit: z4.number().int().positive().max(100).optional().describe("Maximum number of ranked results to return"),
      domain: z4.string().optional().describe("Optional domain filter such as personal or project:<name>")
    },
    async ({ query, limit, domain }) => {
      try {
        const result = graph.searchMemory(query, limit ?? 20, domain);
        return textContent4({ ok: true, ...result });
      } catch (error) {
        return textContent4({ ok: false, error: error instanceof Error ? error.message : "Failed to search memory" });
      }
    }
  );
  server.tool(
    "read_graph",
    "Read the complete knowledge graph or a filtered slice of it. Use this when you need structured entities, their observations, and their relations rather than a ranked search result.",
    {
      domain: z4.string().optional().describe("Optional domain filter such as personal or project:<name>"),
      entityType: z4.string().optional().describe("Optional entity type filter such as person, tool, or project")
    },
    async ({ domain, entityType }) => {
      try {
        const snapshot = graph.readGraph(domain, entityType);
        return textContent4({ ok: true, snapshot });
      } catch (error) {
        return textContent4({ ok: false, error: error instanceof Error ? error.message : "Failed to read graph" });
      }
    }
  );
  server.tool(
    "open_nodes",
    "Open a set of entity names and return each matching node with its full observations and relations. Use this when you already know the entities you want to inspect.",
    {
      names: z4.array(z4.string().min(1)).min(1).describe("Entity names to open")
    },
    async ({ names }) => {
      try {
        const snapshot = graph.openNodes(names);
        return textContent4({ ok: true, snapshot });
      } catch (error) {
        return textContent4({ ok: false, error: error instanceof Error ? error.message : "Failed to open nodes" });
      }
    }
  );
}

// src/tools/lifecycle.ts
import { z as z5 } from "zod";

// src/consolidation/index.ts
function getJaccardSimilarity(s1, s2) {
  const words1 = new Set(s1.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
  const words2 = new Set(s2.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = /* @__PURE__ */ new Set([...words1, ...words2]);
  return intersection.size / union.size;
}
async function consolidateMemories(graph, db, domain) {
  const purgedCount = graph.cleanupExpired();
  const snapshot = graph.readGraph(domain);
  const entities = snapshot.entities;
  let supersededCount = 0;
  let consolidatedCount = 0;
  const supersededList = [];
  const synthesizedList = [];
  const provider = getAIProvider();
  for (const entity of entities) {
    const allObs = db.getObservationsByEntity(entity.id);
    const activeObs = allObs.filter((o) => !o.supersedes && (o.expiresAt === null || new Date(o.expiresAt).getTime() > Date.now()));
    if (activeObs.length < 2) {
      continue;
    }
    let supersededIds = /* @__PURE__ */ new Set();
    if (provider.name !== "none") {
      try {
        const prompt = `You are an AI assistant analyzing a list of observations for the entity "${entity.name}" (Type: "${entity.entityType}", Domain: "${entity.domain}").
Identify any pairs of observations where a newer observation conflicts with or updates/supersedes an older observation.
For example, if an older observation says "lives in Jakarta" and a newer one says "now lives in Bandung", the newer one supersedes the older one.
If an older observation says "likes acoustic guitars" and a newer one says "likes electric guitars instead of acoustic", the newer one supersedes the older one.

Observations:
${activeObs.map((o) => `[ID: ${o.id}] (Created: ${o.createdAt}) ${o.content}`).join("\n")}

Respond STRICTLY with a JSON array of objects, and absolutely nothing else. Each object in the array must look like this:
{ "olderId": "older_observation_uuid", "newerId": "newer_observation_uuid", "reason": "concise description of why newer updates/conflicts with older" }
If no observations conflict or update each other, return an empty array: []`;
        const responseText = await provider.chat([
          { role: "system", content: "You are a precise JSON generator. Output only valid JSON." },
          { role: "user", content: prompt }
        ]);
        const jsonStart = responseText.indexOf("[");
        const jsonEnd = responseText.lastIndexOf("]");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
          const conflicts = JSON.parse(jsonString);
          for (const conf of conflicts) {
            const older = activeObs.find((o) => o.id === conf.olderId);
            const newer = activeObs.find((o) => o.id === conf.newerId);
            if (older && newer && !supersededIds.has(older.id)) {
              db.setSupersedes(older.id, newer.id, "sleep_cycle");
              supersededIds.add(older.id);
              supersededList.push({ oldId: older.id, newId: newer.id, reason: conf.reason });
              supersededCount++;
            }
          }
        }
      } catch (err) {
        console.error(`LLM Conflict resolution failed for entity ${entity.name}:`, err);
      }
    }
    const remainingObs = activeObs.filter((o) => !supersededIds.has(o.id));
    for (let i = 0; i < remainingObs.length; i++) {
      for (let j = i + 1; j < remainingObs.length; j++) {
        const obs1 = remainingObs[i];
        const obs2 = remainingObs[j];
        if (supersededIds.has(obs1.id) || supersededIds.has(obs2.id)) continue;
        const sim = getJaccardSimilarity(obs1.content, obs2.content);
        if (sim >= 0.8 || obs1.content.toLowerCase().trim() === obs2.content.toLowerCase().trim()) {
          const older = new Date(obs1.createdAt).getTime() <= new Date(obs2.createdAt).getTime() ? obs1 : obs2;
          const newer = older === obs1 ? obs2 : obs1;
          db.setSupersedes(older.id, newer.id, "sleep_cycle");
          supersededIds.add(older.id);
          supersededList.push({ oldId: older.id, newId: newer.id, reason: "Duplicate or near-duplicate content" });
          supersededCount++;
        }
      }
    }
    if (provider.name !== "none") {
      const finalActiveObs = activeObs.filter((o) => !supersededIds.has(o.id));
      if (finalActiveObs.length >= 2) {
        try {
          const contents = finalActiveObs.map((o) => o.content);
          const synthesizedSummary = await synthesizeObservations(contents);
          if (synthesizedSummary && synthesizedSummary.trim() !== "" && synthesizedSummary !== contents.join("\n")) {
            const newObs = db.addObservation(
              entity.id,
              synthesizedSummary.trim(),
              "synthesis",
              "high",
              1
            );
            for (const oldObs of finalActiveObs) {
              db.setSupersedes(oldObs.id, newObs.id, "sleep_cycle");
              supersededCount++;
            }
            synthesizedList.push({
              entityId: entity.id,
              newObservationId: newObs.id,
              oldObservationIds: finalActiveObs.map((o) => o.id)
            });
            consolidatedCount++;
          }
        } catch (err) {
          console.error(`LLM Synthesis failed for entity ${entity.name}:`, err);
        }
      }
    }
  }
  return {
    purgedCount,
    supersededCount,
    consolidatedCount,
    details: {
      purged: [],
      superseded: supersededList,
      synthesized: synthesizedList
    }
  };
}

// src/tools/lifecycle.ts
function textContent5(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerLifecycleTools(server, graph, db) {
  server.tool(
    "cleanup_expired",
    "Remove expired ephemeral observations from the database. Use this as a maintenance tool when you want to prune timed memories that have passed their expiry date.",
    {},
    async () => {
      try {
        const removed = graph.cleanupExpired();
        return textContent5({ ok: true, removed });
      } catch (error) {
        return textContent5({ ok: false, error: error instanceof Error ? error.message : "Failed to cleanup expired observations" });
      }
    }
  );
  server.tool(
    "get_stats",
    "Inspect the current memory store health and usage. Use this when you want counts by entity type and domain, recent activity, or to confirm the database is being populated as expected.",
    {},
    async () => {
      try {
        const stats = graph.getStats();
        return textContent5({ ok: true, stats });
      } catch (error) {
        return textContent5({ ok: false, error: error instanceof Error ? error.message : "Failed to get stats" });
      }
    }
  );
  server.tool(
    "consolidate_memory",
    "Proactively consolidate entity observations by resolving conflicts, removing duplicate statements, and synthesizing semantic summaries (if AI provider is active).",
    {
      domain: z5.string().optional().describe("Filter consolidation to a specific domain (e.g. personal, work)")
    },
    async ({ domain }) => {
      try {
        const result = await consolidateMemories(graph, db, domain);
        return textContent5({ ok: true, result });
      } catch (error) {
        return textContent5({ ok: false, error: error instanceof Error ? error.message : "Failed to consolidate memories" });
      }
    }
  );
}

// src/tools/utility.ts
import { z as z6 } from "zod";
function textContent6(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerUtilityTools(server, graph) {
  server.tool(
    "export_memory",
    "Export the entire memory graph to markdown files for every configured export target. Use this to create human-readable snapshots or sync memory to an external file path.",
    {},
    async () => {
      try {
        const writes = exportToMarkdown(graph);
        return textContent6({ ok: true, exported: writes.length, writes });
      } catch (error) {
        return textContent6({ ok: false, error: error instanceof Error ? error.message : "Failed to export memory" });
      }
    }
  );
  server.tool(
    "manage_export_targets",
    "Manage export destinations for markdown snapshots. Use list to inspect targets, add to register a new destination, or remove to delete one by id.",
    {
      action: z6.enum(["list", "add", "remove"]).describe("Action to perform on export targets"),
      name: z6.string().optional().describe("Target name when adding a destination"),
      path: z6.string().optional().describe("Filesystem path when adding a destination"),
      format: z6.enum(["markdown", "json"]).optional().describe("Target format when adding a destination"),
      id: z6.string().optional().describe("Export target id when removing a destination")
    },
    async ({ action, name, path: path5, format, id }) => {
      try {
        const result = graph.manageExportTargets({ action, name, path: path5, format, id });
        return textContent6({ ok: true, result });
      } catch (error) {
        return textContent6({ ok: false, error: error instanceof Error ? error.message : "Failed to manage export targets" });
      }
    }
  );
  server.tool(
    "configure_ai",
    "Configure the AI provider for memory synthesis.",
    {
      provider: z6.enum(["none", "ollama", "openai"]).describe("Active AI provider for memory synthesis")
    },
    async ({ provider }) => {
      try {
        const active = setAIProvider(provider);
        return textContent6({ ok: true, provider: active.name });
      } catch (error) {
        return textContent6({ ok: false, error: error instanceof Error ? error.message : "Failed to configure AI" });
      }
    }
  );
}

// src/tools/bridge.ts
import { z as z7 } from "zod";
function registerBridgeTools(server, _graph, db, bridgeManager) {
  server.tool(
    "manage_bridge_servers",
    "Manage bridge servers",
    {
      action: z7.enum(["list", "add", "remove"]),
      id: z7.string().optional(),
      name: z7.string().optional(),
      command: z7.string().optional(),
      args: z7.array(z7.string()).optional()
    },
    async ({ action, id, name, command, args }) => {
      if (action === "list") {
        const servers = db.getBridgeServers();
        return { content: [{ type: "text", text: JSON.stringify(servers, null, 2) }] };
      }
      if (action === "add") {
        if (!name || !command) return { content: [{ type: "text", text: "Name and command are required" }] };
        const server2 = db.addBridgeServer(name, command, args ?? []);
        return { content: [{ type: "text", text: JSON.stringify(server2, null, 2) }] };
      }
      if (action === "remove") {
        if (!id) return { content: [{ type: "text", text: "ID is required" }] };
        await bridgeManager.disconnectServer(id);
        const removed = db.removeBridgeServer(id);
        return { content: [{ type: "text", text: removed ? "Server removed" : "Server not found" }] };
      }
      return { content: [{ type: "text", text: "Invalid action" }] };
    }
  );
  server.tool(
    "list_bridge_tools",
    "List bridge tools",
    {
      serverId: z7.string().optional().describe("Optional server ID to filter tools")
    },
    async ({ serverId }) => {
      const servers = serverId ? [db.getBridgeServerById(serverId)].filter(Boolean) : db.getBridgeServers();
      const allTools = [];
      for (const server2 of servers) {
        if (!server2) continue;
        const tools = await bridgeManager.listTools(server2.id, server2.command, server2.args);
        allTools.push(...tools);
      }
      return { content: [{ type: "text", text: JSON.stringify(allTools, null, 2) }] };
    }
  );
  server.tool(
    "call_bridge_tool",
    "Call bridge tool",
    {
      serverId: z7.string(),
      toolName: z7.string(),
      arguments: z7.record(z7.unknown()).optional(),
      storeAsMemory: z7.boolean().optional(),
      entityName: z7.string().optional()
    },
    async ({ serverId, toolName, arguments: toolArguments, storeAsMemory, entityName }) => {
      const server2 = db.getBridgeServerById(serverId);
      if (!server2) return { content: [{ type: "text", text: "Server not found" }] };
      const result = await bridgeManager.callTool(server2.id, server2.command, server2.args, toolName, toolArguments);
      if (storeAsMemory) {
        const content = `Result of tool [${toolName}]: ${JSON.stringify(result)}`;
        await _graph.addObservations([{
          entityName: entityName || server2.name,
          contents: [content],
          importance: "normal"
        }]);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}

// src/tools/index.ts
function registerTools(server, graph, db, bridgeManager) {
  registerEntityTools(server, graph);
  registerRelationTools(server, graph);
  registerObservationTools(server, graph);
  registerSearchTools(server, graph);
  registerLifecycleTools(server, graph, db);
  registerUtilityTools(server, graph);
  registerBridgeTools(server, graph, db, bridgeManager);
}

// src/server.ts
import path3 from "path";

// src/bridge/sync.ts
function deriveCleanName(projName, rootPath) {
  const parts = rootPath.split(/[/\\]/);
  const lastPart = parts[parts.length - 1];
  if (lastPart) return lastPart;
  const nameParts = projName.split("-");
  return nameParts[nameParts.length - 1] || projName;
}
function parseListProjectsResponse(raw) {
  if (Array.isArray(raw)) {
    const textBlock = raw.find((item) => item && typeof item === "object" && item.type === "text" && typeof item.text === "string");
    if (textBlock) {
      try {
        const parsed = JSON.parse(textBlock.text);
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse textBlock JSON:", e);
      }
    }
  }
  if (raw && typeof raw === "object") {
    if ("projects" in raw) {
      return raw;
    }
  }
  return {};
}
async function syncBridgeMemories(graph, db, bridgeManager) {
  const servers = db.getBridgeServers();
  const projectsSynced = [];
  let observationsAdded = 0;
  let relationsCreated = 0;
  graph.createEntities([
    { name: "Sabil Murti", entityType: "person", domain: "personal", visibility: "public" },
    { name: "Codebase Memory MCP", entityType: "tool", domain: "tool:codebase-memory-mcp", visibility: "public" }
  ]);
  for (const server of servers) {
    const isCodebaseMemory = server.name === "codebase-memory-mcp" || server.command.includes("codebase-memory-mcp") || server.args.some((arg) => arg.includes("codebase-memory-mcp"));
    if (isCodebaseMemory && server.enabled) {
      try {
        const result = await bridgeManager.callTool(server.id, server.command, server.args, "list_projects");
        const parsed = parseListProjectsResponse(result);
        if (parsed.projects && Array.isArray(parsed.projects)) {
          for (const proj of parsed.projects) {
            const cleanName = deriveCleanName(proj.name, proj.root_path);
            graph.createEntities([{
              name: cleanName,
              entityType: "project",
              domain: "project:" + cleanName.toLowerCase(),
              visibility: "public"
            }]);
            const entity = db.getEntityByName(cleanName);
            if (entity) {
              const existingObs = db.getObservationsByEntity(entity.id);
              const idsToDelete = existingObs.filter((obs) => obs.content.startsWith("[Codebase Memory MCP]")).map((obs) => obs.id);
              if (idsToDelete.length > 0) {
                graph.deleteObservations(idsToDelete);
              }
            }
            const branchName = proj.git?.branch || "main";
            const headSha = proj.git?.head_sha?.slice(0, 7) || "latest";
            const contents = [
              `[Codebase Memory MCP] Root Path: ${proj.root_path}`,
              `[Codebase Memory MCP] Graph Stats: ${proj.nodes ?? 0} nodes, ${proj.edges ?? 0} edges`,
              `[Codebase Memory MCP] Git Branch: ${branchName} (SHA: ${headSha})`,
              `[Codebase Memory MCP] Dashboard URL: http://localhost:9749`
            ];
            await graph.addObservations([{
              entityName: cleanName,
              contents,
              source: "codebase-memory-mcp"
            }]);
            observationsAdded += contents.length;
            const rels = graph.createRelations([
              { from: "Sabil Murti", to: cleanName, relationType: "works_on" },
              { from: cleanName, to: "Codebase Memory MCP", relationType: "indexed_in" }
            ]);
            relationsCreated += rels.length;
            projectsSynced.push(cleanName);
          }
        }
      } catch (error) {
        console.error(`Error syncing codebase-memory-mcp server ${server.name}:`, error);
      }
    }
  }
  return {
    projectsSynced,
    observationsAdded,
    relationsCreated
  };
}

// src/server.ts
import { fileURLToPath } from "url";
async function startServer(options = {}) {
  const db = new DatabaseLayer(options.dataDir);
  const graph = new KnowledgeGraph(db);
  const bridgeManager = new BridgeClientManager();
  const server = new McpServer({ name: "Amneshia", version: "2.0.0" });
  registerTools(server, graph, db, bridgeManager);
  const cleanup = async () => {
    await bridgeManager.disconnectAll();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  if (options.http) {
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json());
    app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-XSS-Protection", "1; mode=block");
      next();
    });
    let transport;
    app.get("/sse", (req, res) => {
      transport = new SSEServerTransport("/messages", res);
      server.connect(transport);
    });
    app.post("/messages", async (req, res) => {
      await transport.handlePostMessage(req, res);
    });
    app.get("/health", (_req, res) => {
      res.json({ status: "ok", name: "amneshia", version: "2.0.0" });
    });
    app.get("/api/graph", (req, res) => res.json(graph.readGraph(req.query.domain)));
    app.get("/api/search", (req, res) => res.json(graph.searchMemory(req.query.q)));
    app.get("/api/stats", (req, res) => res.json(graph.getStats()));
    app.post("/api/entities", (req, res) => res.json(graph.createEntities(req.body.entities)));
    app.delete("/api/entities", (req, res) => res.json(graph.deleteEntities(req.body.names)));
    app.post("/api/observations", async (req, res) => res.json(await graph.addObservations(req.body.observations)));
    app.delete("/api/observations", (req, res) => res.json(graph.deleteObservations(req.body.ids)));
    app.put("/api/observations", (req, res) => res.json(graph.updateObservation(req.body)));
    app.post("/api/relations", (req, res) => res.json(graph.createRelations(req.body.relations)));
    app.delete("/api/relations", (req, res) => res.json(graph.deleteRelations(req.body.ids)));
    app.get("/api/bridge/servers", (req, res) => res.json(db.getBridgeServers()));
    app.post("/api/bridge/servers", (req, res) => res.json(db.addBridgeServer(req.body.name, req.body.command, req.body.args)));
    app.delete("/api/bridge/servers/:id", async (req, res) => {
      await bridgeManager.disconnectServer(req.params.id);
      res.json(db.removeBridgeServer(req.params.id));
    });
    app.get("/api/bridge/tools", async (req, res) => {
      try {
        const serverId = req.query.serverId;
        let command = req.query.command;
        let args = [];
        if (req.query.args) {
          args = Array.isArray(req.query.args) ? req.query.args : [req.query.args];
        }
        if (serverId && !command) {
          const serverObj = db.getBridgeServerById(serverId);
          if (serverObj) {
            command = serverObj.command;
            args = serverObj.args;
          }
        }
        if (!command) {
          res.status(400).json({ error: "Server command not specified and serverId not found" });
          return;
        }
        res.json(await bridgeManager.listTools(serverId || "temp", command, args));
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });
    app.post("/api/bridge/call", async (req, res) => {
      try {
        const { serverId, toolName, arguments: toolArguments, storeAsMemory, entityName } = req.body;
        const serverObj = db.getBridgeServerById(serverId);
        if (!serverObj) {
          res.status(404).json({ error: "Server not found" });
          return;
        }
        const result = await bridgeManager.callTool(serverObj.id, serverObj.command, serverObj.args, toolName, toolArguments);
        if (storeAsMemory) {
          const content = `Result of tool [${toolName}]: ${JSON.stringify(result)}`;
          await graph.addObservations([{
            entityName: entityName || serverObj.name,
            contents: [content]
          }]);
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });
    app.post("/api/bridge/sync", async (req, res) => {
      try {
        const stats = await syncBridgeMemories(graph, db, bridgeManager);
        res.json({ ok: true, stats });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });
    app.get("/api/exports", (req, res) => res.json(db.getExportTargets()));
    app.post("/api/exports", (req, res) => {
      const autoExportVal = req.body.autoExport !== false ? 1 : 0;
      res.json(db.addExportTarget(req.body.name, req.body.path, req.body.format, autoExportVal));
    });
    app.delete("/api/exports/:id", (req, res) => res.json(db.removeExportTarget(req.params.id)));
    app.post("/api/exports/:id/toggle", (req, res) => {
      const targets = db.getExportTargets();
      const target = targets.find((t) => t.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: "Target not found" });
        return;
      }
      const newAutoExport = !target.autoExport;
      db.updateExportTarget(req.params.id, newAutoExport);
      res.json({ id: req.params.id, autoExport: newAutoExport });
    });
    app.post("/api/config/ai", (req, res) => res.json(setAIProvider(req.body.provider, req.body.model)));
    app.post("/api/cleanup", (req, res) => res.json(graph.cleanupExpired()));
    app.post("/api/consolidate", async (req, res, next) => {
      try {
        const result = await consolidateMemories(graph, db, req.body?.domain);
        res.json({ ok: true, result });
      } catch (error) {
        next(error);
      }
    });
    const uiPath = path3.join(path3.dirname(fileURLToPath(import.meta.url)), "../dist-ui");
    app.use(express.static(uiPath));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api") || req.path === "/sse" || req.path === "/messages") return next();
      res.sendFile(path3.join(uiPath, "index.html"));
    });
    const httpListener = app.listen(options.port || 3457, () => {
      console.error(`[Amneshia] HTTP Dashboard running on http://localhost:${options.port || 3457}`);
    });
    httpListener.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`[Amneshia] Port ${options.port || 3457} is already in use by another active instance.`);
      } else {
        console.error(`[Amneshia] Express server error: ${err.message}`);
      }
    });
  }
  if (!process.argv.includes("--daemon")) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Amneshia] MCP Server running on stdio");
  }
}

// src/index.ts
var program = new Command();
program.name("amneshia").description("\u{1F9E0} Unified memory hub for AI agents").version("2.0.0").option("--data-dir <path>", "Custom data directory", path4.join(os2.homedir(), ".amneshia")).option("--http", "Enable HTTP/SSE server mode", true).option("--no-dashboard", "Disable HTTP Web Dashboard server").option("-p, --port <number>", "Port number", parseInt, 3457).option("-d, --daemon", "Run server in background daemon mode", false);
async function main() {
  const options = program.parse(process.argv).opts();
  const isHttpEnabled = options.dashboard !== false && options.http !== false;
  if (options.daemon) {
    if (!isHttpEnabled) {
      console.error("[Amneshia] Error: Daemon mode requires dashboard to be enabled.");
      process.exit(1);
    }
    const logDir = path4.join(os2.homedir(), ".amneshia");
    fs3.mkdirSync(logDir, { recursive: true });
    const logFile = path4.join(logDir, "server.log");
    const out = fs3.openSync(logFile, "a");
    const err = fs3.openSync(logFile, "a");
    const args = process.argv.slice(2).filter((arg) => arg !== "--daemon" && arg !== "-d");
    const child = spawn(process.argv[0], [process.argv[1], ...args], {
      detached: true,
      stdio: ["ignore", out, err]
    });
    child.unref();
    console.log(`[Amneshia] Server launched in background daemon mode (PID: ${child.pid}).`);
    console.log(`[Amneshia] Web Dashboard: http://localhost:${options.port}`);
    console.log(`[Amneshia] Server logs: ${logFile}`);
    process.exit(0);
  }
  await startServer({ dataDir: options.dataDir, http: isHttpEnabled, port: options.port });
}
void main();
