import fs from 'node:fs';
import path from 'node:path';
import type { GraphSnapshot, RelationWithNames } from '../types.js';
import type { KnowledgeGraph } from '../graph.js';

function groupTitle(entityType: string): string {
  const normalized = entityType.trim().toLowerCase();
  if (normalized === 'person' || normalized === 'people') return 'People';
  if (normalized === 'tool') return 'Tools';
  if (normalized === 'project') return 'Projects';
  if (normalized === 'preference') return 'Preferences';
  if (normalized === 'skill') return 'Skills';
  return 'Concepts';
}

function relationSummary(entityName: string, relations: RelationWithNames[]): string {
  if (relations.length === 0) return '';
  return relations
    .map((relation) => {
      const other = relation.fromEntityName === entityName ? relation.toEntityName : relation.fromEntityName;
      return `${relation.relationType} → ${other}`;
    })
    .join(', ');
}

function renderMarkdown(snapshot: GraphSnapshot): string {
  const lines: string[] = [];
  lines.push('# Amneshia Memory Export');
  lines.push(`> Generated at ${new Date().toISOString()}`);
  lines.push('');

  const grouped = new Map<string, GraphSnapshot['entities']>();
  for (const entity of snapshot.entities) {
    const key = groupTitle(entity.entityType);
    const current = grouped.get(key) ?? [];
    current.push(entity);
    grouped.set(key, current);
  }

  for (const [title, entities] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`## ${title}`);
    for (const entity of entities) {
      lines.push(`### ${entity.name}`);
      if (entity.observations.length === 0) {
        lines.push('- No observations yet');
      } else {
        for (const observation of entity.observations) {
          lines.push(`- ${observation.content}`);
        }
      }
      if (entity.relations.length > 0) {
        const relationText = relationSummary(entity.name, entity.relations);
        lines.push(`**Relations:** ${relationText}`);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function resolveTargetPath(targetPath: string): string {
  if (targetPath.endsWith('.md')) {
    return targetPath;
  }
  return path.join(targetPath, 'MEMORY.md');
}

export function exportToMarkdown(graph: KnowledgeGraph, forceAll = false): Array<{ target: string; path: string }> {
  const targets = graph.manageExportTargets({ action: 'list' }) as Array<{ id: string; name: string; path: string; format: string; autoExport: boolean }>;
  const snapshot = graph.readGraph();
  const markdown = renderMarkdown(snapshot);
  const writes: Array<{ target: string; path: string }> = [];

  for (const target of targets) {
    if (target.format !== 'markdown') continue;
    if (!forceAll && !target.autoExport) continue;
    try {
      const outputPath = resolveTargetPath(target.path);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, markdown, 'utf8');
      writes.push({ target: target.name, path: outputPath });
    } catch (error) {
      console.warn(`Export target "${target.name}" failed:`, error instanceof Error ? error.message : error);
    }
  }

  return writes;
}
