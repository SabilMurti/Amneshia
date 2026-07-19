import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { DatabaseLayer } from './database.js';
import { KnowledgeGraph } from './graph.js';
import { BridgeClientManager } from './bridge/client.js';
import { registerTools } from './tools/index.js';
import { setAIProvider } from './ai/index.js';
import { consolidateMemories } from './consolidation/index.js';
import path from 'node:path';
import { syncBridgeMemories } from './bridge/sync.js';
import { fileURLToPath } from 'node:url';

export interface StartServerOptions {
  dataDir?: string;
  http?: boolean;
  port?: number;
}

export async function startServer(options: StartServerOptions = {}): Promise<void> {
  const db = new DatabaseLayer(options.dataDir);
  const graph = new KnowledgeGraph(db);
  const bridgeManager = new BridgeClientManager();
  const server = new McpServer({ name: 'Amneshia', version: '2.0.0' });
  registerTools(server, graph, db, bridgeManager);

  const cleanup = async () => {
    await bridgeManager.disconnectAll();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  if (options.http) {
    const app = express();
    app.use(express.json());

    let transport: SSEServerTransport;

    app.get('/sse', (req, res) => {
      transport = new SSEServerTransport('/messages', res);
      server.connect(transport);
    });

    app.post('/messages', async (req, res) => {
      await transport.handlePostMessage(req, res);
    });

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', name: 'amneshia', version: '2.0.0' });
    });

    app.get('/api/graph', (req, res) => res.json(graph.readGraph(req.query.domain as string)));
    app.get('/api/search', (req, res) => res.json(graph.searchMemory(req.query.q as string)));
    app.get('/api/stats', (req, res) => res.json(graph.getStats()));
    app.post('/api/entities', (req, res) => res.json(graph.createEntities(req.body.entities)));
    app.delete('/api/entities', (req, res) => res.json(graph.deleteEntities(req.body.names)));
    app.post('/api/observations', async (req, res) => res.json(await graph.addObservations(req.body.observations)));
    app.delete('/api/observations', (req, res) => res.json(graph.deleteObservations(req.body.ids)));
    app.put('/api/observations', (req, res) => res.json(graph.updateObservation(req.body)));
    app.post('/api/relations', (req, res) => res.json(graph.createRelations(req.body.relations)));
    app.delete('/api/relations', (req, res) => res.json(graph.deleteRelations(req.body.ids)));
    app.get('/api/bridge/servers', (req, res) => res.json(db.getBridgeServers()));
    app.post('/api/bridge/servers', (req, res) => res.json(db.addBridgeServer(req.body.name, req.body.command, req.body.args)));
    app.delete('/api/bridge/servers/:id', async (req, res) => {
      await bridgeManager.disconnectServer(req.params.id);
      res.json(db.removeBridgeServer(req.params.id));
    });
    app.get('/api/bridge/tools', async (req, res) => {
      try {
        const serverId = req.query.serverId as string;
        let command = req.query.command as string;
        let args: string[] = [];
        if (req.query.args) {
          args = Array.isArray(req.query.args) ? (req.query.args as string[]) : [req.query.args as string];
        }
        if (serverId && !command) {
          const serverObj = db.getBridgeServerById(serverId);
          if (serverObj) {
            command = serverObj.command;
            args = serverObj.args;
          }
        }
        if (!command) {
          res.status(400).json({ error: 'Server command not specified and serverId not found' });
          return;
        }
        res.json(await bridgeManager.listTools(serverId || 'temp', command, args));
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });
    app.post('/api/bridge/call', async (req, res) => {
      try {
        const { serverId, toolName, arguments: toolArguments, storeAsMemory, entityName } = req.body;
        const serverObj = db.getBridgeServerById(serverId);
        if (!serverObj) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }
        const result = await bridgeManager.callTool(serverObj.id, serverObj.command, serverObj.args, toolName, toolArguments);
        if (storeAsMemory) {
          const content = `Result of tool [${toolName}]: ${JSON.stringify(result)}`;
          await graph.addObservations([{
            entityName: entityName || serverObj.name,
            contents: [content],
          }]);
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });
    app.post('/api/bridge/sync', async (req, res) => {
      try {
        const stats = await syncBridgeMemories(graph, db, bridgeManager);
        res.json({ ok: true, stats });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    });
    app.get('/api/exports', (req, res) => res.json(db.getExportTargets()));
    app.post('/api/exports', (req, res) => {
      const autoExportVal = req.body.autoExport !== false ? 1 : 0;
      res.json(db.addExportTarget(req.body.name, req.body.path, req.body.format, autoExportVal));
    });
    app.delete('/api/exports/:id', (req, res) => res.json(db.removeExportTarget(req.params.id)));
    app.post('/api/exports/:id/toggle', (req, res) => {
      const targets = db.getExportTargets();
      const target = targets.find(t => t.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Target not found' });
        return;
      }
      const newAutoExport = !target.autoExport;
      db.updateExportTarget(req.params.id, newAutoExport);
      res.json({ id: req.params.id, autoExport: newAutoExport });
    });
    app.post('/api/config/ai', (req, res) => res.json(setAIProvider(req.body.provider)));
    app.post('/api/cleanup', (req, res) => res.json(graph.cleanupExpired()));
    app.post('/api/consolidate', async (req, res, next) => {
      try {
        const result = await consolidateMemories(graph, db, req.body?.domain);
        res.json({ ok: true, result });
      } catch (error) {
        next(error);
      }
    });

    const uiPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist-ui');
    app.use(express.static(uiPath));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/sse' || req.path === '/messages') return next();
      res.sendFile(path.join(uiPath, 'index.html'));
    });

    app.listen(options.port || 3457);
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
