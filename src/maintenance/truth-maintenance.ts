import type { DatabaseLayer } from '../database/index.js';
import type { Observation } from '../types.js';

export interface InvalidationCascadeResult {
  invalidatedId: string;
  staleIds: string[];
  affectedObservations: Observation[];
}

export function cascadeInvalidate(
  observationId: string,
  db: DatabaseLayer
): InvalidationCascadeResult {
  const result = db.cascadeInvalidate(observationId);
  const affected: Observation[] = [];

  for (const staleId of result.staleIds) {
    const obs = db.getObservationById(staleId);
    if (obs) affected.push(obs);
  }

  return {
    invalidatedId: observationId,
    staleIds: result.staleIds,
    affectedObservations: affected,
  };
}
