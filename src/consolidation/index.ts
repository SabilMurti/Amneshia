import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database/index.js';
import { findDuplicates, type DuplicatePair } from './dedup.js';
import { applyDecay } from './decay.js';
import { cascadeInvalidate } from './truth-maintenance.js';
import { checkContradiction, detectRuleBasedContradiction } from './contradiction.js';
import { getAIProvider } from '../ai/index.js';

export * from './dedup.js';
export * from './decay.js';
export * from './truth-maintenance.js';
export * from './contradiction.js';

export interface ConsolidationResult {
  purgedCount: number;
  decayedCount: number;
  supersededCount: number;
  consolidatedCount: number;
  details?: {
    purged: string[];
    decayed: string[];
    superseded: Array<{ oldId: string; newId: string; reason: string; oldContent?: string; newContent?: string }>;
  };
}

export async function consolidateMemories(
  graph: KnowledgeGraph,
  db: DatabaseLayer,
  domain?: string,
  dryRun = false
): Promise<ConsolidationResult> {
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

  const provider = getAIProvider();

  for (const entity of entities) {
    const activeObs = db.getObservationsByEntity(entity.id, true);
    if (activeObs.length < 2) continue;

    const supersededInEntity = new Set<string>();

    // Step 4: Tier-aware Jaccard and exact deduplication
    const duplicates = findDuplicates(activeObs);
    for (const dup of duplicates) {
      if (supersededInEntity.has(dup.older.id)) continue;

      if (!dryRun) {
        db.setSupersedes(dup.older.id, dup.newer.id, 'sleep_cycle');
        // Cascade invalidate any dependents of the superseded observation
        db.cascadeInvalidate(dup.older.id);
      }

      supersededInEntity.add(dup.older.id);
      supersededList.push({
        oldId: dup.older.id,
        newId: dup.newer.id,
        reason: dup.reason,
        oldContent: dup.older.content,
        newContent: dup.newer.content,
      });
      supersededCount++;
    }

    // Step 5: Optional AI-assisted pairwise conflict resolution (non-destructive)
    if (provider.name !== 'none') {
      const remainingObs = activeObs.filter((o) => !supersededInEntity.has(o.id));
      if (remainingObs.length >= 2) {
        try {
          const prompt = `You are an AI analyzing observations for "${entity.name}".
Identify pairs where a newer observation directly updates, replaces, or conflicts with an older observation.
DO NOT synthesize or merge facts into a single summary. Only identify which OLDER fact is superseded by which NEWER fact.

Observations:
${remainingObs.map((o) => `[ID: ${o.id}] (Tier: ${o.authorityTier}) ${o.content}`).join('\n')}

Respond with a JSON array:
[ { "olderId": "...", "newerId": "...", "reason": "..." } ]
If no facts supersede each other, return []`;

          const responseText = await provider.chat([
            { role: 'system', content: 'Output only valid JSON.' },
            { role: 'user', content: prompt },
          ]);

          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const pairs = JSON.parse(jsonMatch[0]) as Array<{ olderId: string; newerId: string; reason: string }>;
            for (const pair of pairs) {
              const older = remainingObs.find((o) => o.id === pair.olderId);
              const newer = remainingObs.find((o) => o.id === pair.newerId);

              // Safety check: Never let a lower-tier fact supersede an 'invariant' fact
              if (older?.authorityTier === 'invariant' && newer?.authorityTier !== 'invariant') {
                continue;
              }

              if (older && newer && !supersededInEntity.has(older.id)) {
                if (!dryRun) {
                  db.setSupersedes(older.id, newer.id, 'sleep_cycle');
                  db.cascadeInvalidate(older.id);
                }
                supersededInEntity.add(older.id);
                supersededList.push({
                  oldId: older.id,
                  newId: newer.id,
                  reason: pair.reason,
                  oldContent: older.content,
                  newContent: newer.content,
                });
                supersededCount++;
              }
            }
          }
        } catch (err) {
          console.error(`AI conflict resolution error for ${entity.name}:`, err);
        }
      }
    }
  }

  return {
    purgedCount,
    decayedCount: decayResult.decayedCount,
    supersededCount,
    consolidatedCount: supersededCount,
    details: {
      purged: [],
      decayed: decayResult.decayedIds,
      superseded: supersededList,
    },
  };
}
