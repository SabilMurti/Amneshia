import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraph } from '../graph.js';

const relationSchema = {
  relations: z.array(
    z.object({
      from: z.string().min(1).describe('Source entity name'),
      to: z.string().min(1).describe('Target entity name'),
      relationType: z.string().min(1).describe('Relation type such as uses, prefers, works_on, knows, or depends_on'),
    })
  ).min(1).describe('Relations to create'),
};

function textContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function registerRelationTools(server: McpServer, graph: KnowledgeGraph): void {
  server.tool(
    'create_relations',
    'Create one or more typed edges between existing entities. Use this when you want the graph to capture how people, tools, projects, and concepts connect.',
    relationSchema,
    async ({ relations }) => {
      try {
        const created = graph.createRelations(relations);
        return textContent({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to create relations' });
      }
    }
  );

  server.tool(
    'delete_relations',
    'Delete relations by relation ID. Use this to remove stale or incorrect edges without touching the connected entities.',
    {
      ids: z.array(z.string().min(1)).min(1).describe('Relation IDs to delete'),
    },
    async ({ ids }) => {
      try {
        const deleted = graph.deleteRelations(ids);
        return textContent({ ok: true, deleted, requested: ids.length });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to delete relations' });
      }
    }
  );
}
