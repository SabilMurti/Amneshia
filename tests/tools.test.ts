import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DatabaseLayer } from '../src/database/index.js';
import { KnowledgeGraph } from '../src/graph.js';
import { registerTools } from '../src/tools/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Tools Redesign Tests (Core & Full Profiles)', () => {
  let db: DatabaseLayer;
  let graph: KnowledgeGraph;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `amneshia-test-tools-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testDir, { recursive: true });
    db = new DatabaseLayer(testDir);
    graph = new KnowledgeGraph(db);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should register only 4 core tools when profile is core', () => {
    const server = new McpServer({ name: 'TestCore', version: '3.0.0' });
    registerTools(server, graph, db, 'core');

    // Access registered tools map on server instance
    const registered = (server as any)._registeredTools;
    const toolNames = Object.keys(registered);

    expect(toolNames).toHaveLength(4);
    expect(toolNames).toContain('remember');
    expect(toolNames).toContain('recall');
    expect(toolNames).toContain('forget');
    expect(toolNames).toContain('context');
  });

  it('should register core and admin tools when profile is full', () => {
    const server = new McpServer({ name: 'TestFull', version: '3.0.0' });
    registerTools(server, graph, db, 'full');

    const registered = (server as any)._registeredTools;
    const toolNames = Object.keys(registered);

    expect(toolNames.length).toBeGreaterThanOrEqual(12);
    expect(toolNames).toContain('remember');
    expect(toolNames).toContain('recall');
    expect(toolNames).toContain('forget');
    expect(toolNames).toContain('context');
    expect(toolNames).toContain('create_entities');
    expect(toolNames).toContain('create_relations');
    expect(toolNames).toContain('add_observations');
    expect(toolNames).toContain('update_observation');
  });

  it('should remember facts, auto-create entity, and recall with token budget', async () => {
    const server = new McpServer({ name: 'TestMemory', version: '3.0.0' });
    registerTools(server, graph, db, 'core');

    const tools = (server as any)._registeredTools;

    // 1. remember tool execution
    const rememberHandler = tools['remember'].handler;
    const remResult = await rememberHandler({
      entity: 'Backend Architecture',
      facts: ['Uses Fastify for high throughput HTTP', 'PostgreSQL database with Prisma ORM'],
      tier: 'architectural',
    });

    const parsedRem = JSON.parse(remResult.content[0].text);
    expect(parsedRem.ok).toBe(true);
    expect(parsedRem.entity).toBe('Backend Architecture');
    expect(parsedRem.observationIds.length).toBe(2);

    // Verify entity was created in db
    const ent = db.getEntityByName('Backend Architecture');
    expect(ent).not.toBeNull();

    // 2. recall tool execution
    const recallHandler = tools['recall'].handler;
    const recallResult = await recallHandler({
      query: 'Fastify',
      token_budget: 1000,
    });

    const parsedRecall = JSON.parse(recallResult.content[0].text);
    expect(parsedRecall.ok).toBe(true);
    expect(parsedRecall.results.length).toBeGreaterThan(0);
    expect(parsedRecall.results[0].facts[0].content).toContain('Fastify');
    expect(parsedRecall.results[0].facts[0].tier).toBe('architectural');
  });

  it('should forget observation and entity with cascading invalidation', async () => {
    const server = new McpServer({ name: 'TestForget', version: '3.0.0' });
    registerTools(server, graph, db, 'core');
    const tools = (server as any)._registeredTools;

    // Create base entity & facts
    const ent = db.createEntity({ name: 'Cloud Provider', entityType: 'infra' });
    const obsBase = db.addObservation(ent.id, 'Hosted on AWS us-east-1', undefined, 'high', 1, undefined, 'invariant');
    const obsDerived = db.addObservation(
      ent.id,
      'S3 bucket configured in us-east-1',
      undefined,
      'normal',
      1,
      undefined,
      'architectural',
      [obsBase.id]
    );

    const forgetHandler = tools['forget'].handler;

    // Soft forget base observation with cascade
    const forgetResult = await forgetHandler({
      target: obsBase.id,
      hard: false,
      cascade: true,
    });

    const parsed = JSON.parse(forgetResult.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.mode).toBe('invalidated');
    expect(parsed.cascadedStaleCount).toBe(1);

    const baseStatus = db.getObservationById(obsBase.id);
    const derivedStatus = db.getObservationById(obsDerived.id);
    expect(baseStatus?.status).toBe('invalidated');
    expect(derivedStatus?.status).toBe('stale');
  });
});
