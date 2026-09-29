import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { DatabaseLayer } from './database.js';
import { KnowledgeGraph } from './graph.js';
import { registerTools } from './tools/index.js';
import { runMaintenance } from './maintenance/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveStorageConfig, DualWriteSync } from './storage/index.js';

export interface StartServerOptions {
  dataDir?: string;
  local?: boolean;
  http?: boolean;
  port?: number;
  toolProfile?: 'core' | 'full';
  stdio?: boolean;
}

export async function startServer(options: StartServerOptions = {}): Promise<void> {
  const storageConfig = resolveStorageConfig(options.local);
  const dataDir = options.dataDir ?? storageConfig.dataDir;
  const db = new DatabaseLayer(dataDir);
  const dualWrite = new DualWriteSync(storageConfig.knowledgeDir, db);
  const graph = new KnowledgeGraph(db, dualWrite);
  const server = new McpServer({ name: 'Amneshia', version: '3.0.2' });
  registerTools(server, graph, db, options.toolProfile);

  const cleanup = async () => {
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  if (options.http) {
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json());
    app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-XSS-Protection", "1; mode=block");
      next();
    });
    let transport: SSEServerTransport;

    app.get('/sse', (req, res) => {
      transport = new SSEServerTransport('/messages', res);
      server.connect(transport);
    });

    app.post('/messages', async (req, res) => {
      await transport.handlePostMessage(req, res);
    });

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', name: 'amneshia', version: '3.0.2' });
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
    app.post('/api/cleanup', (req, res) => res.json(graph.cleanupExpired()));
    app.post('/api/gc', (_req, res) => res.json({ removed: db.gc() }));
    app.post('/api/reindex', (_req, res) => res.json(dualWrite.reindex()));
    app.get('/api/contradictions', (req, res) => res.json(db.getContradictions(req.query.entityId as string)));
    app.post('/api/contradictions/:id/resolve', (req, res) => {
      const ok = db.resolveContradiction(req.params.id, req.body.resolution);
      res.json({ ok });
    });
    app.post('/api/maintenance', (req, res) => {
      const result = runMaintenance(graph, db, req.body?.domain, req.body?.dryRun === true);
      res.json({ ok: true, result });
    });

    const uiPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist-ui');
    app.use(express.static(uiPath));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/sse' || req.path === '/messages') return next();
      res.sendFile(path.join(uiPath, 'index.html'));
    });

    const httpListener = app.listen(options.port || 3457, () => {
      console.error(`[Amneshia] HTTP Dashboard running on http://localhost:${options.port || 3457}`);
    });

    httpListener.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Amneshia] Port ${options.port || 3457} is already in use by another active instance.`);
      } else {
        console.error(`[Amneshia] Express server error: ${err.message}`);
      }
    });
  }

  if (options.stdio !== false && !process.argv.includes('--daemon')) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Amneshia] MCP Server running on stdio");
  }
}

