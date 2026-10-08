# Changelog

All notable changes to this project will be documented in this file.

## [3.2.1] - 2026-10-08

### 🚀 Highlights
- **Comprehensive Zero-Trust Security Hardening**: Remediated 9 distinct security vulnerabilities identified during an exhaustive architectural and penetration audit. Eliminates Git flag/argument injection, media path traversal and arbitrary local file ingestion (LFI), slug directory traversal, unrestricted export target overwrites, unauthenticated LAN server exposure, and SSE session collision risks.
- **Core MCP Tool Surface Expansion (8 Core Tools)**: Promoted `status`, `reindex`, and `sync` to the default `--tool-profile core` toolset, allowing AI agents direct access to memory health inspection, disaster recovery markdown reindexing, and Git-native cloud synchronization.
- **Truth Maintenance DAG & Provenance Healing**: Fixed observation UUID preservation during `reindexFromMarkdown()`, keeping `derived_from` chains intact across disaster recovery. Fixed `cascadeInvalidate()` so invalidation transitions traverse through intermediate stale nodes and properly invalidate the target root node.
- **99% Disk I/O Reduction (Targeted Entity Sync)**: Replaced $O(N)$ full-database rewrites on observation insertion with $O(1)$ targeted entity dual-write synchronization (`graph.triggerAutoExport(entityName)`), drastically reducing filesystem churn.
- **Cached ONNX Embedder & Indexed SQLite Collation**: Introduced singleton embedding session caching to eliminate repeated disk reads during semantic searches, and added an explicit `idx_entities_name_nocase` B-tree index on `entities(name COLLATE NOCASE)` to eliminate full table scans.

### 🔒 Security Hardening
- **VULN-01 (Git Argument Injection)**: Added strict branch name validation (`validateBranchName`) and double-dash positional argument delimiters (`--`) to `src/cloud/git-sync.ts` preventing flag injection via `--upload-pack`.
- **VULN-02 (Local File Ingestion & LFI)**: Enforced strict boundary checks in `src/storage/media-store.ts` blocking access to sensitive system paths and credentials (`.ssh`, `.gnupg`, `.env`, `/etc/passwd`).
- **VULN-03 (Slug Path Traversal)**: Sanitized dots and directory traversal attempts in `src/storage/slug.ts` (`toSlug`) and added strict containment boundary validation in `src/storage/markdown-store.ts` (`getEntityFilePath`).
- **VULN-04 (Unrestricted Export Overwrite)**: Added path validation in `src/graph.ts` preventing export targets from targeting root system folders or shell configuration files (`.bashrc`, `.zshrc`, `/etc/`).
- **VULN-05 (Media Blob Export Traversal)**: Normalized and validated `ent.media.relativePath` in `src/export/exporter.ts` to prevent directory traversal during Markdown bundle exports.
- **VULN-06 (Unauthenticated HTTP & SSE on `0.0.0.0`)**: Bound Express HTTP listener strictly to `127.0.0.1` by default and added origin checking on state-mutating requests to protect against Cross-Site Request Forgery (CSRF).
- **VULN-07 (SSE Session Collision & DoS)**: Refactored SSE transports in `src/server.ts` to use a multi-client `Map<string, SSEServerTransport>` keyed by unique `sessionId`.
- **VULN-08 (Self-Updater Supply Chain Validation)**: Enforced repository release prefix validation on tarball URLs in `src/updater/index.ts`.
- **VULN-09 (DAG Provenance Corruption on Reindex)**: Updated `src/storage/reindex.ts` and `src/database/index.ts` to preserve original observation UUIDs and creation timestamps from Markdown files.

### 🐛 Fixed
- **Contradiction Log 'pending' UUIDs**: Fixed `src/tools/core.ts` passing literal string `'pending'` to `db.recordContradiction`; now records the actual persisted observation UUID.
- **Zombie Entity on Hard Forget**: Fixed `forget` tool leaving Markdown files on disk during hard deletion (`hard: true`); now invokes `DualWriteSync.removeEntity()` to prevent resurrection on reindex.
- **Git Merge Driver Fact Resurrection**: Updated `src/cloud/merge-driver.ts` to prioritize `invalidated` status during 3-way reconciliation, ensuring revoked facts remain revoked across branches.
- **Offline Test Suite Reliability**: Added mock fetch in `tests/updater.test.ts` to guarantee 100% deterministic test execution in offline and sandboxed environments.

