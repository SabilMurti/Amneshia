#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { startServer } from './server.js';

const program = new Command();

program
  .name('amneshia')
  .description('🧠 Unified memory hub for AI agents')
  .version('2.0.0')
  .option('--data-dir <path>', 'Custom data directory', path.join(os.homedir(), '.amneshia'))
  .option('--http', 'Enable HTTP/SSE server mode', false)
  .option('-p, --port <number>', 'Port number', parseInt, 3457);

async function main(): Promise<void> {
  const options = program.parse(process.argv).opts<{ dataDir: string; http: boolean; port: number }>();
  await startServer({ dataDir: options.dataDir, http: options.http, port: options.port });
}

void main();
