# Amneshia

**Deterministic, Git-Native Knowledge Graph & Truth Maintenance Engine for AI Agents.**  
Embedded SQLite FTS5 • Markdown-as-Truth • Cascading Invalidation • Model Context Protocol (MCP)

[![Release](https://img.shields.io/badge/version-v3.0.0-6d28d9.svg?style=flat-square)](https://github.com/SabilMurti/Amneshia/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-4c1d95.svg?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/vitest-27%20passed%20(100%25)-059669.svg?style=flat-square)](https://github.com/SabilMurti/Amneshia/actions)
[![MCP](https://img.shields.io/badge/protocol-MCP%201.29-0284c7.svg?style=flat-square)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/language-TypeScript%205.9-2563eb.svg?style=flat-square)](tsconfig.json)

---

## Technical Summary

Amneshia is a local-first memory engine for AI coding agents (Claude Desktop, Cursor, Antigravity, Windsurf) implementing the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). 

It replaces probabilistic, vector-only memory systems with a **deterministic Truth Maintenance System (TMS)** backed by embedded SQLite FTS5 and human-readable Markdown files.

- **Zero LLM Calls inside the Engine:** Retrieval, conflict detection, decay calculation, and deduplication execute locally in `< 1ms` via SQLite FTS5 and rule-based token analysis. Zero external tokens consumed.
- **Markdown-as-Truth (`.amneshia/knowledge/`):** All entities and observations mirror directly to version-controlled Markdown files with YAML frontmatter. Auditable via `git diff` and reviewable in Pull Requests.
- **Truth Maintenance & Cascading Invalidation:** Derived facts track their premises via directed acyclic graphs (`derived_from: [parent_id]`). When a premise is revoked or updated, dependent conclusions automatically transition from `active` to `stale`.
- **Pre-Insertion Contradiction Detection:** Evaluates incoming facts against active entity records for polar opposition and explicit replacements, rejecting or logging conflicts before graph corruption occurs.
- **Lean Context Budget (85% Reduction):** Default 4-tool surface (`remember`, `recall`, `forget`, `context`) reduces prompt schema consumption from ~5,400 tokens to ~800 tokens.

---

## The Problem with Existing Agent Memory

Modern agent memory implementations fall into three flawed paradigms:

### 1. The "LLM-in-LLM" Antipattern
Systems like Mem0 or Zep invoke an external LLM inside the memory engine to summarize, deduce, or reconcile facts. 
- **Latency Penalty:** Every memory query triggers an HTTP request to an inference endpoint, taking 2,000–5,000ms.
- **Stochastic Mutation:** Re-summarizing facts through a probabilistic model introduces hallucination risk and strips away exact technical specifications (e.g. port numbers, compiler flags, exact variable names).
- **Fragile Setup:** Demands API keys, cloud credits, or local Ollama servers running in the background.

### 2. State Invalidation Failure in Vector Databases
Vector similarity search computes cosine distances between text embeddings. It has no concept of state transition over time ($A \to \neg A$).
- If an agent stores `"Database is PostgreSQL"` on Monday, and `"Switched database to SQLite"` on Wednesday, a vector query for `"database setup"` returns *both* embeddings with near-identical similarity scores ($0.88$ vs $0.86$).
- The calling model receives contradictory facts in its context window and hallucinates mixed architectures.

### 3. Opaque Storage Lock-in
Storing memory in proprietary cloud databases or binary embeddings makes it impossible for engineering teams to inspect, debug, or edit what an AI agent has remembered about a codebase.

---

## Architectural Comparison: MCP Memory Ecosystem

| Capability | Amneshia v3 | Official `@modelcontextprotocol/server-memory` | `memori-mcp` | `pgvector` Memory MCP | `Memento` (Neo4j MCP) | `Supermemory` MCP |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Zero External Infrastructure** | **Yes** (Embedded SQLite) | **Yes** (Flat JSON file) | **Yes** | ❌ (Requires Docker PostgreSQL) | ❌ (Requires Neo4j Server) | ❌ (Requires Cloud API Key) |
| **Engine Token Burn** | **0 tokens ($0.00)** | 0 tokens | 0 tokens | 0 tokens | 0 tokens | ❌ (Consumes cloud tokens) |
| **Query Latency** | **< 1ms (SQLite FTS5)** | Linear file scan | Relational scan | 50–120ms (HNSW index) | 20–60ms (Cypher query) | 1,500–3,500ms (HTTP round-trip) |
| **Markdown-as-Truth (Git)** | **Yes** (`.amneshia/knowledge/`) | ❌ (Single `memory.json`) | ❌ (No file truth) | ❌ (PostgreSQL binary tables) | ❌ (Neo4j binary graph) | ❌ (Proprietary cloud storage) |
| **Truth Maintenance (TMS)** | **Yes** (Authority Tiers) | ❌ (None) | ❌ (None) | ❌ (None) | ❌ (None) | ❌ (None) |
| **Cascading Invalidation** | **Yes** (Recursive DAG) | ❌ (None) | ❌ (None) | ❌ (None) | ❌ (None) | ❌ (None) |
| **Contradiction Detection** | **Yes** (Pre-insertion scan) | ❌ (None) | ❌ (None) | ❌ (None) | ❌ (None) | ❌ (None) |
| **Relational Traversal** | **Yes** (GraphRAG Multi-Hop) | ⚠️ (Basic string graph) | ❌ (Tool call history) | ❌ (Flat vector only) | **Yes** (Cypher traversal) | ⚠️ (Basic entity linking) |
| **Token Budgeting** | **Yes** (Enforced byte limits) | ❌ (Dumps raw nodes) | ⚠️ | ❌ (Top-K raw dump) | ❌ (Uncapped subgraphs) | ⚠️ |
| **Interactive Dashboard** | **Yes** (Three.js on port 3457) | ❌ (No UI) | ❌ (No UI) | ❌ (No UI) | ⚠️ (Neo4j Desktop browser) | **Yes** (Cloud-hosted UI) |

---

## Core Systems Deep Dive

### 1. Truth Maintenance System (TMS)

#### Authority Tiers
Every observation is tagged with an authority level that dictates its lifecycle and eviction priority:

| Tier | Weight | Inactivity Threshold | Eviction Behavior | Intended Usage |
|:---|:---:|:---:|:---|:---|
| `invariant` | `1.0` | **∞** | Never decays | User hard requirements, security rules, immutable architecture constraints. |
| `architectural` | `0.8` | 365 days | Transitions to `decayed` | Framework choices, database schemas, structural API contracts. |
| `contextual` | `0.5` | 90 days | Transitions to `decayed` | Current working conventions, active versions, environment configs. |
| `ephemeral` | `0.2` | 7 days / TTL | Hard purged on GC | Scratchpad notes, temporary debug logs, short-lived task state. |

#### Mathematical Decay Scoring
Decay evaluation runs deterministically during maintenance or GC passes:

$$\text{DecayScore} = w_{\text{tier}} \times \left(1 + \log_{10}(\text{accessCount} + 1)\right) \times \max\left(0, 1 - \frac{\text{daysInactive}}{\text{maxDays}}\right)$$

Observations where $\text{DecayScore} < 0.1$ are transitioned from `active` to `decayed`, excluding them from active search queries while preserving audit lineage.

#### Cascading Invalidation DAG
When an agent registers an observation that relies on previous facts, it declares `derived_from: ["<uuid>"]`.
- If a root observation is marked `superseded` or `invalidated`:
  1. The engine identifies all direct and transitive children via breadth-first search across the dependency graph.
  2. All descendants transition status: `active` → `stale`.
  3. Stale observations are filtered out from default `recall` queries, preventing downstream reasoning errors.

#### Pre-Insertion Contradiction Detection
Incoming facts pass through a zero-latency semantic filter prior to database insertion:
1. **Tokenization:** Text is normalized, lowercased, stripped of punctuation, and tokenized into distinct lexemes.
2. **Polarity Check:** Scanned against explicit negation patterns (`not`, `never`, `no longer`, `instead of`, `deprecated`, `removed`, `disabled`).
3. **Opposition Evaluation:** If token overlap between an incoming fact and an active fact on the same entity exceeds ≥ 50%, and one statement contains negation while the other does not, a contradiction event is recorded in `contradiction_log` and returned as a warning payload to the calling agent.

---

### 2. Dual-Write Storage: Markdown-as-Truth

Amneshia operates a dual-write architecture:
- **Write Path:** Graph mutations write simultaneously to SQLite and serialize to human-readable Markdown files located in `.amneshia/knowledge/{domain}/{entity}.md`.
- **Recovery Path:** If the SQLite cache is deleted or desynced, `amneshia reindex` reconstructs the entire FTS5 database directly from the Markdown directory in < 200ms.

#### Sample Entity File (`.amneshia/knowledge/backend/database.md`):

```markdown
---
id: "8f7e2a1b-3c4d-4e5f-9a0b-1c2d3e4f5a6b"
name: "Production Database"
type: "infrastructure"
domain: "backend"
visibility: "public"
created: "2026-09-28T10:00:00.000Z"
updated: "2026-09-28T18:30:00.000Z"
---

## Observations

- **[invariant]** Primary database is PostgreSQL 16 hosted on AWS RDS
  `id: obs-001 | confidence: 1.0 | status: active`

- **[architectural]** Connection pooling configured via PgBouncer with pool_size = 25
  `id: obs-002 | confidence: 0.9 | derived_from: [obs-001] | status: active`

- ~~**[contextual]** SQLite used for local prototype development~~
  `id: obs-003 | confidence: 0.5 | status: superseded | superseded_by: obs-001`

## Relations

- `depends_on` -> AWS VPC Security Group
- `monitored_by` -> Datadog Agent
```

---

### 3. Tool Surface & JSON-RPC Schemas

When initialized with `--tool-profile core` (default), Amneshia exposes **4 high-level MCP tools**:

```
MCP Toolset (Core Profile)
├── remember  : Entity upsert, observation recording, contradiction checks
├── recall    : BM25 full-text search with token budgeting
├── forget    : Soft/hard invalidation with dependency cascade
└── context   : GraphRAG multi-hop relational traversal
```

#### `remember`
```json
{
  "name": "remember",
  "arguments": {
    "entity": "Authentication",
    "facts": ["JWT access tokens expire after 15 minutes", "Refresh tokens stored in HTTP-only cookies"],
    "tier": "architectural",
    "derived_from": ["obs-001"]
  }
}
```

#### `recall`
```json
{
  "name": "recall",
  "arguments": {
    "query": "JWT expiration window",
    "token_budget": 1000,
    "depth": 1
  }
}
```

#### `forget`
```json
{
  "name": "forget",
  "arguments": {
    "target": "obs-002",
    "hard": false,
    "cascade": true
  }
}
```

#### `context`
```json
{
  "name": "context",
  "arguments": {
    "query": "Authentication",
    "depth": 2,
    "limit": 5
  }
}
```

*(For low-level entity and relation CRUD operations, specify `--tool-profile full` during server launch).*

---

## 3D Web Dashboard (Port 3457)

Amneshia ships with a zero-dependency web dashboard built with React 18, Vite, and Three.js ForceGraph, pre-compiled into `dist-ui/`:

- **Neural Universe (3D/2D):** Force-directed spatial graph layout of all entities and typed edges, color-coded by architectural domain.
- **Memory Inspector:** Table view filterable by Authority Tier (`invariant`, `architectural`, `contextual`, `ephemeral`) and status (`active`, `stale`, `decayed`, `superseded`).
- **Contradiction HUD:** Direct UI to inspect detected factual contradictions and resolve them (`override`, `kept_both`, `rejected`).
- **Storage Diagnostics:** Database statistics, table sizes, and one-click triggers for `reindex`, `maintenance`, and `gc`.

```bash
# Launch dashboard
amneshia serve --port 3457

# Open in browser: http://localhost:3457
```

---

## Quickstart & IDE Setup

### Installation

```bash
# Global install directly from GitHub:
npm install -g github:SabilMurti/Amneshia

# Or clone and build from source:
git clone https://github.com/SabilMurti/Amneshia.git
cd Amneshia
npm install
cd dashboard && npm install && npm run build && cd ..
npm run build && npm install -g .
```

### Client Configuration

Add Amneshia to your MCP host configuration:

#### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "amneshia": {
      "command": "amneshia",
      "args": ["--tool-profile", "core"]
    }
  }
}
```

#### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "amneshia": {
      "command": "amneshia",
      "args": ["--tool-profile", "core", "-l"]
    }
  }
}
```
*(Passing `-l` or `--local` scopes memory to `.amneshia/` within the active working directory).*

