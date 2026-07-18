import { runMcpServer } from './mcp/index.js';
import { runApiServer } from './api/server.js';

const mode = process.argv[2] || 'mcp';

if (mode === 'api') {
  // Hanya jalan sebagai API & Dashboard server (Daemon)
  runApiServer(3456);
} else if (mode === 'mcp') {
  // Hanya jalan sebagai MCP Server (via Stdio untuk Hermes/IDE)
  runMcpServer().catch(console.error);
} else {
  // Fallback hybrid (kalau dipanggil manual tanpa arg)
  runApiServer(3456);
  runMcpServer().catch(console.error);
}