/usr/bin/bash: warning: setlocale: LC_ALL: cannot change locale (en_US.UTF-8): No such file or directory
/usr/bin/bash: warning: setlocale: LC_ALL: cannot change locale (en_US.UTF-8): No such file or directory
import os
import json
import uuid
import sqlite3
import chromadb
from datetime import datetime
from typing import List, Dict, Any, Optional

class AmneshiaDB:
    def __init__(self, db_dir: str = None):
        if db_dir is None:
            db_dir = os.path.expanduser("~/.amneshia")
        os.makedirs(db_dir, exist_ok=True)
        
        self.sqlite_path = os.path.join(db_dir, "memory.db")
        self._init_sqlite()
        
        self.chroma_client = chromadb.PersistentClient(path=os.path.join(db_dir, "chroma"))
        self.collection = self.chroma_client.get_or_create_collection(name="memories")

    def _init_sqlite(self):
        with sqlite3.connect(self.sqlite_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    content TEXT NOT NULL,
                    tags TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    metadata TEXT
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_type ON memories(type)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_scope ON memories(scope)")
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS export_targets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL
                )
            """)
            
            # Tabel untuk pendaftaran Universal MCP Servers
            conn.execute("""
                CREATE TABLE IF NOT EXISTS mcp_servers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    command TEXT NOT NULL,
                    args TEXT NOT NULL
                )
            """)
            
            cursor = conn.execute("SELECT COUNT(*) FROM export_targets")
            if cursor.fetchone()[0] == 0:
                default_path = os.path.expanduser("~/.hermes/memories")
                conn.execute("INSERT INTO export_targets (id, name, path) VALUES (?, ?, ?)", 
                             (str(uuid.uuid4()), "Hermes Agent", default_path))

    def _format_row(self, row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        try:
            d['tags'] = json.loads(d['tags']) if d['tags'] else []
        except Exception:
            d['tags'] = []
            
        try:
            d['metadata'] = json.loads(d['metadata']) if d['metadata'] else {}
        except Exception:
            d['metadata'] = {}
        return d

    def add_memory(self, mem_type: str, scope: str, content: str, tags: List[str] = None, metadata: Dict[str, Any] = None, synthesize: bool = True) -> str:
        mem_id = str(uuid.uuid4())
        
        # If synthesis is enabled, pass through brain
        if synthesize and content:
            try:
                from .brain import get_brain
                brain = get_brain()
                if brain.ready:
                    semantic_context = self.search_semantic(content, n_results=3)
                    result = brain.synthesize_memory(content, semantic_context)
                    content = result.get("content", content)
                    existing_tags = tags or []
                    new_tags = result.get("tags", [])
                    existing_tags.extend(new_tags)
                    tags = list(set(existing_tags))
            except Exception:
                                existing_tags = tags or []
                                new_tags = result.get("tags", [])
                                existing_tags.extend(new_tags)
                                tags = list(set(existing_tags))
                        except Exception:
                            pass

                    tags_json = json.dumps(tags or [])
                    meta_json = json.dumps(metadata or {})

                    # Simpan ke SQLite
            conn.execute(
                "INSERT INTO memories (id, type, scope, content, tags, metadata) VALUES (?, ?, ?, ?, ?, ?)",
                (mem_id, mem_type, scope, content, tags_json, meta_json)
            )
        
        combined_text = f"Type: {mem_type}, Scope: {scope}. {content}"
        self.collection.add(
            documents=[combined_text],
            metadatas=[{"type": mem_type, "scope": scope, "tags": tags_json}],
            ids=[mem_id]
        )
        return mem_id

    def get_memory(self, mem_id: str) -> Optional[Dict[str, Any]]:
        with sqlite3.connect(self.sqlite_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM memories WHERE id = ?", (mem_id,)).fetchone()
            if row:
                return self._format_row(row)
        return None

    def search_exact(self, query: str = "", scope: str = None, mem_type: str = None) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM memories WHERE 1=1"
        params = []
        if query:
            sql += " AND content LIKE ?"
            params.append(f"%{query}%")
        if scope:
            sql += " AND scope = ?"
            params.append(scope)
        if mem_type:
            sql += " AND type = ?"
            params.append(mem_type)
            
        sql += " ORDER BY updated_at DESC"
        
        with sqlite3.connect(self.sqlite_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(sql, params).fetchall()
            return [self._format_row(row) for row in rows]

    def search_semantic(self, query: str, n_results: int = 5, where_filter: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_filter
        )
        memories = []
        if results and results['ids'] and len(results['ids'][0]) > 0:
            for mem_id in results['ids'][0]:
                mem = self.get_memory(mem_id)
                if mem:
                    memories.append(mem)
        return memories

    def delete_memory(self, mem_id: str) -> bool:
        with sqlite3.connect(self.sqlite_path) as conn:
            cursor = conn.execute("DELETE FROM memories WHERE id = ?", (mem_id,))
            if cursor.rowcount > 0:
                self.collection.delete(ids=[mem_id])
                return True
        return False
        
    def get_export_targets(self) -> List[Dict[str, str]]:
        with sqlite3.connect(self.sqlite_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM export_targets").fetchall()
            return [dict(row) for row in rows]
            
    def add_export_target(self, name: str, path: str) -> str:
        target_id = str(uuid.uuid4())
        with sqlite3.connect(self.sqlite_path) as conn:
            conn.execute("INSERT INTO export_targets (id, name, path) VALUES (?, ?, ?)", (target_id, name, path))
        return target_id
        
    def remove_export_target(self, target_id: str) -> bool:
        with sqlite3.connect(self.sqlite_path) as conn:
            cursor = conn.execute("DELETE FROM export_targets WHERE id = ?", (target_id,))
            return cursor.rowcount > 0

    # === DYNAMIC MCP SERVER REGISTRY ===
    def get_mcp_servers(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.sqlite_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM mcp_servers").fetchall()
            return [{"id": r["id"], "name": r["name"], "command": r["command"], "args": json.loads(r["args"])} for r in rows]

    def add_mcp_server(self, name: str, command: str, args: List[str]) -> str:
        server_id = str(uuid.uuid4())
        with sqlite3.connect(self.sqlite_path) as conn:
            conn.execute("INSERT INTO mcp_servers (id, name, command, args) VALUES (?, ?, ?, ?)", 
                         (server_id, name, command, json.dumps(args)))
        return server_id

    def delete_mcp_server(self, server_id: str) -> bool:
        with sqlite3.connect(self.sqlite_path) as conn:
            cursor = conn.execute("DELETE FROM mcp_servers WHERE id = ?", (server_id,))
            return cursor.rowcount > 0
