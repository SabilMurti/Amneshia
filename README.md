# Amneshia

A unified "Single Source of Truth" memory system with RAG for AI Agents (Hermes, Oh My Pi, Antigravity IDE, Claude Desktop, etc.).

## Architecture
- **Language**: Python (FastAPI + MCP SDK)
- **Database**: SQLite (built-in, zero native dependencies) + Vector Embeddings for RAG
- **Dashboard**: React TS (Vite) embedded and served by FastAPI
- **Auto-Exporter**: Syncs to Hermes `USER.md` and `MEMORY.md` automatically

## Vision
Amneshia acts as the central brain for all your AI agents and tools. It provides both exact-match memory (structured SQLite) and semantic search (Vector DB for RAG). The built-in MCP server allows *any* MCP-compatible tool (like `codebase-memory-mcp` or Claude Desktop) to connect and utilize the unified memory.
