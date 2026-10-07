# Amneshia Developer & Agent Directives (AGENTS.md)

This document defines core architectural boundaries, coding standards, and memory protocols for AI agents and human engineers contributing to **Amneshia**.

---

## 1. Project Overview & Core Tenets

Amneshia is a local-first, deterministic knowledge graph and Truth Maintenance System (TMS) for AI agents, implementing the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

### Core Tenets:
1. **Zero LLM Calls in Core Engine:** All graph operations, retrieval (BM25), contradiction checking, and decay scoring execute locally via SQLite FTS5 and rule-based token analysis in `< 1ms`.
2. **Dual-Write Markdown-as-Truth:** Mutations write simultaneously to SQLite and serialize to human-readable Markdown files in `.amneshia/knowledge/{domain}/{entity}.md`. Markdown files are tracked with Git and reviewable in PRs.
3. **Truth Maintenance DAG:** Every observation tracks its premise dependencies via `derived_from: ["<parent-id>"]`. If a premise is revoked or superseded, descendants transition from `active` to `stale`.
4. **Pre-Insertion Contradiction Detection:** Incoming facts are evaluated against existing active facts for polar negation and token overlap before graph insertion.
5. **Git-Native Cloud Sync:** Zero-cost, decentralized cross-device synchronization powered by Git without cloud vendor lock-in.

---

## 2. Codebase Architecture & Key Files

| Module | File Path | Description |
| :--- | :--- | :--- |
| **Database** | `src/database/index.ts` | SQLite wrapper (`better-sqlite3`), WAL mode, prepared statements, FTS5 BM25 search. |
| **Schema** | `src/database/schema.ts` | DDL for entities, observations, relations, and FTS5 virtual tables. |
| **Storage** | `src/storage/markdown-store.ts` | Frontmatter serialization, filesystem layout (`{domain}/{entity}.md`). |
| **Sync** | `src/storage/dual-write.ts` | Bidirectional synchronization between SQLite cache and Markdown files. |
| **Reindex** | `src/storage/reindex.ts` | Full SQLite FTS5 database reconstruction from Markdown directory (< 200ms). |
| **Adoption** | `src/storage/adopt.ts` | Memory adoption engine from global `~/.amneshia` to local `.amneshia`. |
| **Cloud** | `src/cloud/git-sync.ts` | Git-native remote synchronization (`setup`, `status`, `pull`, `push`, `sync`). |
| **Merge Driver** | `src/cloud/merge-driver.ts` | Standalone 3-way semantic Git merge driver for Markdown entities. |
| **Search Engine** | `src/search/hybrid.ts` | Reciprocal Rank Fusion (RRF) combining FTS5 BM25 and dense vector cosine similarity. |
| **Embedder** | `src/search/embedder.ts` | Local ONNX embedder (`all-MiniLM-L6-v2`) with dual PC native / Termux WASM backend. |
| **Tokenizer** | `src/search/tokenizer.ts` | Pure TypeScript WordPiece tokenizer matching BERT vocabulary. |
| **Export** | `src/export/exporter.ts` | Universal memory exporter supporting SQLite (`.db`), Markdown bundle, and JSON. |
| **Maintenance**| `src/maintenance/contradiction.ts`| Polarity check and token-overlap contradiction evaluator. |
| **MCP Server** | `src/server.ts` | Stdio and HTTP/SSE MCP server with dashboard web server. |
| **CLI** | `src/index.ts` | Commander-based CLI entry point (`init`, `reindex`, `stats`, `gc`, `export`, `adopt`, `cloud`, `embed`, `search`, `serve`). |

---

## 3. Engineering & Testing Standards

### 3.1. Strict Zero-Slop Standard
- Never write dummy mocks or `// TODO` in production paths.
- All new features must include 100% test coverage using real temporary directories and real SQLite/Git instances.

