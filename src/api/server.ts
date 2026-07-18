import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { addMemory, searchMemories, updateMemory, deleteMemory, getMemory } from '../db/index.js';
import { triggerExport } from './exporter.js';

const app = express();
app.use(cors());
app.use(express.json());

// API Endpoints
app.get('/api/memories', (req, res) => {
  const { query, scope, type } = req.query;
  const results = searchMemories(
    query as string, 
    scope as string, 
    type as string
  );
  res.json(results);
});

app.post('/api/memories', async (req, res) => {
  const { type, scope, content, tags, metadata } = req.body;
  if (!type || !scope || !content) {
    return res.status(400).json({ error: 'type, scope, and content are required' });
  }

  const mem = addMemory(type, scope, content, tags, metadata);
  await triggerExport();
  res.json(mem);
});

app.put('/api/memories/:id', async (req, res) => {
  const { content } = req.body;
  const mem = updateMemory(req.params.id, content);
  if (!mem) return res.status(404).json({ error: 'Memory not found' });
  
  await triggerExport();
  res.json(mem);
});

app.delete('/api/memories/:id', async (req, res) => {
  const success = deleteMemory(req.params.id);
  if (!success) return res.status(404).json({ error: 'Memory not found' });
  
  await triggerExport();
  res.json({ success: true });
});

app.post('/api/export', async (req, res) => {
  try {
    await triggerExport();
    res.json({ success: true, message: 'Export completed successfully' });
  } catch (e: any) {
    res.status(500).json({ error: 'Export failed', details: e.message });
  }
});

// Melayani Dashboard statis dari Vite build (dist-dashboard)
const dashboardPath = join(process.cwd(), 'dist-dashboard');
app.use(express.static(dashboardPath));

// Fallback untuk SPA routing
app.get('*', (req, res) => {
  res.sendFile(join(dashboardPath, 'index.html'));
});

export function runApiServer(port = 3456) {
  app.listen(port, () => {
    console.error(`\n🚀 Omni Memory API & Dashboard running at: http://localhost:${port}\n`);
  });
}