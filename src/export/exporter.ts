/**
 * @module
 * Universal Memory Export Engine for Amneshia.
 * Supports exporting full or filtered knowledge graphs to SQLite, Markdown bundles, or JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import type { DatabaseLayer } from '../database/index.js';
import type { AuthorityTier, ObservationStatus, Entity, Observation, RelationWithNames, MediaAsset } from '../types.js';
import { saveEntityMarkdown } from '../storage/markdown-store.js';
import { toSlug } from '../storage/slug.js';
import { SCHEMA_SQL } from '../database/schema.js';
import { runMigrations } from '../database/migrations.js';

export type ExportFormat = 'sqlite' | 'markdown' | 'json';

export interface ExportFilterOptions {
  domain?: string;
  entities?: string[];
  tiers?: AuthorityTier[];
  statuses?: ObservationStatus[];
  query?: string;
}

export interface ExportResult {
  format: ExportFormat;
  outputPath: string;
  entitiesCount: number;
  observationsCount: number;
  relationsCount: number;
}

export interface FilteredEntityNode extends Entity {
  observations: Observation[];
  relations: RelationWithNames[];
  media?: MediaAsset | null;
}

/**
 * Filter memory graph snapshot based on user-provided criteria.
 */
export function filterMemoryGraph(
  db: DatabaseLayer,
  filters: ExportFilterOptions
): FilteredEntityNode[] {
  const snapshot = db.readGraph(filters.domain);
  const targetEntities = filters.entities?.map((e) => e.trim().toLowerCase());
  const allowedTiers = filters.tiers ? new Set(filters.tiers) : null;
  const allowedStatuses = filters.statuses ? new Set(filters.statuses) : null;

  // Keyword query search across observations if query is specified
  let matchingEntityIds: Set<string> | null = null;
  let matchingObsIds: Set<string> | null = null;
  if (filters.query && filters.query.trim().length > 0) {
    const ftsResults = db.searchFTSRelevant(filters.query, 1000);
    matchingEntityIds = new Set<string>();
    matchingObsIds = new Set<string>();
    for (const res of ftsResults) {
      matchingEntityIds.add(res.entity.id);
      for (const obs of res.observations) {
        matchingObsIds.add(obs.id);
      }
    }
  }

  const result: FilteredEntityNode[] = [];

  for (const ent of snapshot.entities) {
    // Filter by entity name list if provided
    if (targetEntities && targetEntities.length > 0) {
      if (!targetEntities.includes(ent.name.toLowerCase())) {
        continue;
      }
    }

    // Filter by FTS match if query was supplied
    if (matchingEntityIds && !matchingEntityIds.has(ent.id)) {
      continue;
    }

    // Filter observations
    const filteredObs = ent.observations.filter((obs) => {
      if (allowedTiers && !allowedTiers.has(obs.authorityTier)) {
        return false;
      }
      if (allowedStatuses && !allowedStatuses.has(obs.status)) {
        return false;
      }
      if (matchingObsIds && !matchingObsIds.has(obs.id)) {
        return false;
      }
      return true;
    });

    // If query filter is applied and no observations match, skip unless entity name matched
    if (filters.query && filteredObs.length === 0 && (!matchingEntityIds || !matchingEntityIds.has(ent.id))) {
      continue;
    }

    const media = db.getMediaByEntity(ent.id);

    result.push({
      ...ent,
      observations: filteredObs,
      relations: ent.relations ?? [],
      media,
    });
  }

  return result;
}

/**
 * Universal memory exporter supporting SQLite, Markdown, and JSON.
 */
export class MemoryExporter {
  constructor(private readonly db: DatabaseLayer) {}

