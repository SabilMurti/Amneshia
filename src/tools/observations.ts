import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraph } from '../graph.js';
import type { AuthorityTier, ObservationStatus } from '../types.js';

const observationSchema = {
  observations: z
    .array(
      z.object({
        entityName: z.string().min(1).describe('Entity name to attach the observations to'),
        contents: z.array(z.string().min(1)).min(1).describe('Observation texts to add'),
        source: z.string().optional().describe('Agent or system that supplied the observation'),
        importance: z.enum(['permanent', 'normal', 'ephemeral']).optional().describe('Retention tier for the observation'),
        authorityTier: z
          .enum(['invariant', 'architectural', 'contextual', 'ephemeral'])
          .optional()
          .describe('Authority tier: invariant, architectural, contextual, ephemeral'),
        derivedFrom: z.array(z.string()).optional().describe('IDs of observations this depends on'),
        expiresAt: z.string().datetime({ offset: true }).optional().describe('ISO 8601 expiration timestamp for ephemeral facts'),
      })
    )
    .min(1)
    .describe('Observation batches to store'),
};

function textContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function registerObservationTools(server: McpServer, graph: KnowledgeGraph): void {
  server.tool(
    'add_observations',
    'Add one or more observations to existing entities with optional authority tier and provenance dependency tracking.',
    observationSchema,
    async ({ observations }) => {
      try {
        const created = await graph.addObservations(observations as any);
        return textContent({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to add observations' });
      }
    }
  );

  server.tool(
    'delete_observations',
    'Delete specific observations by ID.',
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
    'Update an existing observation while recording previous content in history, updating status, or triggering cascade invalidation.',
    {
      observationId: z.string().min(1).describe('Observation ID to update'),
      newContent: z.string().min(1).describe('Replacement content'),
      changedBy: z.string().optional().describe('Optional agent or actor making the change'),
      authorityTier: z.enum(['invariant', 'architectural', 'contextual', 'ephemeral']).optional(),
      status: z.enum(['active', 'stale', 'invalidated', 'superseded', 'decayed']).optional(),
    },
    async ({ observationId, newContent, changedBy, authorityTier, status }) => {
      try {
        const updated = graph.updateObservation({
          observationId,
          newContent,
          changedBy,
          authorityTier: authorityTier as AuthorityTier,
          status: status as ObservationStatus,
        });
        return textContent({ ok: true, updated });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to update observation' });
      }
    }
  );
}
