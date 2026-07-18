import json
import asyncio
from typing import List, Dict, Any, Optional
try:
    from mcp.client.session import ClientSession
    from mcp.client.stdio import stdio_client, StdioServerParameters
    MCP_CLIENT_AVAILABLE = True
except ImportError:
    MCP_CLIENT_AVAILABLE = False

class CodebaseMemoryClient:
    def __init__(self, command: str = "uvx", args: List[str] = ["codebase-memory-mcp"]):
        self.server_params = StdioServerParameters(command=command, args=args)
        self.session = None
        self._exit_stack = None
        
    async def connect(self):
        if not MCP_CLIENT_AVAILABLE:
            raise RuntimeError("MCP client SDK is not installed or configured correctly.")
            
        import contextlib
        self._exit_stack = contextlib.AsyncExitStack()
        
        read_stream, write_stream = await self._exit_stack.enter_async_context(stdio_client(self.server_params))
        self.session = await self._exit_stack.enter_async_context(ClientSession(read_stream, write_stream))
        await self.session.initialize()

    async def search_graph(self, project: str, query: str = "", limit: int = 10) -> Dict[str, Any]:
        """Queries the codebase-memory-mcp's search_graph tool."""
        if not self.session:
            await self.connect()
            
        result = await self.session.call_tool(
            "mcp__search_graph", 
            arguments={"project": project, "query": query, "limit": limit}
        )
        # Parse the text response (which usually contains the JSON from codebase-memory)
        if result and hasattr(result, 'content') and len(result.content) > 0:
            try:
                # The text inside the result content block is typically a JSON string
                return json.loads(result.content[0].text)
            except Exception:
                return {"raw": result.content[0].text}
        return {"error": "No data returned"}

    async def list_projects(self) -> Dict[str, Any]:
        """Lists projects indexed by codebase-memory-mcp."""
        if not self.session:
            await self.connect()
            
        result = await self.session.call_tool(
            "mcp__list_projects", 
            arguments={"reason": "Amneshia Hub cross-reference"}
        )
        if result and hasattr(result, 'content') and len(result.content) > 0:
            try:
                return json.loads(result.content[0].text)
            except Exception:
                return {"raw": result.content[0].text}
        return {"error": "No data returned"}

    async def disconnect(self):
        if self._exit_stack:
            await self._exit_stack.aclose()
            self.session = None
            self._exit_stack = None

# Global instance for API
codebase_mcp = CodebaseMemoryClient()
