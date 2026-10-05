# Changelog

All notable changes to this project will be documented in this file.

## [3.1.0] - 2026-10-05

### 🚀 Highlights
- **Smart 3-Way Git Merge Driver (`amneshia cloud setup-driver`, `amneshia cloud merge-driver`)**: Eliminates Git merge conflict markers (`<<<<<<< HEAD`) during multi-device synchronization (PC $\leftrightarrow$ Mobile/Termux). Semantically merges YAML frontmatter, deduplicates observation UUIDs and contents, preserves highest authority tiers, and unions directional relations mathematically.
- **Local ONNX Hybrid Semantic Search**: True hybrid search combining SQLite FTS5 BM25 lexical ranking and dense vector cosine similarity via Reciprocal Rank Fusion (RRF, $k=60$). Uses quantized `all-MiniLM-L6-v2` (384 dimensions) with 100% local inference and zero external API dependencies.
- **PC-First Dual Architecture with Termux Fallback**: Prioritizes native C++ `onnxruntime-node` with AVX2/AVX-512/GPU acceleration and multi-core parallel batching on PC workstations, while providing a pure WebAssembly SIMD (`onnxruntime-web`) fallback for Android Termux userspace without glibc dependencies.

### 🛠️ Added
- `src/cloud/merge-driver.ts`: Standalone 3-way semantic Git merge driver for Markdown knowledge files.
- `src/search/tokenizer.ts`: Pure TypeScript WordPiece tokenizer matching HuggingFace BERT vocabularies.
- `src/search/embedder.ts`: `LocalOnnxEmbedder` supporting dynamic native/WASM backends and parallel chunking.
- `src/search/hybrid.ts`: Reciprocal Rank Fusion implementation (`fuseRRF`).
- `amneshia embed`: CLI command to precompute vector embeddings for all active observations.
- `amneshia search <query>`: CLI hybrid semantic search command with domain filtering and RRF ranking.
- `amneshia cloud setup-driver -g, --global`: System-wide Git merge driver activation in `~/.gitconfig` for PC developer workflows.
- SQLite migration 4 adding `observation_embeddings` table and index.

### 🔄 Changed
- Upgraded `recall` MCP tool to use `searchHybrid` for unified keyword and semantic context retrieval.
- Updated cloud pull/sync routines to automatically activate the merge driver and gracefully handle untracked `.gitattributes`.

---

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
- Upgraded Web Dashboard to Amneshia 3.0 Electric Violet & Amethyst theme with 3D Neural Universe (Three.js ForceGraph), Memory Inspector, Contradiction Resolver, and Storage Diagnostics.
- Transformed memory maintenance into a 100% deterministic, zero-token system (instant Jaccard deduplication $\ge 0.8$, authority decay, and expired pruning).

### 🗑️ Removed
- Removed MCP bridge system (`manage_bridge_servers`, `list_bridge_tools`, `call_bridge_tool`, `src/bridge/`).
- Removed internal LLM reasoning layer (`src/ai/`), eliminating "LLM-in-LLM" latency and third-party API dependencies.
- Deprecated legacy probabilistic Sleep Cycle in favor of instant deterministic maintenance.
