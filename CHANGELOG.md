# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - 2026-09-28

### 🚀 Highlights
- **Markdown-as-Truth & Git-Native**: Primary knowledge storage in human-readable, git-trackable Markdown files with YAML frontmatter.
- **Truth Maintenance System**: Logical provenance tracking (`derived_from`) and recursive cascading invalidation (`active` -> `stale`).
- **Pre-Insertion Contradiction Detection**: Semantic and rule-based opposition checks to protect the knowledge graph from contradictory claims.
- **Authority-Tier Value Decay**: Invariant, architectural, contextual, and ephemeral tiers with mathematical decay scoring.
- **Ultra-Lean Tool Profile**: Default 4-tool core surface (`remember`, `recall`, `forget`, `context`) reducing prompt schema tokens by 85%.

### 🛠️ Added
- `remember` tool: High-level store with auto-upsert and pre-insertion contradiction warnings.
- `recall` tool: Unified search with strict token budgeting and access frequency tracking.
- `forget` tool: Soft invalidation, hard delete, and cascading invalidation.
- `amneshia init`: Scaffold per-repo `.amneshia/` directory structure.
- `amneshia reindex`: Fast rebuilder of SQLite FTS5 BM25 index from Markdown files.
- `amneshia gc`: Garbage collector for decayed, stale, and expired observations.
- `amneshia stats`: Terminal dashboard with authority tier and status breakdowns.
- Auto-migration from v2 databases without data loss.

### 🔄 Changed
- Refactored `DatabaseLayer` into modular architecture (`schema.ts`, `migrations.ts`, `index.ts`).
- Sleep Cycle consolidation redesigned: non-destructive, tier-isolated deduplication.
- OpenAI provider made fully generic for custom base URLs and models.

### 🗑️ Removed
- Removed MCP bridge system (`manage_bridge_servers`, `list_bridge_tools`, `call_bridge_tool`, `src/bridge/`).
- Removed legacy `src/ai/9router.ts` (merged into OpenAI-compatible provider).
