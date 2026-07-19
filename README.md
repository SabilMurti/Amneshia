# 🧠 Amneshia

[![Release](https://badgen.net/badge/version/v2.0.0/blue)](https://github.com/SabilMurti/Amneshia/releases)
[![License](https://badgen.net/badge/license/MIT/green)](LICENSE)
[![CI Status](https://github.com/SabilMurti/Amneshia/actions/workflows/ci.yml/badge.svg)](https://github.com/SabilMurti/Amneshia/actions)
[![Tests](https://badgen.net/badge/tests/12%20passed/green)](https://github.com/SabilMurti/Amneshia/actions)

Unified, zero-external-database, multi-agent long-term memory hub. Built on top of **SQLite FTS5 + BM25 Search**, incorporating a **Universal MCP Bridge Manager**, a local **Sleep Cycle Memory Consolidation Engine**, and an interactive **TasteSkill Web Dashboard**.

---

## Architecture Diagram

Amneshia coordinates Stdio and SSE/HTTP transports, managing underlying storage, background consolidation tasks, and MCP integrations:

```mermaid
flowchart TB
    %% Class Definitions for Styling
    classDef client fill:#1e1e2e,stroke:#a855f7,stroke-width:2px,color:#fff;
    classDef transport fill:#1e1e2e,stroke:#06b6d4,stroke-width:2px,color:#fff;
    classDef core fill:#181825,stroke:#3b82f6,stroke-width:2px,color:#fff;
    classDef bridge fill:#1e1e2e,stroke:#f59e0b,stroke-width:2px,color:#fff;
    classDef db fill:#11111b,stroke:#10b981,stroke-width:2px,color:#fff;

    subgraph Clients ["1. Clients & Agent IDEs"]
        Agent["🤖 AI Agents (Antigravity IDE / Cursor / Windsurf / Claude Code)"]:::client
        Browser["🌐 TasteSkill Web Dashboard (React 18 + Vite)"]:::client
    end

    subgraph Transport ["2. Transport & Communication Layer"]
        Stdio["⚡ Stdio Transport (JSON-RPC 2.0)"]:::transport
        SSE["🌐 HTTP / SSE Server (Port 3457)"]:::transport
        REST["🔗 REST API Endpoints"]:::transport
    end

    subgraph Amneshia ["3. Amneshia v2 Core Knowledge Engine"]
        MCP["🛠️ 18 MCP Tools Surface"]:::core
        Graph["🧠 Knowledge Graph Engine"]:::core
        Sleep["🌙 Sleep Cycle Consolidation Engine"]:::core
        Exporter["📄 Markdown Auto-Exporter"]:::core
        DB[("💾 SQLite FTS5 Storage (~/.amneshia/memory.db)")]:::db
    end

    subgraph Bridges ["4. Universal MCP Bridge System"]
        Bridge["🔌 Bridge Client Manager"]:::bridge
        CM["💻 codebase-memory-mcp (Port 9749)"]:::bridge
        Other["🌐 External Custom MCP Servers"]:::bridge
    end

    %% Flow Connections
    Agent <-->|Stdio Stream / SSE| Transport
    Browser <-->|HTTP REST API| REST

    Stdio <-->|JSON-RPC| MCP
    SSE <-->|HTTP Events| REST
    REST <-->|API Handler| Graph

    MCP <-->|CRUD & FTS Queries| Graph
    Graph <-->|BM25 Search & SQL Triggers| DB
    Sleep <-->|Jaccard Pruning & Conflict Supersession| DB
    Graph -->|Sync Markdown Mirror| Exporter

    Graph <-->|Bridge Proxy Tools| Bridge
    Bridge <-->|Auto-Sync Projects| CM
    Bridge <-->|Proxy Tool Call| Other
```

---

## Key Features

- **Semantic Knowledge Graph** — Not a simple, flat key-value store. Entities are organized using structured, typed relationships and observations.
- **FTS5 BM25 Search** — Integrates SQLite FTS5 extension with BM25 ranking for fast, typo-tolerant full-text query lookup.
- **Universal MCP Bridge** — Interoperability with external MCP servers (such as `codebase-memory-mcp`) allowing synchronization of external facts and tools dynamically.
- **Sleep Cycle Memory Consolidation** — Evaluates similarity metrics (Jaccard Similarity $\ge 0.8$) and LLM context analysis during sleep/idle states to deduplicate memories, resolve conflicts, track update histories, and purge expired ephemeral data.
- **Access Control Whitelisting** — Visibility properties (`public`, `restricted`, `private`) and whitelisting arrays (`allowedAgents`) prevent unauthorized agent access.
- **TasteSkill Web Dashboard** — Rich visual interface for exploring graphs, managing target exports, controlling bridge servers, and viewing memory statistics.

---

## Quick Start

### 1. Direct Run via GitHub

You can run Amneshia instantly from GitHub without installing anything:

```bash
# Run HTTP Web Dashboard & REST API
npx -y github:SabilMurti/Amneshia --http --port 3457
```

Or install globally via GitHub:

```bash
npm install -g github:SabilMurti/Amneshia

# Then run anywhere:
amneshia --http --port 3457
```

### 2. Stdio Mode (Standard IDE Integration)

To connect Amneshia to your editor/agent environment (e.g., Cursor, Antigravity IDE, Claude Code), add the server entry in your MCP config (`mcp_config.json`):

```json
{
  "mcpServers": {
    "amneshia": {
      "command": "npx",
      "args": ["-y", "github:SabilMurti/Amneshia"]
    }
  }
}
```

---

## Complete MCP Tools Reference (18 Tools)

Amneshia exposes 18 specialized tools to client agents for managing the memory cycle, querying data, and bridging other servers:

| Category | Tool Name | Parameters | Description |
| :--- | :--- | :--- | :--- |
| **Entity** | `create_entities` | `entities` (array of Entity Inputs) | Creates new unique entities with type, domain, and access whitelists. |
| | `delete_entities` | `names` (string array of names) | Removes entities and cascades deletes to their observations and relations. |
| **Relation** | `create_relations` | `relations` (array of Relation Inputs) | Establishes typed connections (e.g., `creator_of`, `works_on`) between entities. |
| | `delete_relations` | `ids` (string array of relation IDs) | Deletes specified relations by ID. |
| **Observation** | `add_observations` | `observations` (array of Obs Inputs) | Attaches raw observations or LLM-synthesized facts to an entity. |
| | `delete_observations`| `ids` (string array of observation IDs) | Deletes specified observations. |
| | `update_observation` | `id` (string), `content` (string), `changedBy`? | Updates observation content while logging the change history. |
| **Query & Graph**| `search_memory` | `query` (string), `limit`? | Performs FTS5 BM25 search across entity names, types, and observations. |
| | `read_graph` | `domain`?, `entityType`? | Retreives the full or filtered knowledge graph snapshot. |
| | `open_nodes` | `names` (string array) | Retrieves full attributes, observations, and relations of specific nodes. |
| **Lifecycle** | `cleanup_expired` | *None* | Deletes ephemeral observations that have passed their expiration date. |
| | `consolidate_memory`| `domain`? | Performs conflict resolution, near-duplicate Jaccard pruning, and synthesis. |
| | `get_stats` | *None* | Returns storage metrics, entity domain breakdowns, and recent activity logs. |
| **Exporter** | `export_memory` | *None* | Exports current graph snapshot to active Markdown targets. |
| | `manage_export_targets`| `action`, `name`?, `path`?, `format`?, `id`?, `autoExport`? | Registers, removes, or toggles auto-export Markdown paths. |
| | `configure_ai` | `provider` (string) | Changes default AI synthesis provider (`none`, `ollama`, `openai`). |
| **Universal Bridge**| `manage_bridge_servers`| `action` (string), `name`?, `command`?, `args`?, `id`? | Adds, lists, or removes downstream bridged MCP servers in SQLite. |
| | `list_bridge_tools` | `serverId` (string), `command`?, `args`? | Queries a bridged server to retrieve its exposed tools. |
| | `call_bridge_tool` | `serverId` (string), `toolName` (string), `arguments`? | Executes a tool on a bridged server and returns the result. |

---

## Web Dashboard & Codebase Integration

Amneshia serves a web client on `http://localhost:3457` when running in HTTP mode. The client provides:
1. **Interactive Graph Visualizer** for looking at entity links and node clusters.
2. **Bridge Manager** to register downstream MCP servers (e.g. `codebase-memory-mcp`) and configure commands/args.
3. **Settings Controls** to switch LLM Providers (Ollama, OpenAI, or None) and manage auto-export markdown logs.

### Codebase Memory MCP Bridge Sync

[**codebase-memory-mcp**](https://github.com/DeusData/codebase-memory-mcp) is an advanced MCP server by DeusData that creates structural codebase knowledge graphs (AST analysis, function signatures, dependency trees, and git metadata) for AI agents.

When `codebase-memory-mcp` is configured as a bridge server in Amneshia and enabled, the system supports 1-click cross-graph synchronization via the `/api/bridge/sync` REST endpoint (or `call_bridge_tool`). This triggers an automated scan of the bridged server's active codebase indices, importing:

- Workspace root paths.
- Codebase nodes and edges metrics.
- Active git branches and commit SHAs.

These synchronized details are stored directly under the project entity's observations prefixed with `[Codebase Memory MCP]`.

---

## Recommended Agent Directives / System Rules

To give your AI Agent (Cursor, Antigravity IDE, Claude Code, Windsurf, etc.) optimal long-term memory behavior, copy and paste the following prompt rules into your agent's custom instructions file (e.g. `GEMINI.md`, `CLAUDE.md`, `.cursorrules`, `AGENTS.md`):

```markdown
### Long-Term Memory & Knowledge Graph Directives (Amneshia)
You are equipped with **Amneshia** (`amneshia`), a zero-external-database SQLite FTS5 long-term memory hub and Knowledge Graph.

1. **Session-Start Memory Retrieval**:
   - At the beginning of a conversation or session, call `search_memory` or `read_graph` to recall user context, active project preferences, entity relationships, and architectural decisions.
2. **Proactive Fact & Preference Persistence**:
   - Whenever the user shares a new preference, personal detail, workflow choice, or project update, proactively invoke `add_observations` or `create_entities` to store it permanently in Amneshia.
3. **Conflict Resolution & Consolidation**:
   - When user preferences change or old statements are updated, append the revision via `add_observations`, or call `consolidate_memory` ("Sleep Cycle") to track update histories and supersede outdated memories automatically.
```

---

## License

MIT © Sabil Murti (Murtix)
