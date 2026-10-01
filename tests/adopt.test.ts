import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseLayer } from '../src/database/index.js';
import { adoptMemory } from '../src/storage/adopt.js';
import { DualWriteSync } from '../src/storage/index.js';

describe('Project Memory Adoption Tests', () => {
  let tempBase: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    tempBase = path.join(os.tmpdir(), `amneshia-adopt-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    sourceDir = path.join(tempBase, 'global_source');
    targetDir = path.join(tempBase, 'project_target');

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    // Seed source database
    const srcDb = new DatabaseLayer(sourceDir);
    const ent1 = srcDb.createEntity({
      name: 'Agent Architecture',
      entityType: 'architecture',
      domain: 'project:core',
      visibility: 'public',
    });

    srcDb.addObservation(
      ent1.id,
      'Uses decoupled event bus for agent communications',
      'docs',
      'high',
      0.9,
      undefined,
      'architectural'
    );

    srcDb.addObservation(
      ent1.id,
      'Max retry limit is configured to 5 attempts',
      'runtime',
      'medium',
      0.8,
      undefined,
      'contextual'
    );

    const ent2 = srcDb.createEntity({
      name: 'Global User Preferences',
      entityType: 'user_pref',
      domain: 'user',
      visibility: 'private',
    });

    srcDb.addObservation(
      ent2.id,
      'Prefers dark mode and concise log outputs',
      'user',
      'high',
      1.0,
      undefined,
      'contextual'
    );

    srcDb.createRelation(ent1.id, ent2.id, 'configured_by');

    // Dual-write to markdown in source
    const srcSync = new DualWriteSync(path.join(sourceDir, 'knowledge'), srcDb);
    srcSync.syncAll();
    srcDb.close();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {}
  });

  it('should adopt all entities and observations into target repository', async () => {
    const res = await adoptMemory({
      sourceDataDir: sourceDir,
      targetDataDir: targetDir,
      all: true,
    });

    expect(res.dryRun).toBe(false);
    expect(res.entitiesAdopted.length).toBe(2);
    expect(res.observationsAdopted).toBe(3);
    expect(res.relationsAdopted).toBe(1);
    expect(res.skippedDuplicates).toBe(0);

    // Verify target database
    const tgtDb = new DatabaseLayer(targetDir);
    const ent = tgtDb.getEntityByName('Agent Architecture');
    expect(ent).toBeDefined();
    const obs = tgtDb.getObservationsByEntity(ent!.id);
    expect(obs.length).toBe(2);
    expect(obs[0].authorityTier).toBe('architectural');

    // Verify target markdown files were written
    const targetMd = path.join(targetDir, 'knowledge', 'project-core', 'agent-architecture.md');
    expect(fs.existsSync(targetMd)).toBe(true);

    tgtDb.close();
  });

  it('should filter adoption by domain', async () => {
    const res = await adoptMemory({
      sourceDataDir: sourceDir,
      targetDataDir: targetDir,
      domain: 'project:core',
    });

    expect(res.entitiesAdopted.length).toBe(1);
    expect(res.entitiesAdopted[0]).toBe('Agent Architecture');
    expect(res.observationsAdopted).toBe(2);

    const tgtDb = new DatabaseLayer(targetDir);
    expect(tgtDb.getEntityByName('Global User Preferences')).toBeNull();
    expect(tgtDb.getEntityByName('Agent Architecture')).toBeDefined();
    tgtDb.close();
  });

  it('should filter adoption by entity names', async () => {
    const res = await adoptMemory({
      sourceDataDir: sourceDir,
      targetDataDir: targetDir,
      entities: ['Global User Preferences'],
    });

    expect(res.entitiesAdopted.length).toBe(1);
    expect(res.entitiesAdopted[0]).toBe('Global User Preferences');
    expect(res.observationsAdopted).toBe(1);

    const tgtDb = new DatabaseLayer(targetDir);
    expect(tgtDb.getEntityByName('Agent Architecture')).toBeNull();
    expect(tgtDb.getEntityByName('Global User Preferences')).toBeDefined();
    tgtDb.close();
  });

  it('should detect duplicate observations and skip them idempotently', async () => {
    // First adoption
    await adoptMemory({
      sourceDataDir: sourceDir,
      targetDataDir: targetDir,
      all: true,
    });

    // Second adoption on same target
    const res2 = await adoptMemory({
      sourceDataDir: sourceDir,
      targetDataDir: targetDir,
      all: true,
    });

    expect(res2.observationsAdopted).toBe(0);
    expect(res2.skippedDuplicates).toBe(3);
  });

  it('should support dry-run mode without modifying target files or database', async () => {
    const res = await adoptMemory({
      sourceDataDir: sourceDir,
      targetDataDir: targetDir,
      all: true,
      dryRun: true,
    });

    expect(res.dryRun).toBe(true);
    expect(res.entitiesAdopted.length).toBe(2);
    expect(res.observationsAdopted).toBe(3);

    // Target database file should not exist
    expect(fs.existsSync(path.join(targetDir, 'amneshia.db'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'knowledge'))).toBe(false);
  });

  it('should support move mode by removing adopted observations from source', async () => {
    const res = await adoptMemory({
      sourceDataDir: sourceDir,
      targetDataDir: targetDir,
      domain: 'project:core',
      move: true,
    });

    expect(res.observationsAdopted).toBe(2);

    // Check source database - Agent Architecture entity should be removed
    const srcDb = new DatabaseLayer(sourceDir);
    const ent = srcDb.getEntityByName('Agent Architecture');
    expect(ent).toBeNull();

    // User preferences should still exist in source
    const userEnt = srcDb.getEntityByName('Global User Preferences');
    expect(srcDb.getObservationsByEntity(userEnt!.id).length).toBe(1);
    srcDb.close();
  });
});
