import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseLayer } from '../src/database.js';
import { KnowledgeGraph } from '../src/graph.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('KnowledgeGraph Tests', () => {
  let db: DatabaseLayer;
  let graph: KnowledgeGraph;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `amneshia-test-graph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testDir, { recursive: true });
    db = new DatabaseLayer(testDir);
    graph = new KnowledgeGraph(db);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should create entities, observations, and relations, and query them via readGraph/openNodes', async () => {
    // 1. Create entities
    const entities = graph.createEntities([
      { name: 'Sabil Murti', entityType: 'person', domain: 'personal', visibility: 'public' },
      { name: 'Amneshia', entityType: 'project', domain: 'work', visibility: 'public' }
    ]);
    expect(entities.length).toBe(2);
    expect(entities.some(e => e.name === 'Sabil Murti')).toBe(true);
    expect(entities.some(e => e.name === 'Amneshia')).toBe(true);

    // 2. Add observations
    const obsResults = await graph.addObservations([
      { entityName: 'Sabil Murti', contents: ['Developer of Amneshia', 'Likes playing acoustic guitars'], source: 'manual' },
      { entityName: 'Amneshia', contents: ['Knowledge graph memory hub for AI agents', 'Built with SQLite and FTS5'], source: 'manual' }
    ]);
    expect(obsResults.length).toBe(2);
    expect(obsResults.find(o => o.entityName === 'Sabil Murti')?.observationIds.length).toBe(2);

    // 3. Create relations
    const relations = graph.createRelations([
      { from: 'Sabil Murti', to: 'Amneshia', relationType: 'creator_of' }
    ]);
    expect(relations.length).toBe(1);
    expect(relations[0].relation).toBeDefined();

    // 4. Read graph
    const snapshot = graph.readGraph();
    expect(snapshot.entities.length).toBe(2);
    const sabil = snapshot.entities.find(e => e.name === 'Sabil Murti');
    expect(sabil).toBeDefined();
    expect(sabil!.observations.length).toBe(2);
    expect(sabil!.relations.length).toBe(1);
    expect(sabil!.relations[0].relationType).toBe('creator_of');
    expect(sabil!.relations[0].toEntityName).toBe('Amneshia');

    // 5. Open nodes
    const openSnapshot = graph.openNodes(['Sabil Murti']);
    expect(openSnapshot.entities.length).toBe(1);
    expect(openSnapshot.entities[0].name).toBe('Sabil Murti');
  });

  it('should cleanup expired memories and manage stats', async () => {
    const [alice] = graph.createEntities([{ name: 'Alice', entityType: 'person', domain: 'personal' }]);
    
    await graph.addObservations([
      {
        entityName: 'Alice',
        contents: ['Ephemeral memory content'],
        source: 'manual',
        importance: 'ephemeral',
        expiresAt: new Date(Date.now() - 5000).toISOString()
      }
    ]);

    const statsBefore = graph.getStats();
    expect(statsBefore.totalObservations).toBe(1);

    const purged = graph.cleanupExpired();
    expect(purged).toBe(1);

    const statsAfter = graph.getStats();
    expect(statsAfter.totalObservations).toBe(0);
  });
});
