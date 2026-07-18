import json
import asyncio
from typing import List, Dict, Any, Optional
try:
    from mcp.client.session import ClientSession
    from mcp.client.stdio import stdio_client, StdioServerParameters
    MCP_CLIENT_AVAILABLE = True
except ImportError:
    MCP_CLIENT_AVAILABLE = False

class DynamicMCPClient:
    def __init__(self):
        self.sessions: Dict[str, ClientSession] = {}
        self.exit_stacks: Dict[str, Any] = {}
        
    async def connect_server(self, server_id: str, command: str, args: List[str]):
        if not MCP_CLIENT_AVAILABLE:
            raise RuntimeError("MCP client SDK is not installed or configured correctly.")
            
        import contextlib
        stack = contextlib.AsyncExitStack()
        self.exit_stacks[server_id] = stack
        
        server_params = StdioServerParameters(command=command, args=args)
        read_stream, write_stream = await stack.enter_async_context(stdio_client(server_params))
        session = await stack.enter_async_context(ClientSession(read_stream, write_stream))
        await session.initialize()
        self.sessions[server_id] = session
        
    async def list_tools(self, server_id: str) -> Dict[str, Any]:
        if server_id not in self.sessions:
            return {"error": "Server not connected"}
        
        result = await self.sessions[server_id].list_tools()
        tools = []
        # Parse MCP ListToolsResult object safely
        if result and hasattr(result, 'tools'):
            for t in result.tools:
                tools.append({
                    "name": t.name,
                    "description": t.description,
                    "inputSchema": t.inputSchema
                })
        return {"status": "success", "tools": tools}
        
    async def call_tool(self, server_id: str, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        if server_id not in self.sessions:
            return {"error": "Server not connected"}
            
        result = await self.sessions[server_id].call_tool(tool_name, arguments=arguments)
        
        if result and hasattr(result, 'content') and len(result.content) > 0:
            text_data = result.content[0].text
            try:
                return {"status": "success", "data": json.loads(text_data)}
            except Exception:
                return {"status": "success", "data": text_data}
        return {"error": "No data returned or tool execution failed"}

    async def disconnect(self, server_id: str):
        if server_id in self.exit_stacks:
            await self.exit_stacks[server_id].aclose()
            del self.sessions[server_id]
            del self.exit_stacks[server_id]

# Global instance for API
dynamic_mcp = DynamicMCPClient()
