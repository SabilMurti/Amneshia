import fs from 'node:fs';
import path from 'node:path';
import type { AuthorityTier, Entity, MediaAsset, Observation, ObservationStatus, RelationWithNames } from '../types.js';
import { toSlug } from './slug.js';

export interface ParsedObservation {
  id: string;
  content: string;
  authorityTier: AuthorityTier;
  derivedFrom: string[];
  confidence: number;
  status: ObservationStatus;
  supersedes: string | null;
}

export interface ParsedRelation {
  relationType: string;
  targetName: string;
}

export interface ParsedMarkdownMedia {
  sha256: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  relativePath: string;
}

export interface ParsedMarkdownEntity {
  id: string;
  name: string;
  entityType: string;
  domain: string;
  visibility: string;
  allowedAgents: string[];
  createdAt: string;
  updatedAt: string;
  observations: ParsedObservation[];
  relations: ParsedRelation[];
  media?: ParsedMarkdownMedia;
}

export function serializeEntity(
  entity: Entity,
  observations: Observation[],
  relations: RelationWithNames[],
  media?: MediaAsset | ParsedMarkdownMedia | null
): string {
  const frontmatterLines = [
    '---',
    `id: ${JSON.stringify(entity.id)}`,
    `name: ${JSON.stringify(entity.name)}`,
    `type: ${JSON.stringify(entity.entityType)}`,
    `domain: ${JSON.stringify(entity.domain)}`,
    `visibility: ${JSON.stringify(entity.visibility)}`,
    `allowed_agents: ${JSON.stringify(entity.allowedAgents)}`,
    `created: ${JSON.stringify(entity.createdAt)}`,
    `updated: ${JSON.stringify(entity.updatedAt)}`,
  ];

  if (media) {
    frontmatterLines.push('media:');
    frontmatterLines.push(`  sha256: ${JSON.stringify(media.sha256)}`);
    frontmatterLines.push(`  mime_type: ${JSON.stringify(media.mimeType)}`);
    frontmatterLines.push(`  file_name: ${JSON.stringify(media.fileName)}`);
    frontmatterLines.push(`  file_size: ${media.fileSize}`);
    frontmatterLines.push(`  relative_path: ${JSON.stringify(media.relativePath)}`);
  }

  frontmatterLines.push('---');
  const frontmatter = frontmatterLines.join('\n');

  const obsLines: string[] = [];
  for (const obs of observations) {
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
  for (const rel of relations) {
    const target = rel.fromEntity === entity.id ? rel.toEntityName : rel.fromEntityName;
    const direction = rel.fromEntity === entity.id ? '->' : '<-';
    relLines.push(`- \`${rel.relationType}\` ${direction} ${target}`);
  }

  const sections = [frontmatter];

  if (media) {
    if (media.mimeType.startsWith('image/')) {
      sections.push(`\n![${media.fileName}](../${media.relativePath})\n`);
    } else {
      sections.push(`\n[${media.fileName}](../${media.relativePath}) *(${media.mimeType}, ${media.fileSize} bytes)*\n`);
    }
  }

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

export function parseEntityMarkdown(content: string): ParsedMarkdownEntity {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid markdown entity format: missing frontmatter');
  }

  const frontmatterStr = match[1];
  const bodyStr = match[2];

  const getFrontmatterValue = (key: string): string | null => {
    const fieldMatch = frontmatterStr.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    if (!fieldMatch) return null;
    let val = fieldMatch[1].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    return val;
  };

  const id = getFrontmatterValue('id') || '';
  const name = getFrontmatterValue('name') || '';
  const entityType = getFrontmatterValue('type') || 'concept';
  const domain = getFrontmatterValue('domain') || 'personal';
  const visibility = getFrontmatterValue('visibility') || 'public';
  const createdAt = getFrontmatterValue('created') || new Date().toISOString();
  const updatedAt = getFrontmatterValue('updated') || new Date().toISOString();

  let allowedAgents: string[] = [];
  const rawAgents = getFrontmatterValue('allowed_agents');
  if (rawAgents) {
    try {
      allowedAgents = JSON.parse(rawAgents);
    } catch {
      allowedAgents = [];
    }
  }

  let media: ParsedMarkdownMedia | undefined;
  if (frontmatterStr.includes('media:')) {
    const getMediaField = (field: string): string | null => {
      const m = frontmatterStr.match(new RegExp(`^[ \\t]+${field}:\\s*(.*)$`, 'm'));
      if (!m) return null;
      let val = m[1].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val;
    };
    const sha256 = getMediaField('sha256');
    const mimeType = getMediaField('mime_type');
    const fileName = getMediaField('file_name');
    const fileSizeStr = getMediaField('file_size');
    const relativePath = getMediaField('relative_path');

    if (sha256 && relativePath) {
      media = {
        sha256,
        mimeType: mimeType || 'application/octet-stream',
        fileName: fileName || path.basename(relativePath),
        fileSize: fileSizeStr ? parseInt(fileSizeStr, 10) || 0 : 0,
        relativePath,
      };
    }
  }

  const observations: ParsedObservation[] = [];
  const relations: ParsedRelation[] = [];

  // Parse sections
  const obsSectionMatch = bodyStr.match(/## Observations\r?\n([\s\S]*?)(?=\r?\n## Relations|$)/i);
  if (obsSectionMatch) {
    const obsBlock = obsSectionMatch[1];
    const items = obsBlock.split(/(?:^|\n)- /m).filter((item) => item.trim() && !item.includes('_No observations'));

    for (const item of items) {
      const lines = item.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      let contentLine = lines[0];
      const isStrikethrough = contentLine.startsWith('~~') && contentLine.endsWith('~~');
      if (isStrikethrough) {
        contentLine = contentLine.slice(2, -2);
      }

      let authorityTier: AuthorityTier = 'contextual';
      const tierMatch = contentLine.match(/^\*\*\[(invariant|architectural|contextual|ephemeral)\]\*\*\s*(.*)$/);
      let factContent = contentLine;
      if (tierMatch) {
        authorityTier = tierMatch[1] as AuthorityTier;
        factContent = tierMatch[2];
      }

      let obsId = '';
      let confidence = 1.0;
      let status: ObservationStatus = isStrikethrough ? 'superseded' : 'active';
      let derivedFrom: string[] = [];
      let supersedes: string | null = null;

      if (lines.length > 1 && lines[1].startsWith('`') && lines[1].endsWith('`')) {
        const metaStr = lines[1].slice(1, -1);
        const parts = metaStr.split('|').map((p) => p.trim());
        for (const part of parts) {
          const [k, ...vParts] = part.split(':').map((p) => p.trim());
          const v = vParts.join(':').trim();
          if (k === 'id') obsId = v;
          else if (k === 'confidence') confidence = parseFloat(v) || 1.0;
          else if (k === 'status') status = v as ObservationStatus;
          else if (k === 'superseded_by') supersedes = v;
          else if (k === 'derived_from') {
            const arrMatch = v.match(/\[(.*)\]/);
            if (arrMatch && arrMatch[1]) {
              derivedFrom = arrMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
            }
          }
        }
      }

      if (factContent) {
        observations.push({
          id: obsId,
          content: factContent,
          authorityTier,
          derivedFrom,
          confidence,
          status,
          supersedes,
        });
      }
    }
  }

  const relSectionMatch = bodyStr.match(/## Relations\r?\n([\s\S]*?)$/i);
  if (relSectionMatch) {
    const relBlock = relSectionMatch[1];
    const lines = relBlock.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- `'));
    for (const line of lines) {
      const relMatch = line.match(/^- `(.*?)`\s*(?:->|<-)\s*(.*)$/);
      if (relMatch) {
        relations.push({
          relationType: relMatch[1],
          targetName: relMatch[2].trim(),
        });
      }
    }
  }

  return {
    id,
    name,
    entityType,
    domain,
    visibility,
    allowedAgents,
    createdAt,
    updatedAt,
    observations,
    relations,
    media,
  };
}

export function getEntityFilePath(knowledgeDir: string, domain: string, name: string): string {
  const domainSlug = toSlug(domain);
  const nameSlug = toSlug(name);
  const resolvedBase = path.resolve(knowledgeDir);
  const targetPath = path.resolve(resolvedBase, domainSlug, `${nameSlug}.md`);
  if (!targetPath.startsWith(resolvedBase + path.sep)) {
    throw new Error('Path traversal violation: entity file path escapes knowledge directory.');
  }
  return targetPath;
}

export function saveEntityMarkdown(
  knowledgeDir: string,
  entity: Entity,
  observations: Observation[],
  relations: RelationWithNames[],
  media?: MediaAsset | ParsedMarkdownMedia | null
): string {
  const filePath = getEntityFilePath(knowledgeDir, entity.domain, entity.name);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const content = serializeEntity(entity, observations, relations, media);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function deleteEntityMarkdown(knowledgeDir: string, domain: string, name: string): boolean {
  const filePath = getEntityFilePath(knowledgeDir, domain, name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

export function loadAllEntityMarkdowns(knowledgeDir: string): ParsedMarkdownEntity[] {
  if (!fs.existsSync(knowledgeDir)) {
    return [];
  }

  const results: ParsedMarkdownEntity[] = [];

  function scan(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'blobs' || entry.name.startsWith('.')) {
          continue;
        }
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const parsed = parseEntityMarkdown(content);
          results.push(parsed);
        } catch (e) {
          console.warn(`Failed to parse markdown entity at ${fullPath}:`, e);
        }
      }
    }
  }

  scan(knowledgeDir);
  return results;
}
