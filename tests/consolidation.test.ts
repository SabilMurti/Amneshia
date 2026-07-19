import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseLayer } from '../src/database.js';
import { KnowledgeGraph } from '../src/graph.js';
import { consolidateMemories } from '../src/consolidation/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Memory Consolidation Tests', () => {
  let db: DatabaseLayer;
  let graph: KnowledgeGraph;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `amneshia-test-consolidation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
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

  it('should clean up expired observations and perform Jaccard-based near-duplicate deduplication', async () => {
    const [entity] = graph.createEntities([{ name: 'Sabil Murti', entityType: 'person', domain: 'personal' }]);

    // 1. Add expired ephemeral observation
    await graph.addObservations([
      {
        entityName: 'Sabil Murti',
        contents: ['This is ephemeral memory that should be cleaned up'],
        source: 'test',
        importance: 'ephemeral',
        expiresAt: new Date(Date.now() - 2000).toISOString()
      }
    ]);

    // 2. Add near duplicate observations (Jaccard similarity >= 0.8)
    await graph.addObservations([
      {
        entityName: 'Sabil Murti',
        contents: [
          'Sabil likes playing acoustic guitars',
          'Sabil likes playing acoustic guitars.' // extra dot, extremely similar
        ],
        source: 'test'
      }
    ]);

    // Verify both observations are active before consolidation
    const activeObsBefore = db.getObservationsByEntity(entity.id);
    expect(activeObsBefore.length).toBe(3);

    // 3. Consolidate memories
    const result = await consolidateMemories(graph, db);

    expect(result.purgedCount).toBe(1); // 1 ephemeral expired
    expect(result.supersededCount).toBe(1); // 1 duplicate superseded

    // Verify observations status after consolidation
    const activeObsAfter = db.getObservationsByEntity(entity.id);
    // 1 expired is deleted, 1 older duplicate is superseded. So 1 remaining active.
    const nonSuperseded = activeObsAfter.filter(o => !o.supersedes);
    expect(nonSuperseded.length).toBe(1);
  });
});
