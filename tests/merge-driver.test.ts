import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  mergeParsedEntities,
  serializeParsedEntity,
  extractDirectionalRelations,
  mergeMarkdownFiles,
  type MergedMarkdownEntity,
} from '../src/cloud/merge-driver.js';
import { parseEntityMarkdown } from '../src/storage/markdown-store.js';

describe('Amneshia Smart Git Merge Driver', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amneshia-merge-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should extract relations with directional arrows correctly', () => {
    const markdown = `---
id: "ent-1"
name: "Entity 1"
type: "concept"
domain: "test"
---
## Observations
- **[contextual]** Observation A
  \`id: obs-1 | confidence: 1 | status: active\`

## Relations
- \`uses\` -> Cloudflare
- \`managed_by\` <- Admin User
`;

    const relations = extractDirectionalRelations(markdown);
    expect(relations).toHaveLength(2);
    expect(relations[0]).toEqual({
      relationType: 'uses',
      direction: '->',
      targetName: 'Cloudflare',
    });
    expect(relations[1]).toEqual({
      relationType: 'managed_by',
      direction: '<-',
      targetName: 'Admin User',
    });
  });

  it('should cleanly merge concurrent additions from both sides without conflict markers', () => {
    const base: MergedMarkdownEntity = {
      id: 'ent-123',
      name: 'Production Server',
      entityType: 'infrastructure',
      domain: 'backend',
      visibility: 'public',
      allowedAgents: ['agent-1'],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      observations: [
        {
          id: 'obs-base-1',
          content: 'Server running on Ubuntu 24.04 LTS.',
          authorityTier: 'architectural',
          confidence: 1.0,
          derivedFrom: [],
          status: 'active',
          supersedes: null,
        },
      ],
      relations: [
        {
          relationType: 'hosts',
          direction: '->',
          targetName: 'API Gateway',
        },
      ],
    };

    // Ours added observation 2 and relation to DB
    const ours: MergedMarkdownEntity = {
      ...base,
      updatedAt: '2026-10-02T10:00:00.000Z',
      allowedAgents: ['agent-1', 'agent-ours'],
      observations: [
        ...base.observations,
        {
          id: 'obs-ours-2',
          content: 'Added Nginx reverse proxy on port 443 with Let\'s Encrypt.',
          authorityTier: 'contextual',
          confidence: 1.0,
          derivedFrom: [],
          status: 'active',
          supersedes: null,
        },
      ],
      relations: [
        ...base.relations,
        {
          relationType: 'connects_to',
          direction: '->',
          targetName: 'PostgreSQL DB',
        },
      ],
    };

    // Theirs added observation 3 and relation to Cloudflare
    const theirs: MergedMarkdownEntity = {
      ...base,
      updatedAt: '2026-10-02T11:00:00.000Z',
      allowedAgents: ['agent-1', 'agent-theirs'],
      observations: [
        ...base.observations,
        {
          id: 'obs-theirs-3',
          content: 'Configured UFW firewall: open ports 22, 80, 443.',
          authorityTier: 'invariant',
          confidence: 0.95,
          derivedFrom: [],
          status: 'active',
          supersedes: null,
        },
      ],
      relations: [
        ...base.relations,
        {
          relationType: 'protected_by',
          direction: '->',
          targetName: 'Cloudflare',
        },
      ],
    };

    const merged = mergeParsedEntities(base, ours, theirs);

    expect(merged.name).toBe('Production Server');
    expect(merged.allowedAgents).toEqual(expect.arrayContaining(['agent-1', 'agent-ours', 'agent-theirs']));
    expect(merged.updatedAt).toBe('2026-10-02T11:00:00.000Z');

    // All 3 observations should be present
    expect(merged.observations).toHaveLength(3);
    const contents = merged.observations.map((o) => o.content);
    expect(contents).toContain('Server running on Ubuntu 24.04 LTS.');
    expect(contents).toContain('Added Nginx reverse proxy on port 443 with Let\'s Encrypt.');
    expect(contents).toContain('Configured UFW firewall: open ports 22, 80, 443.');

    // All 3 relations should be present
    expect(merged.relations).toHaveLength(3);
    const relTargets = merged.relations.map((r) => r.targetName);
    expect(relTargets).toContain('API Gateway');
    expect(relTargets).toContain('PostgreSQL DB');
    expect(relTargets).toContain('Cloudflare');
  });

  it('should take updated observation when modified in theirs while untouched in ours', () => {
    const base: MergedMarkdownEntity = {
      id: 'ent-1',
      name: 'Config',
      entityType: 'concept',
      domain: 'app',
      visibility: 'public',
      allowedAgents: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      observations: [
        {
          id: 'obs-1',
          content: 'Port configured to 8080.',
          authorityTier: 'contextual',
          confidence: 1.0,
          derivedFrom: [],
          status: 'active',
          supersedes: null,
        },
      ],
      relations: [],
    };

    // Ours unchanged
    const ours: MergedMarkdownEntity = { ...base };

    // Theirs changed status to stale and confidence to 0.8
    const theirs: MergedMarkdownEntity = {
      ...base,
      observations: [
        {
          id: 'obs-1',
          content: 'Port configured to 8080.',
          authorityTier: 'contextual',
          confidence: 0.8,
          derivedFrom: ['premise-99'],
          status: 'stale',
          supersedes: null,
        },
      ],
    };

    const merged = mergeParsedEntities(base, ours, theirs);
    expect(merged.observations).toHaveLength(1);
    expect(merged.observations[0].confidence).toBe(0.8);
    expect(merged.observations[0].derivedFrom).toContain('premise-99');
  });

  it('should deduplicate observations with identical content added independently with different IDs', () => {
    const ours: MergedMarkdownEntity = {
      id: 'ent-dedup',
      name: 'Dedup Test',
      entityType: 'concept',
      domain: 'test',
      visibility: 'public',
      allowedAgents: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      observations: [
        {
          id: 'uuid-termux-1',
          content: 'SQLite running in WAL mode with normal sync.',
          authorityTier: 'invariant',
          confidence: 1.0,
          derivedFrom: [],
          status: 'active',
          supersedes: null,
        },
      ],
      relations: [],
    };

    const theirs: MergedMarkdownEntity = {
      id: 'ent-dedup',
      name: 'Dedup Test',
      entityType: 'concept',
      domain: 'test',
      visibility: 'public',
      allowedAgents: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      observations: [
        {
          id: 'uuid-pc-2',
          content: 'SQLite running in WAL mode with normal sync.',
          authorityTier: 'architectural',
          confidence: 0.9,
          derivedFrom: ['premise-db'],
          status: 'active',
          supersedes: null,
        },
      ],
      relations: [],
    };

    const merged = mergeParsedEntities(null, ours, theirs);
    expect(merged.observations).toHaveLength(1);
    expect(merged.observations[0].content).toBe('SQLite running in WAL mode with normal sync.');
    // Invariant tier takes precedence over architectural
    expect(merged.observations[0].authorityTier).toBe('invariant');
    // Derived from is preserved
    expect(merged.observations[0].derivedFrom).toContain('premise-db');
  });

  it('should perform 3-way merge on physical markdown files', () => {
    const basePath = path.join(tempDir, 'base.md');
    const oursPath = path.join(tempDir, 'ours.md');
    const theirsPath = path.join(tempDir, 'theirs.md');

    const baseContent = `---
id: "file-test"
name: "File Test Entity"
type: "concept"
domain: "test"
visibility: "public"
allowed_agents: []
created: "2026-10-01T00:00:00.000Z"
updated: "2026-10-01T00:00:00.000Z"
---
## Observations
- **[invariant]** Fact 1 from base.
  \`id: obs-1 | confidence: 1 | status: active\`

## Relations
- \`rel1\` -> TargetA
`;

    const oursContent = `---
id: "file-test"
name: "File Test Entity"
type: "concept"
domain: "test"
visibility: "public"
allowed_agents: ["agent-ours"]
created: "2026-10-01T00:00:00.000Z"
updated: "2026-10-02T00:00:00.000Z"
---
## Observations
- **[invariant]** Fact 1 from base.
  \`id: obs-1 | confidence: 1 | status: active\`

- **[contextual]** Fact 2 added in ours.
  \`id: obs-2 | confidence: 1 | status: active\`

## Relations
- \`rel1\` -> TargetA
- \`rel2\` -> TargetOurs
`;

    const theirsContent = `---
id: "file-test"
name: "File Test Entity"
type: "concept"
domain: "test"
visibility: "public"
allowed_agents: ["agent-theirs"]
created: "2026-10-01T00:00:00.000Z"
updated: "2026-10-03T00:00:00.000Z"
---
## Observations
- **[invariant]** Fact 1 from base.
  \`id: obs-1 | confidence: 1 | status: active\`

- **[architectural]** Fact 3 added in theirs.
  \`id: obs-3 | confidence: 0.95 | status: active\`

## Relations
- \`rel1\` -> TargetA
- \`rel3\` <- TargetTheirs
`;

    fs.writeFileSync(basePath, baseContent, 'utf-8');
    fs.writeFileSync(oursPath, oursContent, 'utf-8');
    fs.writeFileSync(theirsPath, theirsContent, 'utf-8');

    const result = mergeMarkdownFiles(basePath, oursPath, theirsPath);
    expect(result.success).toBe(true);
    expect(result.observationsCount).toBe(3);
    expect(result.relationsCount).toBe(3);

    const mergedDisk = fs.readFileSync(oursPath, 'utf-8');
    expect(mergedDisk).not.toContain('<<<<<<<');
    expect(mergedDisk).not.toContain('>>>>>>>');
    expect(mergedDisk).not.toContain('=======');

    const parsed = parseEntityMarkdown(mergedDisk);
    expect(parsed.observations).toHaveLength(3);
    expect(parsed.relations).toHaveLength(3);
    expect(parsed.allowedAgents).toEqual(expect.arrayContaining(['agent-ours', 'agent-theirs']));
  });

  it('should resolve real git branch merge without conflict markers using setupMergeDriver', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    const gitDir = path.join(tempDir, 'git-repo');
    fs.mkdirSync(gitDir, { recursive: true });

    await exec('git', ['init', '-b', 'main'], { cwd: gitDir });
    await exec('git', ['config', 'user.name', 'Tester'], { cwd: gitDir });
    await exec('git', ['config', 'user.email', 'test@local'], { cwd: gitDir });

    // Setup merge driver in this repo
    const { setupMergeDriver } = await import('../src/cloud/git-sync.js');
    await setupMergeDriver(gitDir);

    const entityFile = path.join(gitDir, 'test-entity.md');
    const initialContent = `---
id: "git-test-1"
name: "Git Integration Test"
type: "concept"
domain: "test"
---
## Observations
- **[invariant]** Initial fact from base.
  \`id: obs-0 | confidence: 1 | status: active\`

## Relations
_No relations recorded yet._
`;
    fs.writeFileSync(entityFile, initialContent, 'utf-8');
    await exec('git', ['add', '.'], { cwd: gitDir });
    await exec('git', ['commit', '-m', 'initial commit'], { cwd: gitDir });

    // Branch 1: feature-ours
    await exec('git', ['checkout', '-b', 'feature-ours'], { cwd: gitDir });
    const oursContent = `---
id: "git-test-1"
name: "Git Integration Test"
type: "concept"
domain: "test"
---
## Observations
- **[invariant]** Initial fact from base.
  \`id: obs-0 | confidence: 1 | status: active\`

- **[contextual]** Branch Ours added this observation.
  \`id: obs-ours | confidence: 1 | status: active\`

## Relations
_No relations recorded yet._
`;
    fs.writeFileSync(entityFile, oursContent, 'utf-8');
    await exec('git', ['commit', '-am', 'commit on ours'], { cwd: gitDir });

    // Branch 2: feature-theirs
    await exec('git', ['checkout', 'main'], { cwd: gitDir });
    await exec('git', ['checkout', '-b', 'feature-theirs'], { cwd: gitDir });
    const theirsContent = `---
id: "git-test-1"
name: "Git Integration Test"
type: "concept"
domain: "test"
---
## Observations
- **[invariant]** Initial fact from base.
  \`id: obs-0 | confidence: 1 | status: active\`

- **[architectural]** Branch Theirs added this observation.
  \`id: obs-theirs | confidence: 0.95 | status: active\`

## Relations
_No relations recorded yet._
`;
    fs.writeFileSync(entityFile, theirsContent, 'utf-8');
    await exec('git', ['commit', '-am', 'commit on theirs'], { cwd: gitDir });

    // Switch back to feature-ours and merge feature-theirs
    await exec('git', ['checkout', 'feature-ours'], { cwd: gitDir });

    // Ensure driver points to compiled binary for maximum sub-millisecond speed
    const driverScript = path.resolve(__dirname, '../dist/index.js');
    await exec('git', ['config', 'merge.amneshia.driver', `node "${driverScript}" cloud merge-driver %O %A %B %P`], { cwd: gitDir });

    // Run git merge feature-theirs
    const mergeOutput = await exec('git', ['merge', 'feature-theirs', '--no-edit'], { cwd: gitDir });
    expect(mergeOutput.stdout).toContain('Merge made by the');

    const resultMarkdown = fs.readFileSync(entityFile, 'utf-8');
    expect(resultMarkdown).not.toContain('<<<<<<<');
    expect(resultMarkdown).not.toContain('>>>>>>>');

    const parsed = parseEntityMarkdown(resultMarkdown);
    expect(parsed.observations).toHaveLength(3);
    const contents = parsed.observations.map((o) => o.content);
    expect(contents).toContain('Initial fact from base.');
    expect(contents).toContain('Branch Ours added this observation.');
    expect(contents).toContain('Branch Theirs added this observation.');
  }, 25000);
});
