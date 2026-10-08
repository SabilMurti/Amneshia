/**
 * @module
 * Smart 3-Way Git Merge Driver for Amneshia Knowledge Graph.
 * Resolves concurrent cross-device updates to entity markdown files without conflict markers.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  AuthorityTier,
  ObservationStatus,
} from '../types.js';
import {
  parseEntityMarkdown,
  type ParsedMarkdownEntity,
  type ParsedObservation,
  type ParsedRelation,
} from '../storage/markdown-store.js';

export interface DirectionalRelation extends ParsedRelation {
  direction?: '->' | '<-';
}

export interface MergedMarkdownEntity extends Omit<ParsedMarkdownEntity, 'relations'> {
  relations: DirectionalRelation[];
}

export interface MergeDriverResult {
  success: boolean;
  outputPath: string;
  entityName: string;
  observationsCount: number;
  relationsCount: number;
  message?: string;
}

/**
 * Normalized string key for content deduplication.
 */
function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Extract relations with direction preservation ('->' vs '<-').
 */
export function extractDirectionalRelations(markdown: string): DirectionalRelation[] {
  const relations: DirectionalRelation[] = [];
  const relSectionMatch = markdown.match(/## Relations\r?\n([\s\S]*?)$/i);
  if (!relSectionMatch) return relations;

  const lines = relSectionMatch[1].split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- `'));
  for (const line of lines) {
    const relMatch = line.match(/^- `(.*?)`\s*(->|<-)\s*(.*)$/);
    if (relMatch) {
      relations.push({
        relationType: relMatch[1].trim(),
        direction: relMatch[2] as '->' | '<-',
        targetName: relMatch[3].trim(),
      });
    }
  }
  return relations;
}

/**
 * Serialize a parsed markdown entity back to valid Amneshia Markdown format.
 */
export function serializeParsedEntity(entity: MergedMarkdownEntity): string {
  const frontmatter = [
    '---',
    `id: ${JSON.stringify(entity.id || '')}`,
    `name: ${JSON.stringify(entity.name || '')}`,
    `type: ${JSON.stringify(entity.entityType || 'concept')}`,
    `domain: ${JSON.stringify(entity.domain || 'personal')}`,
    `visibility: ${JSON.stringify(entity.visibility || 'public')}`,
    `allowed_agents: ${JSON.stringify(entity.allowedAgents ?? [])}`,
    `created: ${JSON.stringify(entity.createdAt || new Date().toISOString())}`,
    `updated: ${JSON.stringify(entity.updatedAt || new Date().toISOString())}`,
    '---',
  ].join('\n');

  const obsLines: string[] = [];
  for (const obs of entity.observations) {
    const isInactive = obs.status === 'superseded' || obs.status === 'invalidated' || obs.status === 'decayed';
    const mainText = `**[${obs.authorityTier}]** ${obs.content}`;
    const formattedText = isInactive ? `~~${mainText}~~` : mainText;

    const metaParts = [
      `id: ${obs.id}`,
      `confidence: ${obs.confidence}`,
    ];

    if (obs.derivedFrom && obs.derivedFrom.length > 0) {
      metaParts.push(`derived_from: [${obs.derivedFrom.join(', ')}]`);
    }

    metaParts.push(`status: ${obs.status}`);

    if (obs.supersedes) {
      metaParts.push(`superseded_by: ${obs.supersedes}`);
    }

    obsLines.push(`- ${formattedText}\n  \`${metaParts.join(' | ')}\``);
  }

  const relLines: string[] = [];
  for (const rel of entity.relations) {
    const dir = rel.direction || '->';
    relLines.push(`- \`${rel.relationType}\` ${dir} ${rel.targetName}`);
  }

  const sections = [frontmatter];

  sections.push('## Observations\n');
  if (obsLines.length > 0) {
    sections.push(obsLines.join('\n\n'));
  } else {
    sections.push('_No observations recorded yet._');
  }

  sections.push('\n## Relations\n');
  if (relLines.length > 0) {
    sections.push(relLines.join('\n'));
  } else {
    sections.push('_No relations recorded yet._');
  }

  return sections.join('\n') + '\n';
}