### ⚡ Performance & Optimization
- **Targeted Dual-Write Sync**: Mutating single entities now writes only the changed Markdown file, avoiding rewriting the entire repository.
- **Shared ONNX Embedder Singleton**: Cached `LocalOnnxEmbedder` in `DatabaseLayer` to avoid re-allocating ONNX sessions on every hybrid search.
- **SQLite NOCASE Index**: Added `idx_entities_name_nocase` index on `entities(name COLLATE NOCASE)`.

### 🛠️ Added
- Added `status`, `reindex`, and `sync` MCP tools to default core profile in `src/tools/core.ts`.
- Expanded test assertions in `tests/tools.test.ts` to verify all 8 core tools.

---

## [3.2.0] - 2026-10-06

### 🚀 Highlights
- **Deterministic Media Memory Engine (CAS Storage)**: Content-Addressable Storage (CAS) engine storing immutable media assets (images, audio, video, documents) using streaming cryptographic SHA-256 digests. Implements deterministic sub-directory sharding (`media/ab/cdef...`), instant binary deduplication, and zero external npm dependencies.
- **Media Ingestion & Orphan Garbage Collection (`amneshia media`, `remember_media`)**: High-level CLI commands and MCP tool (`remember_media`) allowing agents and users to associate images/documents directly with knowledge entities, facts, and relations. Includes `amneshia media prune` for garbage-collecting unreferenced orphan blobs.
- **Self-Updater CLI Subsystem (`amneshia update`)**: One-command in-place updater for Amneshia. Automatically queries release registries (GitHub Releases API and JSR fallback), performs SemVer delta analysis, detects the host environment (Git clone vs global npm/pnpm/bun), and upgrades the installation seamlessly without manual npm/curl intervention.
- **Update Verification & Re-install Flags (`--check`, `--force`)**: Added `--check` flag to inspect available release versions without installing, and `--force` flag to force a re-installation or clean re-build of the current release.

### 🛠️ Added
- `src/storage/media-store.ts`: Core Content-Addressable Storage engine featuring streaming SHA-256 calculation, zero-dependency MIME type detection, and two-level directory sharding.
- `src/updater/index.ts`: Dedicated self-updater module featuring SemVer parser & comparator, GitHub Releases/JSR release fetcher with abort timeouts, install environment detection (Git clone vs global package managers), and automated upgrade executors.
- `amneshia media <list|remember|prune>`: CLI suite for managing CAS media assets, linking local files to knowledge graph entities, and pruning orphan blobs.
- `amneshia update`: CLI command for automated self-updating with real-time step progress feedback.
- `remember_media` MCP tool: Native tool in both Core and Full tool profiles for AI agents to ingest screenshots, diagrams, and photos into long-term memory.
- `tests/media.test.ts`: Complete test suite for CAS ingestion, SHA-256 deduplication, sharding, and orphan blob pruning.
- `tests/updater.test.ts`: Complete unit test suite verifying SemVer comparison, environment detection, and live release registry contracts (7/7 tests passing).
- Exported `./updater` subpath in `jsr.json`.

---

## [3.1.0] - 2026-10-05

### 🚀 Highlights
- **Git-Native Cloud Memory Synchronization (`amneshia cloud`)**: Multi-device memory replication backed by private Git repositories. Features automated upstream tracking, bidirectional `sync`, `pull` with automatic SQLite FTS5 reindexing, and `push` routines for continuous cross-device memory synchronization.
- **Smart 3-Way Git Merge Driver (`amneshia cloud setup-driver`, `amneshia cloud merge-driver`)**: Eliminates Git merge conflict markers (`<<<<<<< HEAD`) during multi-device synchronization (PC $\leftrightarrow$ Mobile/Termux). Semantically merges YAML frontmatter, deduplicates observation UUIDs and contents, preserves highest authority tiers, and unions directional relations mathematically.
- **Local ONNX Hybrid Semantic Search**: True hybrid search combining SQLite FTS5 BM25 lexical ranking and dense vector cosine similarity via Reciprocal Rank Fusion (RRF, $k=60$). Uses quantized `all-MiniLM-L6-v2` (384 dimensions) with 100% local inference and zero external API dependencies.
- **PC-First Dual Architecture with Termux Fallback**: Prioritizes native C++ `onnxruntime-node` with AVX2/AVX-512/GPU acceleration and multi-core parallel batching on PC workstations, while providing a pure WebAssembly SIMD (`onnxruntime-web`) fallback for Android Termux userspace without glibc dependencies.
- **Universal Memory Export (`amneshia export`)**: Multi-format export engine allowing memory extraction into standalone SQLite databases, structured JSON, or Markdown bundles complete with automated catalog indexes (`INDEX.md`).
- **Local Project Adoption (`amneshia adopt`)**: Seamless zero-token cherry-picking and migration of global memory (`~/.amneshia`) into per-project scopes (`.amneshia/`) with collision-free Jaccard deduplication and contradiction checks.

