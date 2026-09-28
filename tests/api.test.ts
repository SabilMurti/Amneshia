import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseLayer } from '../src/database.js';
import { KnowledgeGraph } from '../src/graph.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import { runMaintenance } from '../src/maintenance/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Server } from 'node:http';

describe('Amneshia REST API Integration Tests', () => {
  let db: DatabaseLayer;
  let graph: KnowledgeGraph;
  let testDir: string;
  let app: express.Express;
  let server: Server;
  let serverPort: number;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `amneshia-test-api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testDir, { recursive: true });
    db = new DatabaseLayer(testDir);
    graph = new KnowledgeGraph(db);

    // Set up Express application matching src/server.ts structure
    app = express();
    app.use(express.json());

    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', name: 'amneshia', version: '3.0.0' });
    });

    app.get('/api/graph', (req: Request, res: Response) => res.json(graph.readGraph(req.query.domain as string | undefined)));
    app.get('/api/search', (req: Request, res: Response) => res.json(graph.searchMemory((req.query.q as string) || '')));
    app.get('/api/stats', (_req: Request, res: Response) => res.json(graph.getStats()));

    app.post('/api/entities', (req: Request, res: Response) => {
      const entitiesInput = req.body.entities as Array<{ name: string; entityType: string; domain?: string; visibility?: string; allowedAgents?: string[] }>;
      res.json(graph.createEntities(entitiesInput));
    });

    app.delete('/api/entities', (req: Request, res: Response) => {
      const names = req.body.names as string[];
      res.json(graph.deleteEntities(names));
    });

    app.post('/api/observations', async (req: Request, res: Response) => {
      const obsInput = req.body.observations as Array<{ entityName: string; contents: string[]; source?: string; importance?: string; expiresAt?: string }>;
      res.json(await graph.addObservations(obsInput));
    });

    app.delete('/api/observations', (req: Request, res: Response) => {
      const ids = req.body.ids as string[];
      res.json(graph.deleteObservations(ids));
    });

    app.put('/api/observations', (req: Request, res: Response) => {
      const updateInput = req.body as any;
      res.json(graph.updateObservation(updateInput));
    });

    app.post('/api/relations', (req: Request, res: Response) => {
      const relationsInput = req.body.relations as Array<{ from: string; to: string; relationType: string }>;
      res.json(graph.createRelations(relationsInput));
    });

    app.delete('/api/relations', (req: Request, res: Response) => {
      const ids = req.body.ids as string[];
      res.json(graph.deleteRelations(ids));
    });

    app.post('/api/maintenance', (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { domain?: string } | undefined;
        const result = runMaintenance(graph, db, body?.domain);
        res.json({ ok: true, result });
      } catch (error) {
        next(error);
      }
    });

    // Start Express on an ephemeral/random port
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          serverPort = address.port;
        } else {
          serverPort = 3457;
        }
        resolve();
      });
      server.on('error', reject);
    });
  });

  afterEach(async () => {
    db.close();
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should respond to /health endpoint with version 3.0.0', async () => {
    const res = await fetch(`http://localhost:${serverPort}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; name: string; version: string };
    expect(body.status).toBe('ok');
    expect(body.name).toBe('amneshia');
    expect(body.version).toBe('3.0.0');
  });

  it('should support REST API operations for entities, observations, relations, and stats', async () => {
    // 1. Create entities
    const createEntitiesRes = await fetch(`http://localhost:${serverPort}/api/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entities: [
          { name: 'Sabil Murti', entityType: 'person', domain: 'personal' },
          { name: 'Amneshia', entityType: 'project', domain: 'work' },
        ],
      }),
    });
    expect(createEntitiesRes.status).toBe(200);
    const entities = (await createEntitiesRes.json()) as Array<{ id: string; name: string }>;
    expect(entities.length).toBe(2);

    // 2. Add observations
    const createObsRes = await fetch(`http://localhost:${serverPort}/api/observations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observations: [
          { entityName: 'Sabil Murti', contents: ['Sabil is the creator of Amneshia'], source: 'api' },
        ],
      }),
    });
    expect(createObsRes.status).toBe(200);
    const obsResults = (await createObsRes.json()) as Array<{ entityName: string; observationIds: string[] }>;
    expect(obsResults[0].entityName).toBe('Sabil Murti');
    expect(obsResults[0].observationIds.length).toBe(1);

    // 3. Create relations
    const createRelationsRes = await fetch(`http://localhost:${serverPort}/api/relations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relations: [{ from: 'Sabil Murti', to: 'Amneshia', relationType: 'creator_of' }],
      }),
    });
    expect(createRelationsRes.status).toBe(200);
    const relations = (await createRelationsRes.json()) as Array<{ relation: string }>;
    expect(relations.length).toBe(1);

    // 4. Query stats
    const statsRes = await fetch(`http://localhost:${serverPort}/api/stats`);
    expect(statsRes.status).toBe(200);
    const stats = (await statsRes.json()) as { totalEntities: number; totalObservations: number; totalRelations: number };
    expect(stats.totalEntities).toBe(2);
    expect(stats.totalObservations).toBe(1);
    expect(stats.totalRelations).toBe(1);

    // 5. Query graph
    const graphRes = await fetch(`http://localhost:${serverPort}/api/graph`);
    expect(graphRes.status).toBe(200);
    const graphData = (await graphRes.json()) as {
      entities: Array<{ name: string; observations: Array<{ content: string }> }>;
    };
    expect(graphData.entities.length).toBe(2);
    const sabilEntity = graphData.entities.find((e) => e.name === 'Sabil Murti');
    expect(sabilEntity).toBeDefined();
    expect(sabilEntity!.observations[0].content).toBe('Sabil is the creator of Amneshia');
  });

  it('should support deterministic memory maintenance', async () => {
    graph.createEntities([{ name: 'TestProject', entityType: 'project', domain: 'test' }]);
    await graph.addObservations([
      { entityName: 'TestProject', contents: ['Uses React for frontend', 'Uses React for frontend'], source: 'test' },
    ]);

    const maintenanceRes = await fetch(`http://localhost:${serverPort}/api/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(maintenanceRes.status).toBe(200);
    const data = (await maintenanceRes.json()) as { ok: boolean; result: { purgedCount: number; supersededCount: number } };
    expect(data.ok).toBe(true);
    expect(data.result.supersededCount).toBeGreaterThanOrEqual(1);
  });
});
