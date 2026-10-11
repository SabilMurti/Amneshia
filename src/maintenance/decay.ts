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

  if (obs.expiresAt) {
    const exp = new Date(obs.expiresAt).getTime();
    if (Number.isNaN(exp) || exp <= nowMs) {
      return 0.0;
    }
  }

  const tierWeight = TIER_WEIGHTS[obs.authorityTier] ?? 0.5;
  const maxDays = TIER_MAX_INACTIVE_DAYS[obs.authorityTier] ?? 90;

  const rawDate = obs.lastAccessedAt || obs.createdAt;
  const parsed = new Date(rawDate).getTime();
  const lastActivity = Number.isNaN(parsed) ? 0 : parsed;
  const daysInactive = Math.max(0, (nowMs - lastActivity) / (1000 * 60 * 60 * 24));

  if (daysInactive >= maxDays) {
    return 0.0;
  }

  const recencyFactor = Math.max(0, 1 - daysInactive / maxDays);
  const safeAccessCount = Math.max(0, obs.accessCount || 0);
  const frequencyFactor = 1 + Math.log10(safeAccessCount + 1);

  return tierWeight * frequencyFactor * recencyFactor;
}

export interface DecayEvaluationResult {
  decayed: Observation[];
  retained: Observation[];
  inactive: Observation[];
}

export function evaluateDecay(
  observations: Observation[],
  threshold = 0.1,
  nowMs: number = Date.now()
): DecayEvaluationResult {
  const decayed: Observation[] = [];
  const retained: Observation[] = [];
  const inactive: Observation[] = [];

  for (const obs of observations) {
    if (obs.status !== 'active') {
      inactive.push(obs);
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

  return { decayed, retained, inactive };
}

export function applyDecay(
  db: DatabaseLayer,
  threshold = 0.1,
  nowMs: number = Date.now()
): { decayedCount: number; decayedIds: string[] } {
  const snapshot = db.readGraph(undefined, undefined, 'active');
  const decayedIds: string[] = [];

  for (const entity of snapshot.entities) {
    const { decayed } = evaluateDecay(entity.observations, threshold, nowMs);
    for (const obs of decayed) {
      decayedIds.push(obs.id);
    }
  }

  if (decayedIds.length > 0) {
    db.transaction(() => {
      for (const id of decayedIds) {
        db.setObservationStatus(id, 'decayed');
      }
    });
  }

  return {
    decayedCount: decayedIds.length,
    decayedIds,
  };
}
