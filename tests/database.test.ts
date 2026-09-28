import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseLayer } from '../src/database.js';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('DatabaseLayer Tests', () => {
  let db: DatabaseLayer;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `amneshia-test-db-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testDir, { recursive: true });
    db = new DatabaseLayer(testDir);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should initialize schema and verify default tables exist', () => {
    const stats = db.getStats();
    expect(stats.totalEntities).toBe(0);
    expect(stats.totalObservations).toBe(0);
    expect(stats.totalRelations).toBe(0);
    expect(stats.totalContradictions).toBe(0);
  });

  it('should perform entity CRUD operations', () => {
    const entity = db.createEntity({
      name: 'John Doe',
      entityType: 'person',
      domain: 'personal',
      visibility: 'public',
      allowedAgents: ['agent1'],
    });

    expect(entity.name).toBe('John Doe');
    expect(entity.entityType).toBe('person');
    expect(entity.domain).toBe('personal');
    expect(entity.visibility).toBe('public');
    expect(entity.allowedAgents).toEqual(['agent1']);

    const foundByName = db.getEntityByName('John Doe');
    expect(foundByName).not.toBeNull();
    expect(foundByName!.id).toBe(entity.id);

    const foundById = db.getEntityById(entity.id);
    expect(foundById).not.toBeNull();
    expect(foundById!.name).toBe('John Doe');

    const deleted = db.deleteEntity(entity.id);
    expect(deleted).toBe(true);
    expect(db.getEntityById(entity.id)).toBeNull();
  });

  it('should perform observation history, supersession, and cleanup', () => {
    const entity = db.createEntity({
      name: 'Jane Doe',
      entityType: 'person',
      domain: 'personal',
    });

    const obs1 = db.addObservation(entity.id, 'Likes tea', 'manual', 'normal');
    expect(obs1.content).toBe('Likes tea');
    expect(obs1.authorityTier).toBe('contextual');
    expect(obs1.status).toBe('active');

    const historyBefore = db.listObservationHistory(obs1.id);
    expect(historyBefore.length).toBe(0);

    const obsUpdated = db.updateObservation(obs1.id, 'Likes green tea', 'sleep_cycle');
    expect(obsUpdated.content).toBe('Likes green tea');

    const historyAfter = db.listObservationHistory(obs1.id);
    expect(historyAfter.length).toBe(1);
    expect(historyAfter[0].oldContent).toBe('Likes tea');
    expect(historyAfter[0].newContent).toBe('Likes green tea');
    expect(historyAfter[0].changedBy).toBe('sleep_cycle');

    const obs2 = db.addObservation(entity.id, 'Now likes coffee', 'manual', 'normal');
    db.setSupersedes(obs1.id, obs2.id, 'sleep_cycle');

    const obs1Details = db.getObservationsByEntity(entity.id).find((o) => o.id === obs1.id);
    expect(obs1Details?.supersedes).toBe(obs2.id);
    expect(obs1Details?.status).toBe('superseded');

    const ephemeralObs = db.addObservation(
      entity.id,
      'Temporary secret',
      'manual',
      'ephemeral',
      1,
      new Date(Date.now() - 1000).toISOString(),
      'ephemeral'
    );

    const cleaned = db.cleanupExpired();
    expect(cleaned).toBe(1);

    const observationsAfterCleanup = db.getObservationsByEntity(entity.id);
    expect(observationsAfterCleanup.some((o) => o.id === ephemeralObs.id)).toBe(false);
  });

  it('should search using FTS5 BM25 search', () => {
    const entity1 = db.createEntity({
      name: 'Alice Smith',
      entityType: 'person',
      domain: 'work',
    });

    const entity2 = db.createEntity({
      name: 'Bob Jones',
      entityType: 'person',
      domain: 'personal',
    });

    db.addObservation(entity1.id, 'Expert in TypeScript programming language and Vitest testing framework', 'manual');
    db.addObservation(entity2.id, 'Enjoys walking in the forest and watching movies', 'manual');

    const searchResults = db.searchFTS('TypeScript');
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].entity.name).toBe('Alice Smith');
    expect(searchResults[0].matchedContent).toContain('TypeScript');

    const searchResults2 = db.searchFTS('forest');
    expect(searchResults2.length).toBeGreaterThan(0);
    expect(searchResults2[0].entity.name).toBe('Bob Jones');
  });

  it('should support authority tiers and provenance with cascading invalidation', () => {
    const entity = db.createEntity({
      name: 'Database Architecture',
      entityType: 'concept',
      domain: 'tech',
    });

    const baseObs = db.addObservation(
      entity.id,
      'We use PostgreSQL for primary storage',
      'architect',
      'high',
      1,
      undefined,
      'invariant'
    );
    expect(baseObs.authorityTier).toBe('invariant');

    const derivedObs1 = db.addObservation(
      entity.id,
      'Connection pooling configured via PgBouncer',
      'devops',
      'normal',
      1,
      undefined,
      'architectural',
      [baseObs.id]
    );

    const derivedObs2 = db.addObservation(
      entity.id,
      'Pool size configured to 25 connections',
      'devops',
      'normal',
      1,
      undefined,
      'contextual',
      [derivedObs1.id]
    );

    // Verify dependents
    const dependentsOfBase = db.getDependentObservations(baseObs.id);
    expect(dependentsOfBase.map((d) => d.id)).toContain(derivedObs1.id);

    // Invalidate base and cascade
    db.setObservationStatus(baseObs.id, 'invalidated');
    const cascadeResult = db.cascadeInvalidate(baseObs.id);

    expect(cascadeResult.staleIds).toContain(derivedObs1.id);
    expect(cascadeResult.staleIds).toContain(derivedObs2.id);

    const obs1Refetched = db.getObservationById(derivedObs1.id);
    const obs2Refetched = db.getObservationById(derivedObs2.id);
    expect(obs1Refetched?.status).toBe('stale');
    expect(obs2Refetched?.status).toBe('stale');
  });

  it('should track access logs and calculate access count', () => {
    const entity = db.createEntity({
      name: 'System Config',
      entityType: 'service',
      domain: 'infra',
    });

    const obs = db.addObservation(entity.id, 'Server port is 8080');
    expect(obs.accessCount).toBe(0);

    db.recordAccess(entity.id, obs.id);
    db.recordAccess(entity.id, obs.id);

    const updatedObs = db.getObservationById(obs.id);
    expect(updatedObs?.accessCount).toBe(2);
    expect(updatedObs?.lastAccessedAt).not.toBeNull();
  });

  it('should log and resolve contradictions', () => {
    const entity = db.createEntity({
      name: 'API Specs',
      entityType: 'api',
      domain: 'backend',
    });

    const obs1 = db.addObservation(entity.id, 'API uses REST protocol', undefined, 'normal', 1, undefined, 'architectural');
    const obs2 = db.addObservation(entity.id, 'API uses gRPC protocol', undefined, 'normal', 1, undefined, 'architectural');

    const contradiction = db.recordContradiction(obs2.id, obs1.id, entity.id, 'Protocol mismatch: REST vs gRPC');
    expect(contradiction.reason).toBe('Protocol mismatch: REST vs gRPC');
    expect(contradiction.resolution).toBeNull();

    const logged = db.getContradictions(entity.id);
    expect(logged.length).toBe(1);
    expect(logged[0].id).toBe(contradiction.id);

    const resolved = db.resolveContradiction(contradiction.id, 'override');
    expect(resolved).toBe(true);

    const resolvedLog = db.getContradictions(entity.id);
    expect(resolvedLog[0].resolution).toBe('override');
  });

  it('should auto-migrate v2 database schema to v3', () => {
    // Manually create a v2-like database without v3 columns
    const v2Dir = path.join(os.tmpdir(), `amneshia-v2-migration-${Date.now()}`);
    fs.mkdirSync(v2Dir, { recursive: true });
    const rawDb = new Database(path.join(v2Dir, 'memory.db'));

    rawDb.exec(`
      CREATE TABLE entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT 'personal',
        visibility TEXT NOT NULL DEFAULT 'public',
        allowed_agents TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE observations (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT,
        importance TEXT NOT NULL,
        confidence REAL NOT NULL,
        expires_at TEXT,
        supersedes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE bridge_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );

      INSERT INTO entities (id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at)
      VALUES ('e1', 'Old Project', 'project', 'dev', 'public', '[]', '2026-01-01', '2026-01-01');

      INSERT INTO observations (id, entity_id, content, source, importance, confidence, expires_at, supersedes, created_at, updated_at)
      VALUES ('o1', 'e1', 'Old v2 fact', 'user', 'normal', 1.0, NULL, NULL, '2026-01-01', '2026-01-01');
    `);
    rawDb.close();

    // Now open with Amneshia v3 DatabaseLayer
    const migratedDb = new DatabaseLayer(v2Dir);
    const obs = migratedDb.getObservationById('o1');

    expect(obs).not.toBeNull();
    expect(obs?.content).toBe('Old v2 fact');
    expect(obs?.authorityTier).toBe('contextual');
    expect(obs?.status).toBe('active');
    expect(obs?.derivedFrom).toEqual([]);
    expect(obs?.accessCount).toBe(0);

    migratedDb.close();
    fs.rmSync(v2Dir, { recursive: true, force: true });
  });
});
