import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraph } from '../graph.js';

function textContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function registerSearchTools(server: McpServer, graph: KnowledgeGraph): void {
  server.tool(
    'search_memory',
    'Search the memory graph using SQLite FTS5 with BM25 ranking. Use this when you know part of a name, fact, or observation text and want the most relevant entities and observations.',
    {
      query: z.string().min(1).describe('Search text to match against entity names, types, and observation content'),
      limit: z.number().int().positive().max(100).optional().describe('Maximum number of ranked results to return'),
      domain: z.string().optional().describe('Optional domain filter such as personal or project:<name>'),
    },
    async ({ query, limit, domain }) => {
      try {
        const result = graph.searchMemory(query, limit ?? 20, domain);
        return textContent({ ok: true, ...result });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to search memory' });
      }
    }
  );

  server.tool(
    'read_graph',
    'Read the complete knowledge graph or a filtered slice of it. Use this when you need structured entities, their observations, and their relations rather than a ranked search result.',
    {
      domain: z.string().optional().describe('Optional domain filter such as personal or project:<name>'),
      entityType: z.string().optional().describe('Optional entity type filter such as person, tool, or project'),
    },
    async ({ domain, entityType }) => {
      try {
        const snapshot = graph.readGraph(domain, entityType);
        return textContent({ ok: true, snapshot });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to read graph' });
      }
    }
  );

  server.tool(
    'open_nodes',
    'Open a set of entity names and return each matching node with its full observations and relations. Use this when you already know the entities you want to inspect.',
    {
      names: z.array(z.string().min(1)).min(1).describe('Entity names to open'),
    },
    async ({ names }) => {
      try {
        const snapshot = graph.openNodes(names);
        return textContent({ ok: true, snapshot });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to open nodes' });
      }
    }
  );
}
