/**
 * @module
 * Project Memory Adoption Engine for Amneshia.
 * Enables seamless migration or cherry-picking of accumulated memories from global
 * storage (~/.amneshia) into local project repositories (.amneshia).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseLayer } from '../database/index.js';
import { DualWriteSync } from './index.js';
import { checkContradiction } from '../maintenance/contradiction.js';
import type { AuthorityTier, Entity, Observation } from '../types.js';

export interface AdoptOptions {
  /** Source data directory (defaults to global ~/.amneshia) */
  sourceDataDir?: string;
  /** Target data directory (defaults to current project ./.amneshia) */
  targetDataDir?: string;
  /** Filter to adopt only a specific domain */
  domain?: string;
  /** Specific entity names to adopt */
  entities?: string[];
  /** Adopt all entities from source */
  all?: boolean;
  /** If true, preview what will be adopted without modifying target */
  dryRun?: boolean;
  /** If true, delete adopted entities/observations from source after copying */
  move?: boolean;
}

export interface AdoptResult {
  dryRun: boolean;
  sourceDir: string;
  targetDir: string;
  entitiesAdopted: string[];
  observationsAdopted: number;
  relationsAdopted: number;
  skippedDuplicates: number;
  contradictionWarnings: Array<{ entity: string; fact: string; reason: string }>;
}

/**
 * Adopts memory from source repository into target repository with strict
 * deduplication, contradiction check, and provenance preservation.
 */
export async function adoptMemory(options: AdoptOptions = {}): Promise<AdoptResult> {
  const sourceDir = path.resolve(options.sourceDataDir ?? path.join(os.homedir(), '.amneshia'));
  const targetDir = path.resolve(options.targetDataDir ?? path.join(process.cwd(), '.amneshia'));
  const dryRun = options.dryRun ?? false;
  const isMove = options.move ?? false;

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source Amneshia directory not found: ${sourceDir}`);
  }

  // Ensure target directory exists if not dry-run
  if (!dryRun) {
    fs.mkdirSync(path.join(targetDir, 'knowledge'), { recursive: true });
  }

  const sourceDb = new DatabaseLayer(sourceDir);
  const targetDb = dryRun ? null : new DatabaseLayer(targetDir);
  const targetDualWrite = dryRun ? null : new DualWriteSync(path.join(targetDir, 'knowledge'), targetDb!);

  try {
    const sourceSnapshot = sourceDb.readGraph(options.domain);
    const targetEntitiesFilter = options.entities?.map((e) => e.trim().toLowerCase());

    const result: AdoptResult = {
      dryRun,
      sourceDir,
      targetDir,
      entitiesAdopted: [],
      observationsAdopted: 0,
      relationsAdopted: 0,
      skippedDuplicates: 0,
      contradictionWarnings: [],
    };

    // Filter candidate entities
    const candidates = sourceSnapshot.entities.filter((ent) => {
      if (options.all) return true;
      if (targetEntitiesFilter && targetEntitiesFilter.length > 0) {
        return targetEntitiesFilter.includes(ent.name.toLowerCase());
      }
      if (options.domain) {
        return ent.domain.toLowerCase() === options.domain.toLowerCase();
      }
      return false;
    });

    if (candidates.length === 0) {
      return result;
    }

    const adoptedEntityIds = new Set<string>();
    const entityIdMap = new Map<string, string>(); // sourceId -> targetId

    for (const sourceEntity of candidates) {
      let targetEntity: Entity | null = null;

      if (!dryRun) {
        // Check if entity already exists in target
        targetEntity = targetDb!.getEntityByName(sourceEntity.name);
        if (!targetEntity) {
          targetEntity = targetDb!.createEntity({
            name: sourceEntity.name,
            entityType: sourceEntity.entityType,
            domain: sourceEntity.domain,
            visibility: sourceEntity.visibility,
            allowedAgents: sourceEntity.allowedAgents,
          });
        }
        entityIdMap.set(sourceEntity.id, targetEntity.id);
      } else {
        entityIdMap.set(sourceEntity.id, sourceEntity.id);
      }

      result.entitiesAdopted.push(sourceEntity.name);
      adoptedEntityIds.add(sourceEntity.id);

      // Existing observation contents in target entity to prevent duplicate insertions
      const existingContents = new Set<string>();
      if (!dryRun && targetEntity) {
        const existingObs = targetDb!.getObservationsByEntity(targetEntity.id);
        for (const obs of existingObs) {
          existingContents.add(obs.content.trim().toLowerCase());
        }
      }

      for (const obs of sourceEntity.observations) {
        const contentKey = obs.content.trim().toLowerCase();

        if (existingContents.has(contentKey)) {
          result.skippedDuplicates++;
          continue;
        }

        if (!dryRun && targetEntity) {
          // Check for pre-insertion contradictions with active target observations
          const contradiction = await checkContradiction(obs.content, targetEntity.id, targetDb!);
          if (contradiction.hasContradiction) {
            result.contradictionWarnings.push({
              entity: sourceEntity.name,
              fact: obs.content,
              reason: contradiction.reason ?? 'Contradiction detected against existing fact',
            });
          }

          // Insert observation into target with preserved metadata and authority tier
          targetDb!.addObservation(
            targetEntity.id,
            obs.content,
            obs.source ?? 'adopted',
            obs.importance,
            obs.confidence,
            obs.expiresAt ?? undefined,
            obs.authorityTier as AuthorityTier,
            obs.derivedFrom ?? []
          );
        }

        result.observationsAdopted++;
      }

      // Sync to target Markdown if not dry run
      if (!dryRun && targetEntity) {
        targetDualWrite!.syncEntity(targetEntity);
      }
    }

    // Re-link relations between adopted entities
    const processedRelationIds = new Set<string>();
    for (const sourceEntity of candidates) {
      for (const rel of sourceEntity.relations) {
        if (adoptedEntityIds.has(rel.fromEntity) && adoptedEntityIds.has(rel.toEntity)) {
          if (processedRelationIds.has(rel.id)) continue;
          processedRelationIds.add(rel.id);
          result.relationsAdopted++;
          if (!dryRun) {
            const targetFromId = entityIdMap.get(rel.fromEntity);
            const targetToId = entityIdMap.get(rel.toEntity);
            if (targetFromId && targetToId) {
              try {
                targetDb!.createRelation(targetFromId, targetToId, rel.relationType);
              } catch {
                // Ignore if relation already exists in target
              }
            }
          }
        }
      }
    }

    // If move mode is enabled and not dry run, delete migrated entities from source
    if (isMove && !dryRun) {
      const sourceDualWrite = new DualWriteSync(path.join(sourceDir, 'knowledge'), sourceDb);
      for (const sourceEntity of candidates) {
        sourceDb.deleteEntity(sourceEntity.id);
        sourceDualWrite.removeEntity(sourceEntity.domain, sourceEntity.name);
      }
    }

    return result;
  } finally {
    sourceDb.close();
    if (targetDb) {
      targetDb.close();
    }
  }
}
