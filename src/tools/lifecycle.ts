import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database.js';
import { z } from 'zod';
import { consolidateMemories } from '../consolidation/index.js';

function textContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function registerLifecycleTools(server: McpServer, graph: KnowledgeGraph, db: DatabaseLayer): void {
  server.tool(
    'cleanup_expired',
    'Remove expired ephemeral observations from the database. Use this as a maintenance tool when you want to prune timed memories that have passed their expiry date.',
    {},
    async () => {
      try {
        const removed = graph.cleanupExpired();
        return textContent({ ok: true, removed });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to cleanup expired observations' });
      }
    }
  );

  server.tool(
    'get_stats',
    'Inspect the current memory store health and usage. Use this when you want counts by entity type and domain, recent activity, or to confirm the database is being populated as expected.',
    {},
    async () => {
      try {
        const stats = graph.getStats();
        return textContent({ ok: true, stats });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to get stats' });
      }
    }
  );

  server.tool(
    'consolidate_memory',
    'Proactively consolidate entity observations by resolving conflicts, removing duplicate statements, and synthesizing semantic summaries (if AI provider is active).',
    {
      domain: z.string().optional().describe('Filter consolidation to a specific domain (e.g. personal, work)'),
    },
    async ({ domain }) => {
      try {
        const result = await consolidateMemories(graph, db, domain);
        return textContent({ ok: true, result });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to consolidate memories' });
      }
    }
  );
}