### 3.2. Common Gotchas & API Contracts
1. **`DatabaseLayer.addObservation` Signature:**
   Takes positional arguments, NOT an object:
   ```ts
   db.addObservation(entityId, content, source?, importance?, confidence?, expiresAt?, authorityTier?, derivedFrom?);
   ```
2. **Authority Tiers:**
   Always use valid literals: `'invariant' | 'architectural' | 'contextual' | 'ephemeral'`.
3. **Database Methods:**
   Use `db.getObservationsByEntity(entityId)` (not `getObservationsForEntity`).
4. **Git Operations:**
   Always use `execFile('git', args, { cwd })` with safe argument arrays. Never pass raw shell strings to `exec`.
5. **Dual Architecture (PC-First + Termux):**
   Prioritize `onnxruntime-node` on PC workstations for hardware SIMD/GPU, while preserving graceful fallback to `onnxruntime-web` (WebAssembly) for Android Termux userspace.
6. **Smart Git Merge Driver:**
   Always configure merge driver via `amneshia cloud setup-driver` (`-g` for global PC setup) to prevent merge conflict markers across devices.

### 3.3. Test & Verification Pipeline
```bash
npm run typecheck    # tsc --noEmit
npm run build        # tsup src/index.ts --format esm --dts --clean
npm test             # vitest run (must pass 60/60 tests)
```

---

## 4. Amneshia Long-Term Memory Directives

Every AI agent working on this codebase must adhere to the 4-phase memory lifecycle:

### Phase 0: Pre-Flight Codebase Sync (Cross-Device Development)
At the start of a new conversation or if it has been a while since your last chat, ALWAYS execute `git pull` in this project directory (`~/projects/Amneshia`) to fetch the latest engine source code (in case it was updated on Termux or another device). If changes are pulled, run `npm run build` to compile the latest CLI and MCP server before doing any work.

### Phase 1: Pre-Flight Retrieval
Before planning or writing code, retrieve active conventions and past architectural decisions:
```json
{
  "name": "recall",
  "arguments": {
    "query": "<topic or component>",
    "token_budget": 1000
  }
}
```

### Phase 2: In-Flight Truth Maintenance
- Check contradiction alerts returned by `remember`. If an alert is triggered, inspect existing facts before proceeding.
- When replacing or invalidating an older fact, call `forget`:
```json
{
  "name": "forget",
  "arguments": {
    "target": "<observation-id>",
    "hard": false,
    "cascade": true
  }
}
```

### Phase 3: Post-Flight Persistence (Mandatory Debrief)
Upon task completion, record an exhaustive 5-pillar technical debrief:
```json
{
  "name": "remember",
  "arguments": {
    "entity": "Amneshia Core Architecture",
    "facts": [
      "[Context & Rationale] Problem statement, user intent, and why the solution was designed.",
      "[Technical Implementation] Files modified, classes/functions created, algorithms used.",
      "[Operational Parameters] Ports, endpoints, CLI options, environment flags.",
      "[Verification & Test Outcomes] Test suites executed, passing assertions, benchmark numbers.",
      "[Architectural Guardrails & Gotchas] Constraints and edge cases for future developers."
    ],
    "tier": "invariant",
    "domain": "project:amneshia"
  }
}
```

### Phase 4: Dual-Write & Cloud Sync
- Knowledge is automatically serialized to `.amneshia/knowledge/{domain}/{entity}.md`.
- **Pre-Flight Sync (Cross-Device):** At the start of a new conversation or if it has been a while since your last interaction, ALWAYS run a terminal command `amneshia cloud sync` to ensure the memory is perfectly up-to-date with the user's other devices.
- To manually synchronize across devices, run `amneshia cloud sync`.
 
### Phase 5: Media Memory (CAS)
- If a task involves media (images, PDFs, binary files), ingest it into Amneshia's CAS storage via `amneshia media remember <filepath> -e "<entity>"`. 
- Media assets are immutable and linked directly to entity facts. Never attempt to store raw base64 strings or absolute local paths inside standard text observations.