  /**
   * Export memory graph based on format and output destination.
   */
  async export(
    format: ExportFormat,
    outputPath: string,
    filters: ExportFilterOptions = {}
  ): Promise<ExportResult> {
    const resolvedPath = path.resolve(outputPath);
    const filteredData = filterMemoryGraph(this.db, filters);

    let totalObs = 0;
    const uniqueRelIds = new Set<string>();
    for (const e of filteredData) {
      totalObs += e.observations.length;
      for (const r of e.relations) {
        uniqueRelIds.add(r.id);
      }
    }
    const totalRel = uniqueRelIds.size;

    switch (format) {
      case 'json':
        this.exportToJson(resolvedPath, filteredData);
        break;
      case 'markdown':
        this.exportToMarkdown(resolvedPath, filteredData);
        break;
      case 'sqlite':
        this.exportToSqlite(resolvedPath, filteredData);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    return {
      format,
      outputPath: resolvedPath,
      entitiesCount: filteredData.length,
      observationsCount: totalObs,
      relationsCount: totalRel,
    };
  }

  private exportToJson(outputPath: string, data: FilteredEntityNode[]): void {
    const parentDir = path.dirname(outputPath);
    fs.mkdirSync(parentDir, { recursive: true });

    const payload = {
      formatVersion: '3.0.0',
      version: '3.2.0',
      exportedAt: new Date().toISOString(),
      entitiesCount: data.length,
      entities: data,
    };

    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private exportToMarkdown(outputDir: string, data: FilteredEntityNode[]): void {
    fs.mkdirSync(outputDir, { recursive: true });

    const possibleKnowledgeDirs = [
      path.join(this.db.getDataDir(), '..', 'knowledge'),
      path.join(this.db.getDataDir(), 'knowledge'),
      path.join(process.cwd(), '.amneshia', 'knowledge'),
      path.join(os.homedir(), '.amneshia', 'knowledge'),
    ];

    for (const ent of data) {
      saveEntityMarkdown(outputDir, ent, ent.observations, ent.relations, ent.media);
      if (ent.media) {
        for (const kDir of possibleKnowledgeDirs) {
          const srcBlob = path.join(kDir, ent.media.relativePath);
          const destBlob = path.join(outputDir, ent.media.relativePath);
          if (fs.existsSync(srcBlob) && !fs.existsSync(destBlob)) {
            fs.mkdirSync(path.dirname(destBlob), { recursive: true });
            fs.copyFileSync(srcBlob, destBlob);
            break;
          }
        }
      }
    }

    // Generate index.md catalog for the markdown bundle
    const indexLines = [
      '# Amneshia Knowledge Graph Export Catalog',
      '',
      `Exported at: ${new Date().toISOString()}`,
      `Total Entities: ${data.length}`,
      '',
      '## Entities',
      '',
    ];
    for (const ent of data) {
      const domainSlug = toSlug(ent.domain);
      const nameSlug = toSlug(ent.name);
      indexLines.push(`- [${ent.name}](./${domainSlug}/${nameSlug}.md) (${ent.domain} / ${ent.entityType}) — ${ent.observations.length} observations`);
    }
    indexLines.push('');
    fs.writeFileSync(path.join(outputDir, 'index.md'), indexLines.join('\n'), 'utf-8');
  }

  private exportToSqlite(outputPath: string, data: FilteredEntityNode[]): void {
    const parentDir = path.dirname(outputPath);
    fs.mkdirSync(parentDir, { recursive: true });

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const exportDb = new Database(outputPath);
    try {
      exportDb.pragma('journal_mode = WAL');
      exportDb.pragma('synchronous = NORMAL');
      exportDb.pragma('foreign_keys = ON');

      exportDb.exec(SCHEMA_SQL);
      runMigrations(exportDb);

      const insertEntity = exportDb.prepare(`
        INSERT INTO entities (id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertObs = exportDb.prepare(`
        INSERT INTO observations (
          id, entity_id, content, source, importance, status,
          confidence, access_count, authority_tier, derived_from,
          created_at, updated_at, expires_at, last_accessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertRelation = exportDb.prepare(`
        INSERT INTO relations (id, from_entity, to_entity, relation_type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertMedia = exportDb.prepare(`
        INSERT INTO media_assets (id, entity_id, sha256, mime_type, file_name, file_size, relative_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const populateTransaction = exportDb.transaction(() => {
        const entityIds = new Set<string>();

        for (const ent of data) {
          entityIds.add(ent.id);
          insertEntity.run(
            ent.id,
            ent.name,
            ent.entityType,
            ent.domain,
            ent.visibility,
            JSON.stringify(ent.allowedAgents ?? []),
            ent.createdAt,
            ent.updatedAt
          );

          if (ent.media) {
            insertMedia.run(
              ent.media.id,
              ent.media.entityId,
              ent.media.sha256,
              ent.media.mimeType,
              ent.media.fileName,
              ent.media.fileSize,
              ent.media.relativePath,
              ent.media.createdAt
            );
          }

          for (const obs of ent.observations) {
            insertObs.run(
              obs.id,
              obs.entityId,
              obs.content,
              obs.source ?? null,
              obs.importance,
              obs.status,
              obs.confidence,
              obs.accessCount ?? 0,
              obs.authorityTier,
              JSON.stringify(obs.derivedFrom ?? []),
              obs.createdAt,
              obs.updatedAt,
              obs.expiresAt ?? null,
              obs.lastAccessedAt ?? null
            );
          }
        }

        // Only insert relations where both entities are present in export
        for (const ent of data) {
          for (const rel of ent.relations) {
            if (entityIds.has(rel.fromEntity) && entityIds.has(rel.toEntity)) {
              try {
                insertRelation.run(
                  rel.id,
                  rel.fromEntity,
                  rel.toEntity,
                  rel.relationType,
                  rel.createdAt
                );
              } catch {
                // Ignore duplicate relation inserts if already inserted from another side
              }
            }
          }
        }
      });

      populateTransaction();
    } finally {
      exportDb.close();
    }
  }
}
