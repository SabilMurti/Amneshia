import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraph } from '../graph.js';

const entitySchema = {
  entities: z.array(
    z.object({
      name: z.string().min(1).describe('Unique human-readable entity name'),
      entityType: z.string().min(1).describe('Entity type such as person, tool, project, preference, concept, or skill'),
      domain: z.string().optional().describe('Domain scope such as personal or project:<name>'),
      visibility: z.enum(['public', 'restricted', 'private']).optional().describe('Access level for the entity'),
      allowedAgents: z.array(z.string().min(1)).optional().describe('Explicit agent whitelist; empty means all agents'),
    })
  ).min(1).describe('Entities to create'),
};

function textContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function registerEntityTools(server: McpServer, graph: KnowledgeGraph): void {
  server.tool(
    'create_entities',
    'Create one or more entities in the knowledge graph. Use this when introducing a new person, tool, project, preference, concept, or skill that should have its own node and future observations/relations.',
    entitySchema,
    async ({ entities }) => {
      try {
        const created = graph.createEntities(entities);
        return textContent({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to create entities' });
      }
    }
  );

  server.tool(
    'delete_entities',
    'Delete entities by name. This removes the entity node and cascades to its attached observations and relations. Use with care when a memory branch is obsolete or incorrect.',
    {
      names: z.array(z.string().min(1)).min(1).describe('Entity names to delete'),
    },
    async ({ names }) => {
      try {
        const deleted = graph.deleteEntities(names);
        return textContent({ ok: true, deleted, requested: names.length });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to delete entities' });
      }
    }
  );
}
