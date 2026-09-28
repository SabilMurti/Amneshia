import type { Observation } from '../types.js';

export interface DuplicatePair {
  older: Observation;
  newer: Observation;
  similarity: number;
  reason: string;
}

export function getJaccardSimilarity(s1: string, s2: string): number {
  const words1 = new Set(s1.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
  const words2 = new Set(s2.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

export function findDuplicates(
  observations: Observation[],
  threshold?: number
): DuplicatePair[] {
  const simThreshold =
    threshold ??
    (process.env.AMNESHIA_DEDUP_THRESHOLD ? parseFloat(process.env.AMNESHIA_DEDUP_THRESHOLD) : 0.8);

  const duplicates: DuplicatePair[] = [];
  const supersededIds = new Set<string>();

  // Group observations by authority tier so we never cross-deduplicate different tiers
  const byTier = new Map<string, Observation[]>();
  for (const obs of observations) {
    if (obs.status !== 'active') continue;
    const tier = obs.authorityTier || 'contextual';
    const list = byTier.get(tier) ?? [];
    list.push(obs);
    byTier.set(tier, list);
  }

  for (const [_tier, tierObs] of byTier.entries()) {
    for (let i = 0; i < tierObs.length; i++) {
      for (let j = i + 1; j < tierObs.length; j++) {
        const obs1 = tierObs[i];
        const obs2 = tierObs[j];

        if (supersededIds.has(obs1.id) || supersededIds.has(obs2.id)) {
          continue;
        }

        // Fast path: Exact match (case-insensitive & trimmed)
        const isExact = obs1.content.toLowerCase().trim() === obs2.content.toLowerCase().trim();
        const sim = isExact ? 1.0 : getJaccardSimilarity(obs1.content, obs2.content);

        if (isExact || sim >= simThreshold) {
          const older = new Date(obs1.createdAt).getTime() <= new Date(obs2.createdAt).getTime() ? obs1 : obs2;
          const newer = older === obs1 ? obs2 : obs1;

          duplicates.push({
            older,
            newer,
            similarity: sim,
            reason: isExact ? 'Exact match duplicate' : `Jaccard similarity ${(sim * 100).toFixed(0)}% >= ${(simThreshold * 100).toFixed(0)}%`,
          });
          supersededIds.add(older.id);
        }
      }
    }
  }

  return duplicates;
}
