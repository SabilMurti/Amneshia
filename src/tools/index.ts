/**
 * @module
 * MCP tool registration layer for Amneshia.
 * Registers core agent memory tools (remember, recall, forget, context) and extended admin tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database/index.js';
import { z } from 'zod';
import { registerCoreTools } from './core.js';
import { registerEntityTools } from './entities.js';
import { registerRelationTools } from './relations.js';
import { registerObservationTools } from './observations.js';
import { registerSearchTools } from './search.js';
import { registerLifecycleTools } from './lifecycle.js';
import { registerUtilityTools } from './utility.js';

const registeredServers = new WeakSet<McpServer>();

/**
 * Registers Model Context Protocol (MCP) tools onto an McpServer instance.
 * @param server Target MCP server instance
 * @param graph Knowledge graph domain engine
 * @param db Low-level SQLite database storage layer
 * @param profile Active tool profile: 'core' (8 core memory/sync tools) or 'full' (all admin/CRUD tools)
 */
export function registerTools(
  server: McpServer,
  graph: KnowledgeGraph,
  db: DatabaseLayer,
  profile: 'core' | 'full' = 'full'
): void {
  if (registeredServers.has(server)) {
    return;
  }

  if (profile !== 'core' && profile !== 'full') {
    throw new Error(`Invalid tool profile: "${profile}". Expected "core" or "full".`);
  }

  try {
    // Register 8 core tools: remember, recall, forget, context, remember_media, status, reindex, sync
    registerCoreTools(server, graph, db);

    // If full profile, register admin and granular tools
    if (profile === 'full') {
      registerEntityTools(server, graph);
      registerRelationTools(server, graph);
      registerObservationTools(server, graph);
      registerSearchTools(server, graph);
      registerLifecycleTools(server, graph, db);
      registerUtilityTools(server, graph);
    }

    registeredServers.add(server);
  } catch (error) {
    throw new Error(`Failed to register MCP tools (${profile} profile): ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Re-exported Zod validation instance for tool schema builders */
export { z };
