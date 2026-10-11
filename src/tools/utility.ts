import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
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
        const writes = exportToMarkdown(graph, true);
        return textContent({ ok: true, exported: writes.length, writes });
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) }],
        };
      }
    }
  );

  server.tool(
    'manage_export_targets',
    'Manage export destinations for markdown snapshots. Use list to inspect targets, add to register a new destination, toggle to flip auto-export, or remove to delete one by id.',
    {
      action: z.enum(['list', 'add', 'remove', 'toggle']).describe('Action to perform on export targets'),
      name: z.string().trim().min(1).optional().describe('Target name when adding a destination'),
      path: z.string().trim().min(1).optional().describe('Filesystem path when adding a destination'),
      format: z.enum(['markdown', 'json']).optional().describe('Target format when adding a destination'),
      autoExport: z.boolean().optional().describe('Whether to automatically export snapshots on mutation'),
      id: z.string().trim().min(1).optional().describe('Export target id when removing or toggling a destination'),
    },
    async ({ action, name, path, format, autoExport, id }) => {
      try {
        const result = graph.manageExportTargets({ action, name, path, format, autoExport, id });
        return textContent({ ok: true, result });
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) }],
        };
      }
    }
  );
}


