import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { DatabaseLayer } from '../src/database/index.js';
import { MemoryExporter } from '../src/export/index.js';

describe('MemoryExporter Tests', () => {
  let tempDir: string;
  let db: DatabaseLayer;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `amneshia-export-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    db = new DatabaseLayer(tempDir);

    // Seed test entities and observations
    const authEnt = db.createEntity({
      name: 'Auth Module',
      entityType: 'service',
      domain: 'backend',
      visibility: 'public',
    });

    db.addObservation(
      authEnt.id,
      'Uses JWT authentication with RS256 signing algorithm',
      'codebase',
      'high',
      0.95,
      undefined,
      'invariant'
    );

    db.addObservation(
      authEnt.id,
      'Session token expires in 15 minutes',
      'agent',
      'medium',
      0.85,
      undefined,
      'contextual'
    );

    const billingEnt = db.createEntity({
      name: 'Billing Gateway',
      entityType: 'service',
      domain: 'finance',
      visibility: 'restricted',
    });

    db.addObservation(
      billingEnt.id,
      'Stripe webhook listener requires idempotency keys',
      'docs',
      'critical',
      1.0,
      undefined,
      'architectural'
    );

    db.createRelation(authEnt.id, billingEnt.id, 'authenticates_for');
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should export all knowledge to an independent SQLite database', async () => {
    const exporter = new MemoryExporter(db);
    const exportPath = path.join(tempDir, 'exported.db');

    const result = await exporter.export('sqlite', exportPath);
    expect(result.format).toBe('sqlite');
    expect(result.entitiesCount).toBe(2);
    expect(result.observationsCount).toBe(3);
    expect(result.relationsCount).toBe(1);
    expect(fs.existsSync(exportPath)).toBe(true);

    // Verify exported database schema and contents
    const expDb = new Database(exportPath);
    const entities = expDb.prepare('SELECT * FROM entities ORDER BY name ASC').all() as any[];
    expect(entities.length).toBe(2);
    expect(entities[0].name).toBe('Auth Module');
    expect(entities[1].name).toBe('Billing Gateway');

    const obs = expDb.prepare('SELECT * FROM observations').all() as any[];
    expect(obs.length).toBe(3);

    const rels = expDb.prepare('SELECT * FROM relations').all() as any[];
    expect(rels.length).toBe(1);
    expect(rels[0].relation_type).toBe('authenticates_for');

    expDb.close();
  });

  it('should export all knowledge to a Markdown bundle directory with catalog', async () => {
    const exporter = new MemoryExporter(db);
    const exportDir = path.join(tempDir, 'markdown_bundle');

    const result = await exporter.export('markdown', exportDir);
    expect(result.format).toBe('markdown');
    expect(result.entitiesCount).toBe(2);
    expect(fs.existsSync(exportDir)).toBe(true);

    const indexPath = path.join(exportDir, 'index.md');
    expect(fs.existsSync(indexPath)).toBe(true);
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    expect(indexContent).toContain('Auth Module');
    expect(indexContent).toContain('Billing Gateway');

    const authFile = path.join(exportDir, 'backend', 'auth-module.md');
    expect(fs.existsSync(authFile)).toBe(true);
    const authContent = fs.readFileSync(authFile, 'utf-8');
    expect(authContent).toContain('Uses JWT authentication with RS256 signing algorithm');
  });

  it('should export knowledge graph to structured JSON', async () => {
    const exporter = new MemoryExporter(db);
    const jsonPath = path.join(tempDir, 'export.json');

    const result = await exporter.export('json', jsonPath);
    expect(result.format).toBe('json');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(parsed.formatVersion).toBe('3.0.0');
    expect(parsed.entities.length).toBe(2);
    const auth = parsed.entities.find((e: any) => e.name === 'Auth Module');
    expect(auth).toBeDefined();
    expect(auth.observations.length).toBe(2);
    expect(auth.relations.length).toBe(1);
  });

  it('should filter export by domain', async () => {
    const exporter = new MemoryExporter(db);
    const jsonPath = path.join(tempDir, 'filtered_domain.json');

    const result = await exporter.export('json', jsonPath, { domain: 'backend' });
    expect(result.entitiesCount).toBe(1);
    expect(result.observationsCount).toBe(2);

    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(parsed.entities[0].name).toBe('Auth Module');
  });

  it('should filter export by entity name list', async () => {
    const exporter = new MemoryExporter(db);
    const jsonPath = path.join(tempDir, 'filtered_entities.json');

    const result = await exporter.export('json', jsonPath, { entities: ['Billing Gateway'] });
    expect(result.entitiesCount).toBe(1);
    expect(result.observationsCount).toBe(1);

    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(parsed.entities[0].name).toBe('Billing Gateway');
  });

  it('should filter export by authority tier', async () => {
    const exporter = new MemoryExporter(db);
    const jsonPath = path.join(tempDir, 'filtered_tiers.json');

    // Only export 'invariant' observations
    const result = await exporter.export('json', jsonPath, { tiers: ['invariant'] });
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    const auth = parsed.entities.find((e: any) => e.name === 'Auth Module');
    expect(auth.observations.length).toBe(1);
    expect(auth.observations[0].content).toContain('RS256');

    const billing = parsed.entities.find((e: any) => e.name === 'Billing Gateway');
    expect(billing.observations.length).toBe(0);
  });

  it('should filter export by FTS5 text search query', async () => {
    const exporter = new MemoryExporter(db);
    const jsonPath = path.join(tempDir, 'filtered_fts.json');

    const result = await exporter.export('json', jsonPath, { query: 'idempotency' });
    expect(result.entitiesCount).toBe(1);
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(parsed.entities[0].name).toBe('Billing Gateway');
    expect(parsed.entities[0].observations[0].content).toContain('idempotency');
  });
});
