import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseLayer } from '../src/database/index.js';
import { KnowledgeGraph } from '../src/graph.js';
import {
  serializeEntity,
  parseEntityMarkdown,
  saveEntityMarkdown,
  deleteEntityMarkdown,
  loadAllEntityMarkdowns,
} from '../src/storage/markdown-store.js';
import { reindexFromMarkdown } from '../src/storage/reindex.js';
import { DualWriteSync, initAmneshiaProject } from '../src/storage/index.js';
import type { Entity, Observation, RelationWithNames } from '../src/types.js';

describe('Storage Layer Tests (Markdown-as-Truth)', () => {
  let tempDir: string;
  let knowledgeDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `amneshia-storage-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    knowledgeDir = path.join(tempDir, 'knowledge');
    fs.mkdirSync(knowledgeDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should serialize entity with observations and relations to markdown and parse back', () => {
    const entity: Entity = {
      id: 'ent-123',
      name: 'React Architecture',
      entityType: 'concept',
      domain: 'project:frontend',
      visibility: 'public',
      allowedAgents: ['agent-1', 'agent-2'],
      createdAt: '2026-09-28T10:00:00.000Z',
      updatedAt: '2026-09-28T12:00:00.000Z',
    };

    const observations: Observation[] = [
      {
        id: 'obs-001',
        entityId: 'ent-123',
        content: 'Uses Next.js App Router for server rendering',
        source: 'docs',
        importance: 'high',
        confidence: 0.95,
        authorityTier: 'architectural',
        derivedFrom: [],
        accessCount: 5,
        lastAccessedAt: '2026-09-28T12:00:00.000Z',
        status: 'active',
        expiresAt: null,
        supersedes: null,
        createdAt: '2026-09-28T10:00:00.000Z',
        updatedAt: '2026-09-28T10:00:00.000Z',
      },
      {
        id: 'obs-002',
        entityId: 'ent-123',
        content: 'Configured Tailwind CSS with custom theme',
        source: 'codebase',
        importance: 'normal',
        confidence: 0.9,
        authorityTier: 'contextual',
        derivedFrom: ['obs-001'],
        accessCount: 1,
        lastAccessedAt: null,
        status: 'active',
        expiresAt: null,
        supersedes: null,
        createdAt: '2026-09-28T11:00:00.000Z',
        updatedAt: '2026-09-28T11:00:00.000Z',
      },
      {
        id: 'obs-003',
        entityId: 'ent-123',
        content: 'Legacy CSS modules',
        source: 'manual',
        importance: 'low',
        confidence: 0.5,
        authorityTier: 'contextual',
        derivedFrom: [],
        accessCount: 0,
        lastAccessedAt: null,
        status: 'superseded',
        expiresAt: null,
        supersedes: 'obs-002',
        createdAt: '2026-09-28T09:00:00.000Z',
        updatedAt: '2026-09-28T11:00:00.000Z',
      },
    ];

    const relations: RelationWithNames[] = [
      {
        id: 'rel-1',
        fromEntity: 'ent-123',
        fromEntityName: 'React Architecture',
        toEntity: 'ent-456',
        toEntityName: 'Vercel Deployment',
        relationType: 'deployed_on',
        createdAt: '2026-09-28T10:00:00.000Z',
      },
    ];

    const markdown = serializeEntity(entity, observations, relations);
    expect(markdown).toContain('name: "React Architecture"');
    expect(markdown).toContain('**[architectural]** Uses Next.js App Router');
    expect(markdown).toContain('derived_from: [obs-001]');
    expect(markdown).toContain('~~**[contextual]** Legacy CSS modules~~');
    expect(markdown).toContain('`deployed_on` -> Vercel Deployment');

    const parsed = parseEntityMarkdown(markdown);
    expect(parsed.name).toBe('React Architecture');
    expect(parsed.entityType).toBe('concept');
    expect(parsed.domain).toBe('project:frontend');
    expect(parsed.allowedAgents).toEqual(['agent-1', 'agent-2']);
    expect(parsed.observations.length).toBe(3);
    expect(parsed.observations[0].content).toBe('Uses Next.js App Router for server rendering');
    expect(parsed.observations[0].authorityTier).toBe('architectural');
    expect(parsed.observations[1].derivedFrom).toEqual(['obs-001']);
    expect(parsed.observations[2].status).toBe('superseded');
    expect(parsed.relations.length).toBe(1);
    expect(parsed.relations[0].relationType).toBe('deployed_on');
    expect(parsed.relations[0].targetName).toBe('Vercel Deployment');
  });

  it('should save and delete entity markdown files in domain folders', () => {
    const entity: Entity = {
      id: 'e1',
      name: 'Auth Service',
      entityType: 'service',
      domain: 'backend:auth',
      visibility: 'public',
      allowedAgents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedPath = saveEntityMarkdown(knowledgeDir, entity, [], []);
    expect(fs.existsSync(savedPath)).toBe(true);
    expect(savedPath).toContain('auth-service.md');

    const all = loadAllEntityMarkdowns(knowledgeDir);
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('Auth Service');

    const deleted = deleteEntityMarkdown(knowledgeDir, entity.domain, entity.name);
    expect(deleted).toBe(true);
    expect(fs.existsSync(savedPath)).toBe(false);
  });

  it('should reindex markdown files into a fresh database', () => {
    // 1. Manually write 2 entity markdown files
    const entityA: Entity = {
      id: 'ea',
      name: 'NestJS Framework',
      entityType: 'technology',
      domain: 'backend',
      visibility: 'public',
      allowedAgents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const obsA: Observation[] = [
      {
        id: 'ob-a1',
        entityId: 'ea',
        content: 'Provides dependency injection architecture',
        source: 'docs',
        importance: 'normal',
        confidence: 1,
        authorityTier: 'architectural',
        derivedFrom: [],
        accessCount: 0,
        lastAccessedAt: null,
        status: 'active',
        expiresAt: null,
        supersedes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    saveEntityMarkdown(knowledgeDir, entityA, obsA, []);

    const entityB: Entity = {
      id: 'eb',
      name: 'Fastify Server',
      entityType: 'technology',
      domain: 'backend',
      visibility: 'public',
      allowedAgents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const relB: RelationWithNames[] = [
      {
        id: 'rel-ab',
        fromEntity: 'eb',
        fromEntityName: 'Fastify Server',
        toEntity: 'ea',
        toEntityName: 'NestJS Framework',
        relationType: 'used_by',
        createdAt: new Date().toISOString(),
      },
    ];
    saveEntityMarkdown(knowledgeDir, entityB, [], relB);

    // 2. Open a brand new empty database
    const db = new DatabaseLayer(path.join(tempDir, 'db'));
    expect(db.getStats().totalEntities).toBe(0);

    // 3. Reindex
    const result = reindexFromMarkdown(knowledgeDir, db);
    expect(result.entities).toBe(2);
    expect(result.observations).toBe(1);
    expect(result.relations).toBe(1);

    // 4. Verify SQLite state
    const loadedEntity = db.getEntityByName('NestJS Framework');
    expect(loadedEntity).not.toBeNull();
    const loadedObs = db.getObservationsByEntity(loadedEntity!.id);
    expect(loadedObs.length).toBe(1);
    expect(loadedObs[0].content).toBe('Provides dependency injection architecture');
    expect(loadedObs[0].authorityTier).toBe('architectural');

    const searchHits = db.searchFTS('dependency injection');
    expect(searchHits.length).toBe(1);
    expect(searchHits[0].entity.name).toBe('NestJS Framework');

    db.close();
  });

  it('should support dual-write synchronization via KnowledgeGraph', async () => {
    const db = new DatabaseLayer(path.join(tempDir, 'db-dual'));
    const dualWrite = new DualWriteSync(knowledgeDir, db);
    const graph = new KnowledgeGraph(db, dualWrite);

    // Mutate graph
    graph.createEntities([
      {
        name: 'Design System',
        entityType: 'guidelines',
        domain: 'ui',
      },
    ]);

    await graph.addObservations([
      {
        entityName: 'Design System',
        contents: ['Use 8px grid spacing across all layouts'],
        authorityTier: 'invariant',
      },
    ]);

    // Check that markdown file was automatically written!
    const allMarkdown = loadAllEntityMarkdowns(knowledgeDir);
    expect(allMarkdown.length).toBe(1);
    expect(allMarkdown[0].name).toBe('Design System');
    expect(allMarkdown[0].observations[0].content).toBe('Use 8px grid spacing across all layouts');
    expect(allMarkdown[0].observations[0].authorityTier).toBe('invariant');

    db.close();
  });

  it('should initialize a new Amneshia project directory with initAmneshiaProject', () => {
    const projectDir = path.join(tempDir, 'sample-project');
    const { dataDir, knowledgeDir: kd } = initAmneshiaProject(projectDir);

    expect(fs.existsSync(dataDir)).toBe(true);
    expect(fs.existsSync(kd)).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, '.gitignore'))).toBe(true);

    const gitignoreContent = fs.readFileSync(path.join(dataDir, '.gitignore'), 'utf-8');
    expect(gitignoreContent).toContain('*.db');
  });
});
