from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json

from .db import AmneshiaDB
from .exporter import export_to_markdowns

try:
    from .mcp_client import dynamic_mcp, MCP_CLIENT_AVAILABLE
except ImportError:
    MCP_CLIENT_AVAILABLE = False

app = FastAPI(title="Amneshia API", description="Single Source of Truth Memory Hub")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db = AmneshiaDB()

class MemoryInput(BaseModel):
    type: str
    scope: str
    content: str
    tags: Optional[List[str]] = []
    metadata: Optional[Dict[str, Any]] = {}

class ExportTargetInput(BaseModel):
    name: str
    path: str

class MCPServerInput(BaseModel):
    name: str
    command: str
    args: List[str]

@app.post("/api/memories")
def api_add_memory(mem: MemoryInput):
    mem_id = db.add_memory(mem.type, mem.scope, mem.content, mem.tags, mem.metadata)
    export_to_markdowns()
    return {"id": mem_id, "status": "success"}

@app.get("/api/memories/exact")
def api_search_exact(query: str = "", scope: str = None, type: str = None):
    return db.search_exact(query, scope, type)

@app.get("/api/memories/semantic")
def api_search_semantic(query: str, n_results: int = 5):
    return db.search_semantic(query, n_results)

@app.delete("/api/memories/{mem_id}")
def api_delete_memory(mem_id: str):
    if db.delete_memory(mem_id):
        export_to_markdowns()
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Memory not found")

@app.get("/api/exports")
def api_get_exports():
    return db.get_export_targets()

@app.post("/api/exports")
def api_add_export(target: ExportTargetInput):
    target_id = db.add_export_target(target.name, target.path)
    export_to_markdowns()
    return {"id": target_id, "status": "success"}

@app.delete("/api/exports/{target_id}")
def api_delete_export(target_id: str):
    if db.remove_export_target(target_id):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Target not found")

@app.post("/api/export_now")
def api_export_manual():
    export_to_markdowns()
    return {"status": "success"}

# ==========================================
# 🚀 INTEGRATION: Dynamic Universal MCP Bridge
# ==========================================
@app.get("/api/mcp/servers")
def get_mcp_servers():
    return db.get_mcp_servers()

@app.post("/api/mcp/servers")
def add_mcp_server(srv: MCPServerInput):
    server_id = db.add_mcp_server(srv.name, srv.command, srv.args)
    return {"id": server_id, "status": "success"}

@app.delete("/api/mcp/servers/{server_id}")
async def delete_mcp_server(server_id: str):
    if db.delete_mcp_server(server_id):
        await dynamic_mcp.disconnect(server_id)
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Server not found")

@app.get("/api/mcp/servers/{server_id}/tools")
async def get_mcp_tools(server_id: str):
    if not MCP_CLIENT_AVAILABLE:
        raise HTTPException(status_code=501, detail="MCP Client SDK not available")
        
    servers = db.get_mcp_servers()
    target = next((s for s in servers if s["id"] == server_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Server not registered")
        
    try:
        if server_id not in dynamic_mcp.sessions:
            await dynamic_mcp.connect_server(server_id, target["command"], target["args"])
        data = await dynamic_mcp.list_tools(server_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/mcp/servers/{server_id}/call/{tool_name}")
async def call_mcp_tool(server_id: str, tool_name: str, payload: Dict[str, Any]):
    if not MCP_CLIENT_AVAILABLE:
        raise HTTPException(status_code=501, detail="MCP Client SDK not available")
        
    servers = db.get_mcp_servers()
    target = next((s for s in servers if s["id"] == server_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Server not registered")
        
    try:
        if server_id not in dynamic_mcp.sessions:
            await dynamic_mcp.connect_server(server_id, target["command"], target["args"])
        data = await dynamic_mcp.call_tool(server_id, tool_name, payload.get("arguments", {}))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve Frontend static build
module_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(module_dir)
ui_path = os.path.join(project_root, "ui", "dist")

if os.path.exists(ui_path):
    app.mount("/", StaticFiles(directory=ui_path, html=True), name="dashboard")
else:
    @app.get("/")
    def index():
        return {"message": "Amneshia API is running. Build the React UI in 'ui/dist' to see the dashboard here."}

def run_api_server(port=3457):
    import uvicorn
    print(f"\n🚀 Amneshia API & Dashboard running at: http://localhost:{port}\n")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")