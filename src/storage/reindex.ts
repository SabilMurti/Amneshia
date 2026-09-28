import type { DatabaseLayer } from '../database/index.js';
import { loadAllEntityMarkdowns } from './markdown-store.js';

export interface ReindexResult {
  entities: number;
  observations: number;
  relations: number;
}

export function reindexFromMarkdown(knowledgeDir: string, db: DatabaseLayer): ReindexResult {
  const parsedEntities = loadAllEntityMarkdowns(knowledgeDir);
  let entityCount = 0;
  let observationCount = 0;
  let relationCount = 0;

  // Pass 1: Upsert all entities
  for (const item of parsedEntities) {
    let existing = db.getEntityByName(item.name);
    if (!existing) {
      existing = db.createEntity({
        name: item.name,
        entityType: item.entityType,
        domain: item.domain,
        visibility: item.visibility,
        allowedAgents: item.allowedAgents,
      });
      entityCount++;
    }
  }

  // Pass 2: Upsert observations and relations
  for (const item of parsedEntities) {
    const entity = db.getEntityByName(item.name);
    if (!entity) continue;

    const existingObs = db.getObservationsByEntity(entity.id);
    const existingObsContents = new Set(existingObs.map((o) => o.content));
    const existingObsIds = new Set(existingObs.map((o) => o.id));

    for (const obs of item.observations) {
      if (obs.id && existingObsIds.has(obs.id)) {
        continue;
      }
      if (existingObsContents.has(obs.content)) {
        continue;
      }

      const created = db.addObservation(
        entity.id,
        obs.content,
        'reindex',
        'normal',
        obs.confidence,
        undefined,
        obs.authorityTier,
        obs.derivedFrom
      );

      if (obs.status && obs.status !== 'active') {
        db.setObservationStatus(created.id, obs.status);
      }

      observationCount++;
    }

    for (const rel of item.relations) {
      const targetEntity = db.getEntityByName(rel.targetName);
      if (targetEntity) {
        db.createRelation(entity.id, targetEntity.id, rel.relationType);
        relationCount++;
      }
    }
  }

  return {
    entities: entityCount,
    observations: observationCount,
    relations: relationCount,
  };
}
