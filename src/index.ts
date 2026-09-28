#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { startServer } from './server.js';
import { DatabaseLayer } from './database/index.js';
import { initAmneshiaProject, resolveStorageConfig, DualWriteSync } from './storage/index.js';

const program = new Command();

program
  .name('amneshia')
  .description('🧠 Amneshia v3 — Git-native knowledge graph for AI agents with truth maintenance')
  .version('3.0.0')
  .option('--data-dir <path>', 'Custom data directory')
  .option('-l, --local', 'Use local repository directory (.amneshia) instead of global ~/.amneshia')
  .option('--tool-profile <profile>', 'MCP tool profile: "core" (4 tools) or "full" (all tools)', 'core')
  .option('--http', 'Enable HTTP/SSE server mode', true)
  .option('--no-dashboard', 'Disable HTTP Web Dashboard server')
  .option('-p, --port <number>', 'Dashboard port number', parseInt, 3457)
  .option('-b, --background', 'Run server in background daemon mode', false)
  .option('-d, --daemon', 'Alias for --background', false);

// Subcommand: init
program
  .command('init [dir]')
  .description('Initialize a local .amneshia/ knowledge graph repository')
  .action((dir) => {
    const targetDir = dir ? path.resolve(dir) : process.cwd();
    const { dataDir, knowledgeDir } = initAmneshiaProject(targetDir);
    console.log(`[Amneshia] Initialized local repository:`);
    console.log(`  - Data Directory:      ${dataDir}`);
    console.log(`  - Knowledge Markdown:  ${knowledgeDir}`);
    console.log(`  - Config File:         ${path.join(dataDir, 'config.yaml')}`);
    console.log(`  - Cache .gitignore:    ${path.join(dataDir, '.gitignore')}`);
    console.log(`\nReady! Track your markdown files with git, and commit knowledge directly.`);
  });

// Subcommand: reindex
program
  .command('reindex')
  .description('Rebuild SQLite FTS5 cache index from markdown files')
  .option('-l, --local', 'Reindex local repository in current working directory')
  .action((cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    console.log(`[Amneshia] Reindexing from: ${config.knowledgeDir}`);
    const db = new DatabaseLayer(config.dataDir);
    const sync = new DualWriteSync(config.knowledgeDir, db);
    const result = sync.reindex();
    console.log(`[Amneshia] Reindex complete:`);
    console.log(`  - Entities:     ${result.entities}`);
    console.log(`  - Observations: ${result.observations}`);
    console.log(`  - Relations:    ${result.relations}`);
    db.close();
  });

// Subcommand: sync
program
  .command('sync')
  .description('Export all SQLite entities and observations to Markdown-as-Truth files')
  .option('-l, --local', 'Sync local repository')
  .action((cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    console.log(`[Amneshia] Exporting all knowledge to Markdown at: ${config.knowledgeDir}`);
    const db = new DatabaseLayer(config.dataDir);
    const sync = new DualWriteSync(config.knowledgeDir, db);
    const count = sync.syncAll();
    console.log(`[Amneshia] Successfully synced ${count} entities to Markdown-as-Truth files!`);
    db.close();
  });

// Subcommand: gc
program
  .command('gc')
  .description('Garbage collect decayed, expired, and invalidated observations')
  .option('-l, --local', 'Run GC on local repository')
  .action((cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);
    const expired = db.cleanupExpired();
    const decayed = db.gc();
    console.log(`[Amneshia] Garbage collection complete:`);
    console.log(`  - Purged Expired:  ${expired}`);
    console.log(`  - Purged Decayed:  ${decayed}`);
    db.close();
  });

// Subcommand: stats
program
  .command('stats')
  .description('Display knowledge graph statistics and health breakdown')
  .option('-l, --local', 'Display stats for local repository')
  .action((cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);
    const stats = db.getStats();

    console.log(`\n🧠 Amneshia Knowledge Graph Stats (${config.mode.toUpperCase()} mode):`);
    console.log(`-----------------------------------------------`);
    console.log(`  Total Entities:       ${stats.totalEntities}`);
    console.log(`  Total Observations:   ${stats.totalObservations}`);
    console.log(`  Total Relations:      ${stats.totalRelations}`);
    console.log(`  Export Targets:       ${stats.totalExportTargets}`);
    console.log(`  Open Contradictions:  ${stats.totalContradictions ?? 0}`);

    if (stats.observationsByTier && Object.keys(stats.observationsByTier).length > 0) {
      console.log(`\n  Observations by Authority Tier:`);
      for (const [tier, count] of Object.entries(stats.observationsByTier)) {
        console.log(`    - ${tier.padEnd(15)}: ${count}`);
      }
    }

    if (stats.observationsByStatus && Object.keys(stats.observationsByStatus).length > 0) {
      console.log(`\n  Observations by Status:`);
      for (const [status, count] of Object.entries(stats.observationsByStatus)) {
        console.log(`    - ${status.padEnd(15)}: ${count}`);
      }
    }

    if (stats.entitiesByDomain && Object.keys(stats.entitiesByDomain).length > 0) {
      console.log(`\n  Entities by Domain:`);
      for (const [domain, count] of Object.entries(stats.entitiesByDomain)) {
        console.log(`    - ${domain.padEnd(15)}: ${count}`);
      }
    }
    console.log('');
    db.close();
  });

// Subcommand: serve
program
  .command('serve')
  .description('Start the HTTP Web Dashboard server')
  .option('-p, --port <number>', 'Port number', parseInt, 3457)
  .option('-l, --local', 'Use local repository')
  .action(async (cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local;
    const port = cmdOpts.port || program.opts().port || 3457;
    await startServer({ local: isLocal, http: true, port, stdio: false });
  });

// Default server launch
async function runDefault(): Promise<void> {
  const options = program.opts<{
    dataDir?: string;
    local?: boolean;
    toolProfile?: 'core' | 'full';
    http: boolean;
    dashboard?: boolean;
    port: number;
    background?: boolean;
    daemon?: boolean;
  }>();

  const isBackground = options.background || options.daemon;
  const isHttpEnabled = options.dashboard !== false && options.http !== false;
  const toolProfile = options.toolProfile === 'full' ? 'full' : 'core';

  if (isBackground) {
    if (!isHttpEnabled) {
      console.error('[Amneshia] Error: Background mode requires dashboard to be enabled.');
      process.exit(1);
    }
    const logDir = path.join(os.homedir(), '.amneshia');
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'server.log');
    const out = fs.openSync(logFile, 'a');
    const err = fs.openSync(logFile, 'a');

    const args = process.argv
      .slice(2)
      .filter((arg) => arg !== '--daemon' && arg !== '-d' && arg !== '--background' && arg !== '-b');

    const child = spawn(process.argv[0], [process.argv[1], ...args], {
      detached: true,
      stdio: ['ignore', out, err],
    });

    child.unref();
    console.log(`[Amneshia] Server launched in background daemon mode (PID: ${child.pid}).`);
    console.log(`[Amneshia] Web Dashboard: http://localhost:${options.port}`);
    console.log(`[Amneshia] Server logs: ${logFile}`);
    process.exit(0);
  }

  await startServer({
    dataDir: options.dataDir,
    local: options.local,
    toolProfile,
    http: isHttpEnabled,
    port: options.port,
  });
}

// Parse args or run default
const knownSubcommands = ['init', 'reindex', 'sync', 'gc', 'stats', 'serve', 'help'];
const hasSubcommand = process.argv.slice(2).some((arg) => knownSubcommands.includes(arg));

program.parse(process.argv);

if (!hasSubcommand) {
  void runDefault();
}

