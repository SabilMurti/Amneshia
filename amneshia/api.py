from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os

from .db import AmneshiaDB
from .exporter import export_to_markdowns

# Try to import our new MCP Client Bridge
try:
    from .mcp_client import codebase_mcp, MCP_CLIENT_AVAILABLE
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
# 🚀 INTEGRATION: External MCP Connectors
# ==========================================
@app.get("/api/integrations/codebase/projects")
async def get_codebase_projects():
    if not MCP_CLIENT_AVAILABLE:
        raise HTTPException(status_code=501, detail="MCP Client SDK not configured properly")
    try:
        data = await codebase_mcp.list_projects()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/integrations/codebase/search")
async def search_codebase_memory(project: str, query: str = "", limit: int = 10):
    if not MCP_CLIENT_AVAILABLE:
        raise HTTPException(status_code=501, detail="MCP Client SDK not configured properly")
    try:
        data = await codebase_mcp.search_graph(project=project, query=query, limit=limit)
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# Serve Frontend static build
# ==========================================
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