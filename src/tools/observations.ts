import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraph } from '../graph.js';

const observationSchema = {
  observations: z.array(
    z.object({
      entityName: z.string().min(1).describe('Entity name to attach the observations to'),
      contents: z.array(z.string().min(1)).min(1).describe('Observation texts to add'),
      source: z.string().optional().describe('Agent or system that supplied the observation'),
      importance: z.enum(['permanent', 'normal', 'ephemeral']).optional().describe('Retention tier for the observation'),
      expiresAt: z.string().datetime().optional().describe('ISO 8601 expiration timestamp for ephemeral facts'),
    })
  ).min(1).describe('Observation batches to store'),
};

function textContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function registerObservationTools(server: McpServer, graph: KnowledgeGraph): void {
  server.tool(
    'add_observations',
    'Add one or more observations to existing entities. Use this for facts, notes, corrections, or memory updates that should stay attached to an entity node.',
    observationSchema,
    async ({ observations }) => {
      try {
        const created = await graph.addObservations(observations);
        return textContent({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to add observations' });
      }
    }
  );

  server.tool(
    'delete_observations',
    'Delete specific observations by ID. Use this when a fact is stale, incorrect, or superseded and should be removed from the record.',
    {
      ids: z.array(z.string().min(1)).min(1).describe('Observation IDs to delete'),
    },
    async ({ ids }) => {
      try {
        const deleted = graph.deleteObservations(ids);
        return textContent({ ok: true, deleted, requested: ids.length });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to delete observations' });
      }
    }
  );

  server.tool(
    'update_observation',
    'Replace the text of an existing observation while recording the previous content in history. Use this for corrections rather than delete-and-recreate when you want an audit trail.',
    {
      observationId: z.string().min(1).describe('Observation ID to update'),
      newContent: z.string().min(1).describe('Replacement content'),
      changedBy: z.string().optional().describe('Optional agent or actor making the change'),
    },
    async ({ observationId, newContent, changedBy }) => {
      try {
        const updated = graph.updateObservation({ observationId, newContent, changedBy });
        return textContent({ ok: true, updated });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to update observation' });
      }
    }
  );
}
