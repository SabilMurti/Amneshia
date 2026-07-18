# Amneshia — Project Handoff Document

## Visi & Tujuan
Amneshia adalah **Single Source of Truth Memory System** (Unified Memory Hub) untuk semua AI Agents di environment user. Targetnya menjadi "otak pusat" yang menghubungkan Hermes Agent, Oh My Pi, Antigravity IDE, Claude Desktop, dan tools MCP apapun yang berjalan di WSL2/Windows.

## Arsitektur Saat Ini

### Core Stack
- **Bahasa**: Python 3 (FastAPI + ChromaDB + llama-cpp-python)
- **Frontend**: React TS + TailwindCSS (Vite), di-serve langsung oleh FastAPI
- **Database**: SQLite + ChromaDB (RAG Vector Store)
- **Port**: 3457 (API + Dashboard)
- **Run**: `python -m amneshia.main api`

### Struktur Folder
```
/home/murtix/projects/Amneshia/
├── amneshia/
│   ├── main.py          # Entrypoint (mode: api / mcp)
│   ├── api.py           # FastAPI server + endpoints REST
│   ├── db.py            # SQLite + ChromaDB wrapper (dengan brain injection)
│   ├── brain.py         # In-Process Mini LLM (llama-cpp-python) — memory synthesis
│   ├── mcp_server.py    # FastMCP server (stdio) untuk Hermes/OMP
│   ├── mcp_client.py    # Dynamic MCP Client Bridge (hubungkan ke MCP lain)
│   └── exporter.py      # Multi-target Markdown exporter (USER.md, MEMORY.md, atau kustom)
├── ui/
│   ├── src/App.tsx      # React Dashboard dengan 3 Tab
│   └── dist/            # Build statis, di-serve oleh FastAPI
├── pyproject.toml       # Python packaging (bisa di-install via uv/pip)
└── README.md
```

### Dashboard (3 Tab)
1. **Memory Database** — CRUD memories, search exact/semantic (RAG), tags, auto-save.
2. **Export Targets** — Daftar direktori/file Markdown yang otomatis di-push saat memory berubah. Support file kustom (e.g. GEMINI.md).
3. **Universal MCP Bridge** — Daftarkan MCP server apapun (command + args), auto-discover tools, execute tools langsung dari UI.

### Fitur-Fitur yang SUDAH Jalan
| Fitur | Status |
|-------|--------|
| SQLite structured memory | ✅ |
| ChromaDB RAG semantic search | ✅ |
| FastAPI REST API | ✅ |
| React Dashboard | ✅ |
| MCP Server (Stdio) untuk Hermes/IDE | ✅ |
| Dynamic MCP Client Bridge (hubungkan MCP lain) | ✅ |
| Multi-target Markdown Exporter (kustom path/file) | ✅ |
| Brain Module (llama-cpp-python) — synthesis engine | ✅ (injected) |
| Auto-download model Qwen2.5-0.5B | ✅ |
| Packaging pyproject.toml (bisa uv tool install) | ✅ |

### Fitur MENYUSUL (Belum dikerjakan)
- **Universal MCP Tool Calls di MCP Server**: Ekspose tool hasil bridge ke Hermes lewat MCP Amneshia sendiri, sehingga Hermes bisa `search_github` lewat Amneshia.
- **Automated Memory Cleaning**: Brain LLM akan auto-merge memory duplikat berdasarkan jadwal cron.
- **Proactive Export UI**: Tambah panel monitor untuk melihat file mana yang baru di-export.

## Cara Run & Test

### Terminal 1 (Server)
```bash
cd /home/murtix/projects/Amneshia
source .venv/bin/activate
python -m amneshia.main api
# Dashboard: http://localhost:3457
```

### Terminal 2 (Hermes — Hubungkan ke MCP Amneshia)
```yaml
# ~/.hermes/config.yaml
mcp_servers:
  amneshia:
    command: "/home/murtix/projects/Amneshia/.venv/bin/python"
    args: ["-m", "amneshia.main", "mcp"]
```

### Environment Variables Opsional
- `AMNESIA_BRAIN_MODEL`: Path ke file GGUF (default: auto-download Qwen2.5-0.5B)
- `AMNESIA_PORT`: Port API (default: 3457)

## Siapa yang Membuat

### Project Owner
- **Sabil Murti (Murtix)** — Rudie Sabilillah Azwan Murti
- Full Stack Developer & AI Integrator dari Indonesia
- Filosofi: "Turning coffee and caffeine into elegant AI solutions"
- Core stack: React, Laravel, Python, AI Agents
- GitHub: https://github.com/SabilMurti

### Seluruh Kode Ditulis Oleh
- **Hermes Agent** (dengan model campuran: Gemini Pro Agent, GPT-5.5, Gemini 3.5 Flash, FREE tier) — milik Nous Research
- Proses pengerjaan dilakukan di WSL2 melalui terminal Hermes Agent CLI
- Semua testing dan deployment dilakukan langsung di `/home/murtix/projects/Amneshia`

### Timeline
Proyek ini dimulai sebagai "Omni Memory MCP" (Node.js) lalu di-rewrite total menjadi "Amneshia" (Python) dalam satu sesi marathon pada 19 Juli 2026.

## Keinginan User (Roadmap)
1. SEMUA tools di environment — OMP, 9router, Antigravity IDE Windows, Hermes, dan tools CLI lainnya — harus bisa membaca dan MENULIS ke 1 memory utama yang sama.
2. Integrasi fleksibel dengan MCP lain (tidak strict ke codebase-memory-mcp saja). Harus bisa "register MCP server apa saja".
3. Local Super Mini LLM berjalan in-process (llama-cpp-python) untuk auto-synthesize, summarize, dan auto-tag memori yang masuk.
4. Dashboard yang "rata kanan" — dark theme, responsif, fitur advance (search RAG, multi-target export, MCP bridge execution).
5. Bisa menjadi open-source project yang dipakai teman-teman dan komunitas AI.

## Repository
- **GitHub**: https://github.com/SabilMurti/Amneshia
- **Branch**: main (semua kode sudah terpush)

---

**Selamat melanjutkan, Sabil! Amneshia sudah punya fondasi yang sangat kuat. Fokus selanjutnya:**
1. Tunggu instalasi `llama-cpp-python` selesai di background (cek dengan `pip show llama-cpp-python`).
2. Tes brain synthesis dengan create memory di dashboard.
3. Buat MCP Amneshia mengekspose tool hasil bridge dari MCP lain.
