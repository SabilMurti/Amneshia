import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseLayer } from '../src/database.js';
import { KnowledgeGraph } from '../src/graph.js';
import { BridgeClientManager } from '../src/bridge/client.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import { syncBridgeMemories } from '../src/bridge/sync.js';
import { consolidateMemories } from '../src/consolidation/index.js';
import { setAIProvider } from '../src/ai/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Server } from 'node:http';

describe('Amneshia REST API Integration Tests', () => {
  let db: DatabaseLayer;
  let graph: KnowledgeGraph;
  let bridgeManager: BridgeClientManager;
  let testDir: string;
  let app: express.Express;
  let server: Server;
  let serverPort: number;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `amneshia-test-api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testDir, { recursive: true });
    db = new DatabaseLayer(testDir);
    graph = new KnowledgeGraph(db);
    bridgeManager = new BridgeClientManager();

    // Set up mock AI provider
    setAIProvider('none');

    // Set up Express application matching src/server.ts structure
    app = express();
    app.use(express.json());

    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', name: 'amneshia', version: '2.0.0' });
    });

    app.get('/api/graph', (req: Request, res: Response) => res.json(graph.readGraph(req.query.domain as string | undefined)));
    app.get('/api/search', (req: Request, res: Response) => res.json(graph.searchMemory(req.query.q as string || '')));
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
      const updateInput = req.body as { id: string; content: string; changedBy?: string };
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

    app.get('/api/bridge/servers', (_req: Request, res: Response) => res.json(db.getBridgeServers()));
    
    app.post('/api/bridge/servers', (req: Request, res: Response) => {
      const body = req.body as { name: string; command: string; args: string[] };
      res.json(db.addBridgeServer(body.name, body.command, body.args));
    });

    app.delete('/api/bridge/servers/:id', async (req: Request, res: Response) => {
      await bridgeManager.disconnectServer(req.params.id);
      res.json(db.removeBridgeServer(req.params.id));
    });

    app.post('/api/bridge/sync', async (_req: Request, res: Response) => {
      try {
        const stats = await syncBridgeMemories(graph, db, bridgeManager);
        res.json({ ok: true, stats });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });
    app.post('/api/consolidate', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as { domain?: string } | undefined;
        const result = await consolidateMemories(graph, db, body?.domain);
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
    await bridgeManager.disconnectAll();
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
  it('should respond to /health endpoint', async () => {
    const res = await fetch(`http://localhost:${serverPort}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; name: string; version: string };
    expect(body.status).toBe('ok');
    expect(body.name).toBe('amneshia');
    expect(body.version).toBe('2.0.0');
  });

  it('should support REST API operations for entities, observations, relations, and stats', async () => {
    // 1. Create entities
    const createEntitiesRes = await fetch(`http://localhost:${serverPort}/api/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entities: [
          { name: 'Sabil Murti', entityType: 'person', domain: 'personal' },
          { name: 'Amneshia', entityType: 'project', domain: 'work' }
        ]
      })
    });
    expect(createEntitiesRes.status).toBe(200);
    const entities = await createEntitiesRes.json() as Array<{ id: string; name: string }>;
    expect(entities.length).toBe(2);

    // 2. Add observations
    const createObsRes = await fetch(`http://localhost:${serverPort}/api/observations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observations: [
          { entityName: 'Sabil Murti', contents: ['Sabil is the creator of Amneshia'], source: 'api' }
        ]
      })
    });
    expect(createObsRes.status).toBe(200);
    const obsResults = await createObsRes.json() as Array<{ entityName: string; observationIds: string[] }>;
    expect(obsResults[0].entityName).toBe('Sabil Murti');
    expect(obsResults[0].observationIds.length).toBe(1);

    // 3. Create relations
    const createRelationsRes = await fetch(`http://localhost:${serverPort}/api/relations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relations: [
          { from: 'Sabil Murti', to: 'Amneshia', relationType: 'creator_of' }
        ]
      })
    });
    expect(createRelationsRes.status).toBe(200);
    const relations = await createRelationsRes.json() as Array<{ relation: string }>;
    expect(relations.length).toBe(1);

    // 4. Query stats
    const statsRes = await fetch(`http://localhost:${serverPort}/api/stats`);
    expect(statsRes.status).toBe(200);
    const stats = await statsRes.json() as { totalEntities: number; totalObservations: number; totalRelations: number };
    expect(stats.totalEntities).toBe(2);
    expect(stats.totalObservations).toBe(1);
    expect(stats.totalRelations).toBe(1);

    // 5. Query graph
    const graphRes = await fetch(`http://localhost:${serverPort}/api/graph`);
    expect(graphRes.status).toBe(200);
    const graphData = await graphRes.json() as { entities: Array<{ name: string; observations: Array<{ content: string }> }> };
    expect(graphData.entities.length).toBe(2);
    const sabilEntity = graphData.entities.find(e => e.name === 'Sabil Murti');
    expect(sabilEntity).toBeDefined();
    expect(sabilEntity!.observations[0].content).toBe('Sabil is the creator of Amneshia');
  });

  it('should support bridge management, bridge sync, and memory consolidation', async () => {
    // 1. Add bridge server
    const addBridgeRes = await fetch(`http://localhost:${serverPort}/api/bridge/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'codebase-memory-mcp',
        command: 'node',
        args: ['/path/to/codebase-memory-mcp/dist/index.js']
      })
    });
    expect(addBridgeRes.status).toBe(200);
    const bridgeServer = await addBridgeRes.json() as { id: string; name: string };
    expect(bridgeServer.name).toBe('codebase-memory-mcp');

    // 2. Sync bridge
    const mockListProjectsResponse = {
      projects: [
        {
          name: 'Amneshia-Core',
          root_path: '/home/murtix/projects/Amneshia',
          nodes: 10,
          edges: 20,
          git: {
            branch: 'main',
            head_sha: '1234567'
          }
        }
      ]
    };
    vi.spyOn(bridgeManager, 'callTool').mockResolvedValue(mockListProjectsResponse);

    const syncRes = await fetch(`http://localhost:${serverPort}/api/bridge/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(syncRes.status).toBe(200);
    const syncData = await syncRes.json() as { ok: boolean; stats: { projectsSynced: string[]; observationsAdded: number } };
    expect(syncData.ok).toBe(true);
    expect(syncData.stats.projectsSynced).toEqual(['Amneshia']);

    // 3. Consolidate memories
    const consolidateRes = await fetch(`http://localhost:${serverPort}/api/consolidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(consolidateRes.status).toBe(200);
    const consolidateData = await consolidateRes.json() as { ok: boolean; result: { purgedCount: number } };
    expect(consolidateData.ok).toBe(true);
  });

  it('should support switching to 9router AI provider', () => {
    const provider = setAIProvider('9router');
    expect(provider.name).toBe('9router');
  });
});
