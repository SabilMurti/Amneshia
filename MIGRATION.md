# Migrating to Amneshia v3.0

Amneshia v3 is a major release featuring **Markdown-as-Truth**, **Truth Maintenance**, **Cascading Invalidation**, and an **Ultra-Lean 4-Tool Core Surface**.

---

## 1. Zero-Friction Automatic Database Migration

Amneshia v3 automatically migrates existing SQLite databases (`~/.amneshia/memory.db`) on first start:
- Adds new columns to `observations`: `authority_tier`, `derived_from`, `access_count`, `last_accessed_at`, `status`.
- Automatically assigns default values to existing rows (`authority_tier = 'contextual'`, `status = 'active'`, `derived_from = '[]'`).
- Creates new `contradiction_log` and `access_log` tables.
- Drops deprecated `bridge_servers` tables.
- **Your existing memories and entities remain 100% intact.**

---

## 2. Tool Surface: 18 Tools to 4 Core Tools

In v2, 18 MCP tools consumed over 5,000 tokens of schema overhead.  
In v3, the default `--tool-profile core` exposes only **4 intuitive tools**:

| v2 Tool(s) | v3 Replacement (Core Profile) | Description |
|:---|:---|:---|
| `create_entities` + `add_observations` | `remember` | Unified fact storage with auto-entity creation & conflict check |
| `search_memory`, `search_relevant_memory`, `open_nodes` | `recall` | Token-budgeted search with progressive disclosure & access tracking |
| `delete_entities`, `delete_observations` | `forget` | Targeted deletion or soft invalidation with cascading invalidation |
| `get_context` | `context` | Multi-hop GraphRAG relational retrieval |

### Need Granular Admin Tools?
To expose all 12 tools (including granular entity/relation CRUD and graph snapshots), start Amneshia with `--tool-profile full`:

```json
{
  "mcpServers": {
    "amneshia": {
      "command": "npx",
      "args": ["-y", "amneshia", "--tool-profile", "full"]
    }
  }
}
```

---

## 3. Deprecated & Removed Features

- **MCP Bridge (`manage_bridge_servers`, `list_bridge_tools`, `call_bridge_tool`)**:  
  *Removed.* Modern AI IDEs (Antigravity, Cursor, Claude Code) manage downstream MCP servers directly. Proxying MCP through an MCP server created latency and redundancy.
- **9Router Dedicated Provider**:  
  *Merged.* 9Router is an OpenAI-compatible router. Amneshia's OpenAI provider now supports custom `AMNESHIA_OPENAI_BASE_URL` and model parameters.

---

## 4. Markdown-as-Truth & Git-Native Repositories

In v3, you can use Amneshia per-repository:
```bash
cd your-project
amneshia init
```
This creates:
- `.amneshia/knowledge/`: Domain-organized Markdown files for each entity.
- `.amneshia/config.yaml`: Repository-level configuration.
- `.amneshia/.gitignore`: Excludes ephemeral SQLite cache (`*.db`).

You can commit your `.amneshia/knowledge/` markdown files to Git. To rebuild the local SQLite index anytime:
```bash
amneshia reindex
```
