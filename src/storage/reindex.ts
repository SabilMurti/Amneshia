import type { DatabaseLayer } from '../database/index.js';
import { loadAllEntityMarkdowns } from './markdown-store.js';

export interface ReindexResult {
  entities: number;
  observations: number;
  relations: number;
  mediaAssets?: number;
}

export function reindexFromMarkdown(knowledgeDir: string, db: DatabaseLayer): ReindexResult {
  const parsedEntities = loadAllEntityMarkdowns(knowledgeDir);
  let entityCount = 0;
  let observationCount = 0;
  let relationCount = 0;
  let mediaCount = 0;

  // Pass 1: Upsert all entities & media assets
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

    if (item.media) {
      const existingMedia = db.getMediaByEntity(existing.id);
      if (!existingMedia) {
        db.createMediaAsset({
          entityId: existing.id,
          sha256: item.media.sha256,
          mimeType: item.media.mimeType,
          fileName: item.media.fileName,
          fileSize: item.media.fileSize,
          relativePath: item.media.relativePath,
        });
        mediaCount++;
      }
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
        obs.derivedFrom,
        obs.id,
        item.createdAt,
        obs.supersedes
      );

      if (obs.status && obs.status !== 'active') {
        db.setObservationStatus(created.id, obs.status);
      }

      existingObsIds.add(created.id);
      existingObsContents.add(created.content);
      observationCount++;
    }

    const seenRelations = new Set<string>();
    for (const rel of item.relations) {
      const targetEntity = db.getEntityByName(rel.targetName);
      if (targetEntity) {
        const fromId = rel.direction === '<-' ? targetEntity.id : entity.id;
        const toId = rel.direction === '<-' ? entity.id : targetEntity.id;
        const relKey = `${fromId}:${toId}:${rel.relationType}`;
        const existingRels = db.getRelationsByEntity(fromId);
        const alreadyExists = existingRels.some((r) => r.toEntity === toId && r.relationType === rel.relationType);
        if (!alreadyExists && !seenRelations.has(relKey)) {
          seenRelations.add(relKey);
          db.createRelation(fromId, toId, rel.relationType);
          relationCount++;
        }
      }
    }
  }

  return {
    entities: entityCount,
    observations: observationCount,
    relations: relationCount,
    mediaAssets: mediaCount,
  };
}
