# Contributing to Amneshia

Thank you for your interest in contributing to **Amneshia**!  
Amneshia is an enterprise-grade, zero-token, 100% deterministic knowledge graph memory system for AI agents, built on Model Context Protocol (MCP), SQLite FTS5, and Markdown-as-truth.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please treat all contributors and users with respect, humility, and technical rigor.

---

## Development Setup

### Prerequisites

- **Node.js**: `>= 18.0.0` (v20+ recommended)
- **npm** or **pnpm**
- **Git**

### Installation

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/Amneshia.git
   cd Amneshia
   ```

2. Install dependencies:
   ```bash
   npm install
   cd dashboard && npm install && cd ..
   ```

3. Build the core package and dashboard:
   ```bash
   cd dashboard && npm run build && cd ..
   npm run build
   ```

4. Run the test suite:
   ```bash
   npm test
   ```

---

## Project Architecture

- **`src/`**: Amneshia v3 Core TypeScript codebase
  - **`database/`**: SQLite database layer, schema DDL, and migrations
  - **`graph/`**: Knowledge graph operations and GraphRAG multi-hop traversal
  - **`storage/`**: Markdown-as-truth store (`.amneshia/knowledge/`) and FTS5 reindex engine
  - **`maintenance/`**: 100% deterministic Truth Maintenance System (Jaccard dedup, authority decay, cascading invalidation, contradiction detector)
  - **`tools/`**: MCP tool registrations (Core 4 profile vs Full profile)
  - **`server.ts`**: MCP stdio transport + Express HTTP/SSE server (Port 3457)
- **`dashboard/`**: React 18 + Vite + Tailwind CSS + Three.js 3D ForceGraph web dashboard
- **`tests/`**: Vitest unit and integration test suite

---

## Core Development Principles ("The Amneshia Way")

1. **Zero External LLM inside the Engine:**
   Amneshia is called *by* AI agents (Claude, Gemini, GPT). It must NEVER call an LLM inside itself. All conflict resolution, decay, deduplication, and truth maintenance must remain 100% deterministic and execute in sub-milliseconds (< 1ms).
2. **Ground Truth Fidelity:**
   Never mutate or synthesize user observations unexpectedly. What the user/agent writes is preserved with exact integrity.
3. **Markdown-as-Truth:**
   Every memory must be human-readable, git-committable, and verifiable via `git diff`.
4. **Type Safety & Testing:**
   All pull requests must pass TypeScript strict type checking (`npm run typecheck`) and the full Vitest suite (`npm test`).

---

## Submitting Pull Requests

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes adhering to existing architectural standards.
3. Run tests and type checks:
   ```bash
   npm test
   npm run typecheck
   ```
4. Commit using Conventional Commits:
   - `feat(core): add feature X`
   - `fix(tms): resolve edge case in contradiction detector`
   - `docs(readme): clarify MCP config`
5. Push to your fork and submit a Pull Request to `SabilMurti/Amneshia:main`.
6. Explain the technical rationale, test coverage, and any breaking changes in your PR description.

---

## Questions or Ideas?

Feel free to open an issue or start a discussion in [GitHub Discussions](https://github.com/SabilMurti/Amneshia/discussions). We're excited to build the future of AI agent memory together!
