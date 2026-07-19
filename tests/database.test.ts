import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseLayer } from '../src/database.js';
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
  });

  it('should perform entity CRUD operations', () => {
    const entity = db.createEntity({
      name: 'John Doe',
      entityType: 'person',
      domain: 'personal',
      visibility: 'public',
      allowedAgents: ['agent1']
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
      domain: 'personal'
    });

    const obs1 = db.addObservation(entity.id, 'Likes tea', 'manual', 'normal');
    expect(obs1.content).toBe('Likes tea');

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

    const obs1Details = db.getObservationsByEntity(entity.id).find(o => o.id === obs1.id);
    expect(obs1Details?.supersedes).toBe(obs2.id);

    const ephemeralObs = db.addObservation(
      entity.id,
      'Temporary secret',
      'manual',
      'ephemeral',
      1,
      new Date(Date.now() - 1000).toISOString()
    );

    const cleaned = db.cleanupExpired();
    expect(cleaned).toBe(1);

    const observationsAfterCleanup = db.getObservationsByEntity(entity.id);
    expect(observationsAfterCleanup.some(o => o.id === ephemeralObs.id)).toBe(false);
  });

  it('should search using FTS5 BM25 search', () => {
    const entity1 = db.createEntity({
      name: 'Alice Smith',
      entityType: 'person',
      domain: 'work'
    });

    const entity2 = db.createEntity({
      name: 'Bob Jones',
      entityType: 'person',
      domain: 'personal'
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
});