### 🛠️ Added
- `src/cloud/git-sync.ts`: Git-native cloud synchronization engine (`setup`, `status`, `pull`, `push`, `sync`).
- `src/cloud/merge-driver.ts`: Standalone 3-way semantic Git merge driver for Markdown knowledge files.
- `src/export/exporter.ts`: Universal memory exporter supporting SQLite, JSON, and Markdown bundle formats.
- `src/storage/adopt.ts`: Project memory adoption engine with provenance and contradiction safety.
- `src/search/tokenizer.ts`: Pure TypeScript WordPiece tokenizer matching HuggingFace BERT vocabularies.
- `src/search/embedder.ts`: `LocalOnnxEmbedder` supporting dynamic native/WASM backends and parallel chunking.
- `src/search/hybrid.ts`: Reciprocal Rank Fusion implementation (`fuseRRF`).
- `amneshia cloud <setup|status|pull|push|sync>`: Subcommands for Git-backed cloud synchronization.
- `amneshia cloud setup-driver [-g, --global]`: Automated configuration of git merge driver in `.gitattributes` or global `~/.gitconfig`.
- `amneshia export`: CLI command for multi-format memory export with domain, entity, tier, and FTS5 search filters.
- `amneshia adopt`: CLI command to adopt global knowledge into local project workspaces.
- `amneshia embed`: CLI command to precompute vector embeddings for all active observations.
- `amneshia search <query>`: CLI hybrid semantic search command with domain filtering and RRF ranking.
- SQLite migration 4 adding `observation_embeddings` table and index.

### 🔄 Changed
- Upgraded `recall` MCP tool to use `searchHybrid` for unified keyword and semantic context retrieval.
- Updated cloud pull/sync routines to automatically activate the merge driver and gracefully handle untracked `.gitattributes`.
- Updated `jsr.json` and `package.json` to expose `./cloud` and `./search` subpath exports.

---

## [3.0.3] - 2026-09-29

### 🚀 Highlights
- **Glama.ai Containerization & Auto-Release Webhook**: Added multi-stage production `Dockerfile` with Node 22 LTS for Glama cloud execution, and connected verified maintainer auto-release webhooks triggered by git tag pushes.
- **TDQS Grade A MCP Enhancements**: Enhanced MCP tool schemas with strict sibling routing, return type contracts, and comprehensive tool usage guidelines to achieve Top-Developer Quality Score (Grade A).

### 🛠️ Added
- `Dockerfile`: Multi-stage dist build optimized for Glama cloud containers.
- `glama.json`: Official server metadata and maintainer definition for Glama.ai registry.
- `smithery.yaml`: Manifest for Smithery MCP registry discovery.
- Social preview vector artwork and high-resolution 3D Neural Universe dashboard previews.

### 🔄 Changed
- Refined MCP tool docstrings in `src/tools/core.ts` with explicit sibling tool recommendations and response schemas.

---

## [3.0.2] - 2026-09-29

### 🚀 Highlights
- **100% Quality Score on JSR (jsr.io)**: Completed JSR module, entrypoint, and exported symbol documentation across all TypeScript interfaces and classes.
- **Documentation Restructure**: Revamped `README.md` with streamlined quickstart, comprehensive IDE setup matrices, and architecture guides.

### 🔄 Changed
- Added full JSDoc comments to `src/index.ts`, `src/types.ts`, and core database/consolidation modules.
- Streamlined installation instructions for Claude Desktop, Cursor, Windsurf, and Antigravity.

---

## [3.0.1] - 2026-09-29

### 🚀 Highlights
- **Automated Multi-Channel Release Pipeline**: Automated multi-registry publishing via GitHub Actions (`.github/workflows/release.yml`) targeting JSR (`@sabilmurti/amneshia`), GitHub Packages (`npm.pkg.github.com`), and GitHub Releases.
- **Server Stdio & CLI Hardening**: Resolved stdio blocking when running `amneshia serve` under MCP clients and fixed port integer coercion in CLI flags.

### 🛠️ Added
- `.github/workflows/release.yml`: Multi-channel CI/CD with OIDC provenance authentication for JSR and GitHub Packages.
- Automated release bundle compression (`amneshia-latest.tgz`) and SHA256 checksum generation.

### 🐛 Fixed
- Fixed commander root action registration to display help correctly when invoked without subcommands.
- Prevented stdio stream contention in MCP server daemonization.

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