#### Antigravity / Windsurf (`mcp_config.json`)
```json
{
  "mcpServers": {
    "amneshia": {
      "command": "amneshia",
      "args": ["--tool-profile", "core"]
    }
  }
}
```

---

## CLI Reference

```bash
# Scaffold .amneshia/ directory and .gitignore in current workspace
amneshia init

# Rebuild SQLite FTS5 database from .amneshia/knowledge/ Markdown files
amneshia reindex

# Display memory storage statistics and authority tier breakdown
amneshia stats

# Purge expired and decayed observations
amneshia gc

# Run Web Dashboard server on port 3457
amneshia serve -p 3457

# Launch as a background daemon process
amneshia --background
```

---

## Verified Test Suite

```bash
$ npm test

 ✓ tests/graph.test.ts (2 tests)
 ✓ tests/database.test.ts (8 tests)
 ✓ tests/storage.test.ts (5 tests)
 ✓ tests/consolidation.test.ts (5 tests)
 ✓ tests/tools.test.ts (4 tests)
 ✓ tests/api.test.ts (3 tests)

 Test Files  6 passed (6)
      Tests  27 passed (27)
   Duration  1.61s
```

---

## Design Non-Goals & Architectural Boundaries

To maintain sub-millisecond execution and total determinism, Amneshia explicitly rejects:
- **Embedding Ingestion of Large Arbitrary Blobs:** Amneshia is an agent knowledge graph and decision store, not an unstructured PDF semantic search engine. Use dedicated vector databases (e.g. Qdrant) for raw document embeddings.
- **Distributed Multi-Writer Consensus:** Designed as a local-first single-writer engine. Team collaboration is handled natively through Git pull requests on `.amneshia/knowledge/` Markdown files.
- **Probabilistic LLM Processing in the Core Engine:** Conflict resolution and decay scoring are strictly mathematical and rule-based. The calling agent is the reasoning layer; the memory engine is the ground truth.

---

## Contributing & Community

Amneshia is open source under the **MIT License**. Contributions, bug reports, and architectural RFCs are welcome.

- 📖 **Contributor Guidelines:** See [CONTRIBUTING.md](CONTRIBUTING.md) for local environment setup, architecture standards, and PR workflows.
- 💬 **GitHub Discussions:** Ask questions, share workflows, and discuss features in [GitHub Discussions](https://github.com/SabilMurti/Amneshia/discussions).
- 🐛 **Issue Tracker:** Submit bug reports and feature proposals via [GitHub Issues](https://github.com/SabilMurti/Amneshia/issues).

---

## License

MIT © [Sabil Murti](https://github.com/SabilMurti)
