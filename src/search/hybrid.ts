/**
 * @module
 * Reciprocal Rank Fusion (RRF) and Hybrid Search Fusion Engine for Amneshia.
 * Combines Lexical FTS5 BM25 matches with Semantic Dense Vector Cosine matches.
 */

import type { Entity, Observation, SearchResult } from '../types.js';

export interface ScoredMatch {
  entity: Entity;
  observations: Observation[];
  matchedContent: string;
  lexicalRank?: number;
  semanticRank?: number;
  semanticSimilarity?: number;
  rrfScore: number;
  matchType: 'hybrid' | 'semantic' | 'lexical';
}

export interface HybridFusionOptions {
  k?: number; // RRF smoothing constant (default: 60)
  limit?: number;
}

/**
 * Fuse Lexical (FTS5) and Semantic (Vector) search results using Reciprocal Rank Fusion (RRF).
 */
export function fuseRRF(
  lexicalResults: SearchResult[],
  semanticResults: { entity: Entity; observations: Observation[]; matchedContent: string; similarity: number }[],
  options?: HybridFusionOptions
): SearchResult[] {
  const k = options?.k || 60;
  const limit = options?.limit || 20;

  const entityMap = new Map<string, ScoredMatch>();

  // 1. Process Lexical Ranking (FTS5)
  lexicalResults.forEach((item, index) => {
    const rank = index + 1;
    const rrfContrib = 1 / (k + rank);

    entityMap.set(item.entity.id, {
      entity: item.entity,
      observations: [...item.observations],
      matchedContent: item.matchedContent,
      lexicalRank: rank,
      rrfScore: rrfContrib,
      matchType: 'lexical',
    });
  });

  // 2. Process Semantic Ranking (Vector Cosine)
  semanticResults.forEach((item, index) => {
    const rank = index + 1;
    const rrfContrib = 1 / (k + rank);

    const existing = entityMap.get(item.entity.id);
    if (existing) {
      existing.rrfScore += rrfContrib;
      existing.semanticRank = rank;
      existing.semanticSimilarity = item.similarity;
      existing.matchType = 'hybrid';

      // Merge observations
      const existingObsIds = new Set(existing.observations.map((o) => o.id));
      for (const obs of item.observations) {
        if (!existingObsIds.has(obs.id)) {
          existing.observations.push(obs);
          existingObsIds.add(obs.id);
        }
      }
    } else {
      entityMap.set(item.entity.id, {
        entity: item.entity,
        observations: [...item.observations],
        matchedContent: item.matchedContent,
        semanticRank: rank,
        semanticSimilarity: item.similarity,
        rrfScore: rrfContrib,
        matchType: 'semantic',
      });
    }
  });

  // 3. Sort by descending RRF score
  const sorted = Array.from(entityMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);

  // 4. Map to SearchResult with normalized rank
  return sorted.slice(0, limit).map((match) => ({
    entity: match.entity,
    observations: match.observations,
    matchedContent: match.matchedContent,
    rank: match.rrfScore,
  }));
}
