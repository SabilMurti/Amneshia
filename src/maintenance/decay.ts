import type { AuthorityTier, Observation } from '../types.js';
import type { DatabaseLayer } from '../database/index.js';

export const TIER_WEIGHTS: Record<AuthorityTier, number> = {
  invariant: 1.0,
  architectural: 0.8,
  contextual: 0.5,
  ephemeral: 0.2,
};

export const TIER_MAX_INACTIVE_DAYS: Record<AuthorityTier, number> = {
  invariant: Infinity,
  architectural: 365,
  contextual: 90,
  ephemeral: 7,
};

export function computeDecayScore(obs: Observation, nowMs: number = Date.now()): number {
  if (obs.authorityTier === 'invariant') {
    return 1.0;
  }

  if (obs.expiresAt && new Date(obs.expiresAt).getTime() <= nowMs) {
    return 0.0;
  }

  const tierWeight = TIER_WEIGHTS[obs.authorityTier] ?? 0.5;
  const maxDays = TIER_MAX_INACTIVE_DAYS[obs.authorityTier] ?? 90;

  const lastActivity = obs.lastAccessedAt ? new Date(obs.lastAccessedAt).getTime() : new Date(obs.createdAt).getTime();
  const daysInactive = Math.max(0, (nowMs - lastActivity) / (1000 * 60 * 60 * 24));

  if (daysInactive >= maxDays) {
    return 0.0;
  }

  const recencyFactor = Math.max(0, 1 - daysInactive / maxDays);
  const frequencyFactor = 1 + Math.log10((obs.accessCount || 0) + 1);

  return tierWeight * frequencyFactor * recencyFactor;
}

export interface DecayEvaluationResult {
  decayed: Observation[];
  retained: Observation[];
}

export function evaluateDecay(
  observations: Observation[],
  threshold = 0.1,
  nowMs: number = Date.now()
): DecayEvaluationResult {
  const decayed: Observation[] = [];
  const retained: Observation[] = [];

  for (const obs of observations) {
    if (obs.status !== 'active') {
      continue;
    }

    if (obs.authorityTier === 'invariant') {
      retained.push(obs);
      continue;
    }

    const score = computeDecayScore(obs, nowMs);
    if (score < threshold) {
      decayed.push(obs);
    } else {
      retained.push(obs);
    }
  }

  return { decayed, retained };
}

export function applyDecay(
  db: DatabaseLayer,
  threshold = 0.1,
  nowMs: number = Date.now()
): { decayedCount: number; decayedIds: string[] } {
  const snapshot = db.readGraph();
  const decayedIds: string[] = [];

  for (const entity of snapshot.entities) {
    const { decayed } = evaluateDecay(entity.observations, threshold, nowMs);
    for (const obs of decayed) {
      db.setObservationStatus(obs.id, 'decayed');
      decayedIds.push(obs.id);
    }
  }

  return {
    decayedCount: decayedIds.length,
    decayedIds,
  };
}
