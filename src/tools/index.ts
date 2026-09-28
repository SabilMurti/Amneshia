import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database.js';
import { z } from 'zod';
import { registerEntityTools } from './entities.js';
import { registerRelationTools } from './relations.js';
import { registerObservationTools } from './observations.js';
import { registerSearchTools } from './search.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerUtilityTools } from './utility.js';

export function registerTools(
  server: McpServer, 
  graph: KnowledgeGraph, 
  db: DatabaseLayer
): void {
  registerEntityTools(server, graph);
  registerRelationTools(server, graph);
  registerObservationTools(server, graph);
  registerSearchTools(server, graph);
  registerLifecycleTools(server, graph, db);
  registerUtilityTools(server, graph);
}

export { z };
