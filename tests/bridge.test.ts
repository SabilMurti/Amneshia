import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseLayer } from '../src/database.js';
import { KnowledgeGraph } from '../src/graph.js';
import { BridgeClientManager } from '../src/bridge/client.js';
import { syncBridgeMemories } from '../src/bridge/sync.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('DatabaseLayer Bridge Server CRUD & syncBridgeMemories Tests', () => {
  let db: DatabaseLayer;
  let graph: KnowledgeGraph;
  let bridgeManager: BridgeClientManager;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `amneshia-test-bridge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testDir, { recursive: true });
    db = new DatabaseLayer(testDir);
    graph = new KnowledgeGraph(db);
    bridgeManager = new BridgeClientManager();
  });

  afterEach(async () => {
    await bridgeManager.disconnectAll();
    db.close();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should perform CRUD operations on bridge servers', () => {
    // 1. Create bridge server
    const server = db.addBridgeServer(
      'codebase-memory-mcp',
      'node',
      ['dist/index.js']
    );

    expect(server.name).toBe('codebase-memory-mcp');
    expect(server.command).toBe('node');
    expect(server.args).toEqual(['dist/index.js']);
    expect(server.enabled).toBe(true);

    // 2. Read bridge servers
    const servers = db.getBridgeServers();
    expect(servers.length).toBe(1);
    expect(servers[0].id).toBe(server.id);

    const singleServer = db.getBridgeServerById(server.id);
    expect(singleServer).not.toBeNull();
    expect(singleServer!.name).toBe('codebase-memory-mcp');

    // 3. Remove bridge server
    const removed = db.removeBridgeServer(server.id);
    expect(removed).toBe(true);
    expect(db.getBridgeServerById(server.id)).toBeNull();
  });

  it('should sync bridge memories using syncBridgeMemories', async () => {
    // Register codebase-memory-mcp bridge server in db
    db.addBridgeServer(
      'codebase-memory-mcp',
      'node',
      ['/path/to/codebase-memory-mcp/dist/index.js']
    );

    // Mock bridgeManager.callTool to return simulated projects
    const mockListProjectsResponse = {
      projects: [
        {
          name: 'Amneshia-Core',
          root_path: '/home/murtix/projects/Amneshia',
          nodes: 150,
          edges: 320,
          git: {
            branch: 'main',
            head_sha: 'a1b2c3d4e5f6'
          }
        }
      ]
    };

    vi.spyOn(bridgeManager, 'callTool').mockResolvedValue(mockListProjectsResponse);

    // Run synchronization
    const result = await syncBridgeMemories(graph, db, bridgeManager);

    expect(result.projectsSynced).toEqual(['Amneshia']);
    expect(result.observationsAdded).toBe(4); // 4 properties loaded
    expect(result.relationsCreated).toBe(2); // works_on & indexed_in

    // Verify Sabil Murti, Codebase Memory MCP, and Amneshia entities were created
    const sabilEntity = db.getEntityByName('Sabil Murti');
    const toolEntity = db.getEntityByName('Codebase Memory MCP');
    const projectEntity = db.getEntityByName('Amneshia');

    expect(sabilEntity).not.toBeNull();
    expect(toolEntity).not.toBeNull();
    expect(projectEntity).not.toBeNull();

    // Verify observations are registered for Amneshia project entity
    const observations = db.getObservationsByEntity(projectEntity!.id);
    expect(observations.length).toBe(4);
    expect(observations.some(o => o.content.includes('Root Path: /home/murtix/projects/Amneshia'))).toBe(true);
  });
});