/**
 * Priority rank for authority tier: invariant > architectural > contextual > ephemeral.
 */
function tierRank(tier: AuthorityTier): number {
  switch (tier) {
    case 'invariant':
      return 4;
    case 'architectural':
      return 3;
    case 'contextual':
      return 2;
    case 'ephemeral':
      return 1;
    default:
      return 0;
  }
}

/**
 * 3-Way Semantic Merge of two entity states against an optional common ancestor (base).
 */
export function mergeParsedEntities(
  base: MergedMarkdownEntity | null,
  ours: MergedMarkdownEntity,
  theirs: MergedMarkdownEntity
): MergedMarkdownEntity {
  // 1. Entity Metadata Merge
  const id = ours.id || theirs.id || (base?.id ?? '');
  const name = ours.name || theirs.name || (base?.name ?? '');

  const entityType =
    theirs.entityType !== base?.entityType ? theirs.entityType : ours.entityType || 'concept';
  const domain =
    theirs.domain !== base?.domain ? theirs.domain : ours.domain || 'personal';
  const visibility =
    theirs.visibility !== base?.visibility ? theirs.visibility : ours.visibility || 'public';

  const mergedAgents = Array.from(new Set([...(ours.allowedAgents ?? []), ...(theirs.allowedAgents ?? [])]));

  const createdAt = [ours.createdAt, theirs.createdAt, base?.createdAt]
    .filter(Boolean)
    .sort()[0] || new Date().toISOString();

  const updatedAt =
    [ours.updatedAt, theirs.updatedAt].filter(Boolean).sort().reverse()[0] ||
    new Date().toISOString();

  // 2. Observations 3-Way Merge
  const baseObsById = new Map<string, ParsedObservation>();
  const baseObsByContent = new Map<string, ParsedObservation>();
  if (base) {
    for (const obs of base.observations) {
      if (obs.id) baseObsById.set(obs.id, obs);
      baseObsByContent.set(normalizeContent(obs.content), obs);
    }
  }

  const oursObsById = new Map<string, ParsedObservation>();
  const oursObsByContent = new Map<string, ParsedObservation>();
  for (const obs of ours.observations) {
    if (obs.id) oursObsById.set(obs.id, obs);
    oursObsByContent.set(normalizeContent(obs.content), obs);
  }

  const theirsObsById = new Map<string, ParsedObservation>();
  const theirsObsByContent = new Map<string, ParsedObservation>();
  for (const obs of theirs.observations) {
    if (obs.id) theirsObsById.set(obs.id, obs);
    theirsObsByContent.set(normalizeContent(obs.content), obs);
  }

  const candidateObservations: ParsedObservation[] = [];

  // Helper to merge two observation variants into one
  const mergeTwoObs = (a: ParsedObservation, b: ParsedObservation): ParsedObservation => {
    const higherTier = tierRank(a.authorityTier) >= tierRank(b.authorityTier) ? a.authorityTier : b.authorityTier;
    const combinedDerived = Array.from(new Set([...(a.derivedFrom ?? []), ...(b.derivedFrom ?? [])]));
    const bestStatus: ObservationStatus =
      a.status === 'invalidated' || b.status === 'invalidated'
        ? 'invalidated'
        : a.status === 'stale' || b.status === 'stale'
        ? 'stale'
        : 'active';
    return {
      id: a.id || b.id,
      content: a.content.length >= b.content.length ? a.content : b.content,
      authorityTier: higherTier,
      derivedFrom: combinedDerived,
      confidence: Math.max(a.confidence ?? 1.0, b.confidence ?? 1.0),
      status: bestStatus,
      supersedes: a.supersedes || b.supersedes || null,
    };
  };

  // If no base (e.g. concurrent additions on separate branches)
  if (!base) {
    const seenContent = new Set<string>();
    const all = [...ours.observations, ...theirs.observations];
    for (const obs of all) {
      const norm = normalizeContent(obs.content);
      const counterpart =
        theirsObsByContent.get(norm) || oursObsByContent.get(norm);

      if (counterpart && counterpart !== obs) {
        if (!seenContent.has(norm)) {
          candidateObservations.push(mergeTwoObs(obs, counterpart));
          seenContent.add(norm);
        }
      } else if (!seenContent.has(norm)) {
        candidateObservations.push(obs);
        seenContent.add(norm);
      }
    }
  } else {
    // 3-way reconciliation
    const processedIds = new Set<string>();
    const processedContent = new Set<string>();

    // 1. Process Ours observations
    for (const oObs of ours.observations) {
      const norm = normalizeContent(oObs.content);
      const bObs = (oObs.id ? baseObsById.get(oObs.id) : undefined) || baseObsByContent.get(norm);
      const tObs = (oObs.id ? theirsObsById.get(oObs.id) : undefined) || theirsObsByContent.get(norm);

      if (!bObs) {
        // Added in Ours
        if (tObs) {
          // Also added in Theirs! Merge them
          candidateObservations.push(mergeTwoObs(oObs, tObs));
        } else {
          candidateObservations.push(oObs);
        }
      } else {
        // Existed in Base
        if (!tObs) {
          // Deleted in Theirs
          const oursModified = JSON.stringify(oObs) !== JSON.stringify(bObs);
          if (oursModified) {
            // Ours modified it, so preserve our modification instead of deleting
            candidateObservations.push(oObs);
          }
          // Else: unchanged in Ours and deleted in Theirs -> deleted (do not add)
        } else {
          // Exists in both Ours and Theirs
          const oursChanged = JSON.stringify(oObs) !== JSON.stringify(bObs);
          const theirsChanged = JSON.stringify(tObs) !== JSON.stringify(bObs);

          if (!oursChanged && theirsChanged) {
            // Theirs changed, Ours didn't -> take Theirs
            candidateObservations.push(tObs);
          } else if (oursChanged && !theirsChanged) {
            // Ours changed, Theirs didn't -> take Ours
            candidateObservations.push(oObs);
          } else if (oursChanged && theirsChanged) {
            // Both changed -> merge them
            candidateObservations.push(mergeTwoObs(oObs, tObs));
          } else {
            // Neither changed -> keep
            candidateObservations.push(oObs);
          }
        }
      }

      if (oObs.id) processedIds.add(oObs.id);
      processedContent.add(norm);
    }

    // 2. Process remaining Theirs observations (not in Ours)
    for (const tObs of theirs.observations) {
      const norm = normalizeContent(tObs.content);
      if (tObs.id && processedIds.has(tObs.id)) continue;
      if (processedContent.has(norm)) continue;

      const bObs = (tObs.id ? baseObsById.get(tObs.id) : undefined) || baseObsByContent.get(norm);

      if (!bObs) {
        // Added in Theirs only -> Keep
        candidateObservations.push(tObs);
      } else {
        // Existed in Base, but not in Ours (deleted in Ours)
        const theirsModified = JSON.stringify(tObs) !== JSON.stringify(bObs);
        if (theirsModified) {
          // Theirs modified while Ours deleted -> Keep Theirs modification
          candidateObservations.push(tObs);
        }
        // Else: deleted in Ours and unmodified in Theirs -> deleted
      }

      if (tObs.id) processedIds.add(tObs.id);
      processedContent.add(norm);
    }
  }

  // Final deduplication pass for observations by normalized content
  const dedupedObservations: ParsedObservation[] = [];
  const contentMap = new Map<string, ParsedObservation>();

  for (const obs of candidateObservations) {
    const key = normalizeContent(obs.content);
    const existing = contentMap.get(key);
    if (!existing) {
      contentMap.set(key, obs);
      dedupedObservations.push(obs);
    } else {
      // Merge into existing
      const merged = mergeTwoObs(existing, obs);
      const idx = dedupedObservations.indexOf(existing);
      if (idx !== -1) {
        dedupedObservations[idx] = merged;
        contentMap.set(key, merged);
      }
    }
  }

  // 3. Relations 3-Way Merge
  const relKey = (r: DirectionalRelation) => `${r.relationType}::${r.direction || '->'}::${r.targetName.trim().toLowerCase()}`;

  const baseRelKeys = new Set((base?.relations ?? []).map(relKey));
  const oursRelMap = new Map((ours.relations ?? []).map((r) => [relKey(r), r]));
  const theirsRelMap = new Map((theirs.relations ?? []).map((r) => [relKey(r), r]));

  const mergedRelations: DirectionalRelation[] = [];
  const processedRelKeys = new Set<string>();

  for (const [key, rel] of oursRelMap) {
    if (processedRelKeys.has(key)) continue;
    if (!baseRelKeys.has(key)) {
      // Added in Ours -> Keep
      mergedRelations.push(rel);
    } else {
      // In Base: check if deleted in Theirs
      if (theirsRelMap.has(key)) {
        mergedRelations.push(rel);
      }
      // If not in Theirs: deleted in Theirs, so remove
    }
    processedRelKeys.add(key);
  }

  for (const [key, rel] of theirsRelMap) {
    if (processedRelKeys.has(key)) continue;
    if (!baseRelKeys.has(key)) {
      // Added in Theirs -> Keep
      mergedRelations.push(rel);
    }
    // If was in Base and not in Ours, it was deleted in Ours, so skip
    processedRelKeys.add(key);
  }

  return {
    id,
    name,
    entityType,
    domain,
    visibility,
    allowedAgents: mergedAgents,
    createdAt,
    updatedAt,
    observations: dedupedObservations,
    relations: mergedRelations,
  };
}

