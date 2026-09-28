import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database/index.js';
import { findDuplicates, type DuplicatePair } from './dedup.js';
import { applyDecay } from './decay.js';
import { cascadeInvalidate } from './truth-maintenance.js';
import { checkContradiction, detectRuleBasedContradiction } from './contradiction.js';

export * from './dedup.js';
export * from './decay.js';
export * from './truth-maintenance.js';
export * from './contradiction.js';

export interface MaintenanceResult {
  purgedCount: number;
  decayedCount: number;
  supersededCount: number;
  details?: {
    purged: string[];
    decayed: string[];
    superseded: Array<{ oldId: string; newId: string; reason: string; oldContent?: string; newContent?: string }>;
  };
}

/**
 * 100% Deterministic Memory Maintenance:
 * 1. Purges expired ephemeral items.
 * 2. Applies authority-tier decay.
 * 3. Finds exact & Jaccard near-duplicates within the same authority tier and supersedes older duplicates.
 * Zero external LLM calls, < 5ms execution time.
 */
export function runMaintenance(
  graph: KnowledgeGraph,
  db: DatabaseLayer,
  domain?: string,
  dryRun = false
): MaintenanceResult {
  // Step 1: Purge expired ephemeral observations
  const purgedCount = dryRun ? 0 : graph.cleanupExpired();

  // Step 2: Apply authority-tier value decay
  const decayResult = dryRun
    ? { decayedCount: 0, decayedIds: [] }
    : applyDecay(db);

  // Step 3: Read graph entities
  const snapshot = graph.readGraph(domain);
  const entities = snapshot.entities;

  let supersededCount = 0;
  const supersededList: Array<{
    oldId: string;
    newId: string;
    reason: string;
    oldContent?: string;
    newContent?: string;
  }> = [];

  for (const entity of entities) {
    const activeObs = db.getObservationsByEntity(entity.id, true);
    if (activeObs.length < 2) continue;

    const duplicates = findDuplicates(activeObs);
    for (const dup of duplicates) {
      if (!dryRun) {
        db.setSupersedes(dup.older.id, dup.newer.id, 'maintenance_dedup');
        db.cascadeInvalidate(dup.older.id);
      }

      supersededList.push({
        oldId: dup.older.id,
        newId: dup.newer.id,
        reason: dup.reason,
        oldContent: dup.older.content,
        newContent: dup.newer.content,
      });
      supersededCount++;
    }
  }

  return {
    purgedCount,
    decayedCount: decayResult.decayedCount,
    supersededCount,
    details: {
      purged: [],
      decayed: decayResult.decayedIds,
      superseded: supersededList,
    },
  };
}
