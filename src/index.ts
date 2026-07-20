#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { startServer } from './server.js';

const program = new Command();

program
  .name('amneshia')
  .description('🧠 Unified memory hub for AI agents')
  .version('2.0.0')
  .option('--data-dir <path>', 'Custom data directory', path.join(os.homedir(), '.amneshia'))
  .option('--http', 'Enable HTTP/SSE server mode', true)
  .option('--no-dashboard', 'Disable HTTP Web Dashboard server')
  .option('-p, --port <number>', 'Port number', parseInt, 3457)
  .option('-d, --daemon', 'Run server in background daemon mode', false);

async function main(): Promise<void> {
  const options = program.parse(process.argv).opts<{ dataDir: string; http: boolean; dashboard?: boolean; port: number; daemon: boolean }>();
  const isHttpEnabled = options.dashboard !== false && options.http !== false;

  if (options.daemon) {
    if (!isHttpEnabled) {
      console.error('[Amneshia] Error: Daemon mode requires dashboard to be enabled.');
      process.exit(1);
    }
    const logDir = path.join(os.homedir(), '.amneshia');
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'server.log');
    const out = fs.openSync(logFile, 'a');
    const err = fs.openSync(logFile, 'a');

    const args = process.argv.slice(2).filter(arg => arg !== '--daemon' && arg !== '-d');
    const child = spawn(process.argv[0], [process.argv[1], ...args], {
      detached: true,
      stdio: ['ignore', out, err]
    });

    child.unref();
    console.log(`[Amneshia] Server launched in background daemon mode (PID: ${child.pid}).`);
    console.log(`[Amneshia] Web Dashboard: http://localhost:${options.port}`);
    console.log(`[Amneshia] Server logs: ${logFile}`);
    process.exit(0);
  }

  await startServer({ dataDir: options.dataDir, http: isHttpEnabled, port: options.port });
}

void main();
