import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { KnowledgeGraph } from '../graph.js';
import type { DatabaseLayer } from '../database.js';
import type { BridgeClientManager } from '../bridge/client.js';


export function registerBridgeTools(
  server: McpServer,
  _graph: KnowledgeGraph,
  db: DatabaseLayer,
  bridgeManager: BridgeClientManager
): void {
  server.tool(
    'manage_bridge_servers',
    'Manage bridge servers',
    {
      action: z.enum(['list', 'add', 'remove']),
      id: z.string().optional(),
      name: z.string().optional(),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
    },
    async ({ action, id, name, command, args }) => {
      if (action === 'list') {
        const servers = db.getBridgeServers();
        return { content: [{ type: 'text', text: JSON.stringify(servers, null, 2) }] };
      }
      if (action === 'add') {
        if (!name || !command) return { content: [{ type: 'text', text: 'Name and command are required' }] };
        const server = db.addBridgeServer(name, command, args ?? []);
        return { content: [{ type: 'text', text: JSON.stringify(server, null, 2) }] };
      }
      if (action === 'remove') {
        if (!id) return { content: [{ type: 'text', text: 'ID is required' }] };
        await bridgeManager.disconnectServer(id);
        const removed = db.removeBridgeServer(id);
        return { content: [{ type: 'text', text: removed ? 'Server removed' : 'Server not found' }] };
      }
      return { content: [{ type: 'text', text: 'Invalid action' }] };
    }
  );

  server.tool(
    'list_bridge_tools',
    'List bridge tools',
    {
      serverId: z.string().optional().describe("Optional server ID to filter tools"),
    },
    async ({ serverId }) => {
      const servers = serverId ? [db.getBridgeServerById(serverId)].filter(Boolean) : db.getBridgeServers();
      const allTools = [];
      for (const server of servers) {
        if (!server) continue;
        const tools = await bridgeManager.listTools(server.id, server.command, server.args);
        allTools.push(...tools);
      }
      return { content: [{ type: 'text', text: JSON.stringify(allTools, null, 2) }] };
    }
  );

  server.tool(
    'call_bridge_tool',
    'Call bridge tool',
    {
      serverId: z.string(),
      toolName: z.string(),
      arguments: z.record(z.unknown()).optional(),
      storeAsMemory: z.boolean().optional(),
      entityName: z.string().optional(),
    },
    async ({ serverId, toolName, arguments: toolArguments, storeAsMemory, entityName }) => {
      const server = db.getBridgeServerById(serverId);
      if (!server) return { content: [{ type: 'text', text: 'Server not found' }] };
      
      const result = await bridgeManager.callTool(server.id, server.command, server.args, toolName, toolArguments);
      if (storeAsMemory) {
        const content = `Result of tool [${toolName}]: ${JSON.stringify(result)}`;
        await _graph.addObservations([{ 
            entityName: entityName || server.name, 
            contents: [content], 
            importance: 'normal'
        }]);
      }
      
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