/**
 * Execute 3-way merge on markdown files from file paths.
 * Git passes: %O (base), %A (ours), %B (theirs), %P (relative path)
 */
export function mergeMarkdownFiles(
  basePath: string | null | undefined,
  oursPath: string,
  theirsPath: string,
  targetPath?: string
): MergeDriverResult {
  const destination = targetPath || oursPath;

  if (!fs.existsSync(oursPath)) {
    throw new Error(`Ours file does not exist at: ${oursPath}`);
  }
  if (!fs.existsSync(theirsPath)) {
    throw new Error(`Theirs file does not exist at: ${theirsPath}`);
  }

  const oursRaw = fs.readFileSync(oursPath, 'utf-8');
  const theirsRaw = fs.readFileSync(theirsPath, 'utf-8');

  let baseRaw: string | null = null;
  if (basePath && fs.existsSync(basePath)) {
    baseRaw = fs.readFileSync(basePath, 'utf-8').trim();
    if (baseRaw.length === 0) baseRaw = null;
  }

  const oursParsed = parseEntityMarkdown(oursRaw);
  const theirsParsed = parseEntityMarkdown(theirsRaw);
  const baseParsed = baseRaw ? parseEntityMarkdown(baseRaw) : null;

  const oursEntity: MergedMarkdownEntity = {
    ...oursParsed,
    relations: extractDirectionalRelations(oursRaw),
  };
  const theirsEntity: MergedMarkdownEntity = {
    ...theirsParsed,
    relations: extractDirectionalRelations(theirsRaw),
  };
  const baseEntity: MergedMarkdownEntity | null = baseParsed
    ? {
        ...baseParsed,
        relations: extractDirectionalRelations(baseRaw!),
      }
    : null;

  const merged = mergeParsedEntities(baseEntity, oursEntity, theirsEntity);
  const serialized = serializeParsedEntity(merged);

  fs.writeFileSync(destination, serialized, 'utf-8');

  return {
    success: true,
    outputPath: destination,
    entityName: merged.name,
    observationsCount: merged.observations.length,
    relationsCount: merged.relations.length,
  };
}
