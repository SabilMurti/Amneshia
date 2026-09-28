import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseLayer } from '../src/database.js';
import { KnowledgeGraph } from '../src/graph.js';
import {
  runMaintenance,
  findDuplicates,
  computeDecayScore,
  evaluateDecay,
  applyDecay,
  detectRuleBasedContradiction,
  cascadeInvalidate,
} from '../src/maintenance/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Memory Consolidation Tests', () => {
  let db: DatabaseLayer;
  let graph: KnowledgeGraph;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(
      os.tmpdir(),
      `amneshia-test-consolidation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    );
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
    const [entity] = graph.createEntities([{ name: 'Test User', entityType: 'person', domain: 'personal' }]);

    // 1. Add expired ephemeral observation
    await graph.addObservations([
      {
        entityName: 'Test User',
        contents: ['This is ephemeral memory that should be cleaned up'],
        source: 'test',
        importance: 'ephemeral',
        authorityTier: 'ephemeral',
        expiresAt: new Date(Date.now() - 2000).toISOString(),
      },
    ]);

    // 2. Add near duplicate observations (Jaccard similarity >= 0.8)
    await graph.addObservations([
      {
        entityName: 'Test User',
        contents: [
          'User likes playing acoustic guitars',
          'User likes playing acoustic guitars.', // extra dot, extremely similar
        ],
        source: 'test',
      },
    ]);

    const activeObsBefore = db.getObservationsByEntity(entity.id);
    expect(activeObsBefore.length).toBe(3);

    // 3. Consolidate memories via deterministic maintenance
    const result = runMaintenance(graph, db);

    expect(result.purgedCount).toBe(1); // 1 ephemeral expired
    expect(result.supersededCount).toBe(1); // 1 duplicate superseded

    const activeObsAfter = db.getObservationsByEntity(entity.id);
    const nonSuperseded = activeObsAfter.filter((o) => !o.supersedes && o.status === 'active');
    expect(nonSuperseded.length).toBe(1);
  });

  it('should never deduplicate across different authority tiers', () => {
    const invariantObs = {
      id: 'o1',
      entityId: 'e1',
      content: 'Production database uses Postgres',
      authorityTier: 'invariant' as const,
      derivedFrom: [],
      accessCount: 1,
      lastAccessedAt: null,
      status: 'active' as const,
      confidence: 1,
      source: null,
      importance: 'high',
      expiresAt: null,
      supersedes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const ephemeralObs = {
      id: 'o2',
      entityId: 'e1',
      content: 'Production database uses Postgres',
      authorityTier: 'ephemeral' as const,
      derivedFrom: [],
      accessCount: 1,
      lastAccessedAt: null,
      status: 'active' as const,
      confidence: 1,
      source: null,
      importance: 'low',
      expiresAt: null,
      supersedes: null,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    // Even though content is 100% identical, tiers are different
    const dups = findDuplicates([invariantObs, ephemeralObs]);
    expect(dups.length).toBe(0);
  });

  it('should compute decay scores and flag inactive contextual observations as decayed', () => {
    const now = Date.now();
    const hundredDaysAgo = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString();

    const staleContextual = {
      id: 'obs-stale',
      entityId: 'e1',
      content: 'Old context fact from 100 days ago with zero access',
      authorityTier: 'contextual' as const,
      derivedFrom: [],
      accessCount: 0,
      lastAccessedAt: hundredDaysAgo,
      status: 'active' as const,
      confidence: 1,
      source: null,
      importance: 'normal',
      expiresAt: null,
      supersedes: null,
      createdAt: hundredDaysAgo,
      updatedAt: hundredDaysAgo,
    };

    const score = computeDecayScore(staleContextual, now);
    expect(score).toBe(0.0); // Past 90 days limit

    const evalResult = evaluateDecay([staleContextual], 0.1, now);
    expect(evalResult.decayed.length).toBe(1);
    expect(evalResult.decayed[0].id).toBe('obs-stale');
  });

  it('should detect polar contradictions using rule-based detection', () => {
    const existing = [
      {
        id: 'obs-pg',
        entityId: 'e1',
        content: 'We use PostgreSQL for our primary application database',
        authorityTier: 'architectural' as const,
        derivedFrom: [],
        accessCount: 1,
        lastAccessedAt: null,
        status: 'active' as const,
        confidence: 1,
        source: null,
        importance: 'normal',
        expiresAt: null,
        supersedes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Contradiction with negation pattern
    const check1 = detectRuleBasedContradiction(
      'We do not use PostgreSQL for our primary application database',
      existing
    );
    expect(check1.hasContradiction).toBe(true);
    expect(check1.conflictingObservation?.id).toBe('obs-pg');

    // Replacement pattern
    const check2 = detectRuleBasedContradiction(
      'We use MySQL instead of PostgreSQL',
      existing
    );
    expect(check2.hasContradiction).toBe(true);
  });

  it('should cascade invalidation to derived observations', () => {
    const entity = db.createEntity({ name: 'Service Config', entityType: 'service' });
    const obsBase = db.addObservation(entity.id, 'Main host is api.internal', undefined, 'normal', 1, undefined, 'architectural');
    const obsDerived = db.addObservation(
      entity.id,
      'SSL cert generated for api.internal',
      undefined,
      'normal',
      1,
      undefined,
      'contextual',
      [obsBase.id]
    );

    const cascade = cascadeInvalidate(obsBase.id, db);
    expect(cascade.staleIds).toContain(obsDerived.id);

    const updated = db.getObservationById(obsDerived.id);
    expect(updated?.status).toBe('stale');
  });
});
