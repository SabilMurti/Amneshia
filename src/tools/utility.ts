import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { setAIProvider } from '../ai/index.js';
import type { KnowledgeGraph } from '../graph.js';
import { exportToMarkdown } from '../export/markdown.js';

function textContent(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

export function registerUtilityTools(server: McpServer, graph: KnowledgeGraph): void {
  server.tool(
    'export_memory',
    'Export the entire memory graph to markdown files for every configured export target. Use this to create human-readable snapshots or sync memory to an external file path.',
    {},
    async () => {
      try {
        const writes = exportToMarkdown(graph);
        return textContent({ ok: true, exported: writes.length, writes });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to export memory' });
      }
    }
  );

  server.tool(
    'manage_export_targets',
    'Manage export destinations for markdown snapshots. Use list to inspect targets, add to register a new destination, or remove to delete one by id.',
    {
      action: z.enum(['list', 'add', 'remove']).describe('Action to perform on export targets'),
      name: z.string().optional().describe('Target name when adding a destination'),
      path: z.string().optional().describe('Filesystem path when adding a destination'),
      format: z.enum(['markdown', 'json']).optional().describe('Target format when adding a destination'),
      id: z.string().optional().describe('Export target id when removing a destination'),
    },
    async ({ action, name, path, format, id }) => {
      try {
        const result = graph.manageExportTargets({ action, name, path, format, id });
        return textContent({ ok: true, result });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to manage export targets' });
      }
    }
  );

  server.tool(
    'configure_ai',
    'Configure the AI provider for memory synthesis.',
    {
      provider: z.enum(['none', 'ollama', 'openai']).describe('Active AI provider for memory synthesis'),
    },
    async ({ provider }) => {
      try {
        const active = setAIProvider(provider);
        return textContent({ ok: true, provider: active.name });
      } catch (error) {
        return textContent({ ok: false, error: error instanceof Error ? error.message : 'Failed to configure AI' });
      }
    }
  );
}

