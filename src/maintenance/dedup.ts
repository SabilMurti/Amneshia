import type { Observation } from '../types.js';

export interface DuplicatePair {
  older: Observation;
  newer: Observation;
  similarity: number;
  reason: string;
}

export function getJaccardSimilarity(s1: string, s2: string): number {
  const words1 = tokenizeWords(s1);
  const words2 = tokenizeWords(s2);
  return getJaccardFromSets(words1, words2);
}

function tokenizeWords(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean));
}

function getJaccardFromSets(words1: Set<string>, words2: Set<string>): number {
  if (words1.size === 0 || words2.size === 0) return 0;
  let intersectionCount = 0;
  for (const w of words1) {
    if (words2.has(w)) intersectionCount++;
  }
  const unionSize = words1.size + words2.size - intersectionCount;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
}

export function findDuplicates(
  observations: Observation[],
  threshold?: number
): DuplicatePair[] {
  const envRaw = process.env.AMNESHIA_DEDUP_THRESHOLD ?? process.env.AMNESIA_DEDUP_THRESHOLD;
  const envParsed = envRaw ? parseFloat(envRaw) : NaN;
  const validEnvThreshold = !Number.isNaN(envParsed) && envParsed >= 0 && envParsed <= 1 ? envParsed : 0.8;
  const simThreshold =
    typeof threshold === 'number' && !Number.isNaN(threshold) && threshold >= 0 && threshold <= 1
      ? threshold
      : validEnvThreshold;

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
    // Sort descending by createdAt (newest first) to ensure canonical newer survivorship
    tierObs.sort((a, b) => {
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return (Number.isNaN(tB) ? 0 : tB) - (Number.isNaN(tA) ? 0 : tA);
    });

    // Pre-tokenize and normalize each observation once to avoid O(N^2) allocations
    const tokenized = tierObs.map((obs) => ({
      obs,
      normalized: obs.content.toLowerCase().trim(),
      words: tokenizeWords(obs.content),
    }));

    for (let i = 0; i < tokenized.length; i++) {
      for (let j = i + 1; j < tokenized.length; j++) {
        const item1 = tokenized[i];
        const item2 = tokenized[j];

        if (supersededIds.has(item1.obs.id) || supersededIds.has(item2.obs.id)) {
          continue;
        }

        // Fast path: Exact match (case-insensitive & trimmed)
        const isExact = item1.normalized === item2.normalized;
        const sim = isExact ? 1.0 : getJaccardFromSets(item1.words, item2.words);

        if (isExact || sim >= simThreshold) {
          // Because list is sorted newest first, item1 is newer and item2 is older
          duplicates.push({
            older: item2.obs,
            newer: item1.obs,
            similarity: sim,
            reason: isExact
              ? 'Exact match duplicate'
              : `Jaccard similarity ${(sim * 100).toFixed(0)}% >= ${(simThreshold * 100).toFixed(0)}%`,
          });
          supersededIds.add(item2.obs.id);
        }
      }
    }
  }

  return duplicates;
}
