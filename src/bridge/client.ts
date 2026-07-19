import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { BridgeToolInfo } from '../types.js';

export class BridgeClientManager {
  private sessions: Map<string, { client: Client; transport: StdioClientTransport }>;

  constructor() {
    this.sessions = new Map();
  }

  async connectServer(serverId: string, command: string, args: string[]): Promise<Client> {
    if (this.sessions.has(serverId)) {
      return this.sessions.get(serverId)!.client;
    }

    try {
      const transport = new StdioClientTransport({ command, args });
      const client = new Client(
        { name: 'amneshia-bridge', version: '1.0.0' },
        { capabilities: {} }
      );
      await client.connect(transport);
      this.sessions.set(serverId, { client, transport });
      return client;
    } catch (error) {
      console.error(`Failed to connect to bridge server ${serverId}:`, error);
      throw error;
    }
  }

  async listTools(serverId: string, command: string, args: string[]): Promise<BridgeToolInfo[]> {
    try {
      const client = await this.connectServer(serverId, command, args);
      const result = await client.listTools();
      return result.tools.map(tool => ({
        serverId,
        serverName: 'unknown', // Need to resolve server name
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>
      }));
    } catch (error) {
      console.error(`Failed to list tools for server ${serverId}:`, error);
      return [];
    }
  }

  async callTool(serverId: string, command: string, args: string[], toolName: string, toolArguments?: Record<string, unknown>): Promise<unknown> {
    try {
      const client = await this.connectServer(serverId, command, args);
      const result = await client.callTool({ name: toolName, arguments: toolArguments });
      return result.content;
    } catch (error) {
      console.error(`Failed to call tool ${toolName} on server ${serverId}:`, error);
      throw error;
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (session) {
      await session.client.close();
      session.transport.close();
      this.sessions.delete(serverId);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const serverId of this.sessions.keys()) {
      await this.disconnectServer(serverId);
    }
  }
}
