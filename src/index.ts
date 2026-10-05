#!/usr/bin/env node
/**
 * @module
 * CLI entrypoint and MCP server bootstrap for Amneshia.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { startServer } from './server.js';
import { DatabaseLayer } from './database/index.js';
import { KnowledgeGraph } from './graph.js';
import { initAmneshiaProject, resolveStorageConfig, DualWriteSync, adoptMemory } from './storage/index.js';
import { MemoryExporter, type ExportFormat } from './export/index.js';
import { setupGitRemote, getCloudStatus, cloudPull, cloudPush, cloudSync, setupMergeDriver, mergeMarkdownFiles } from './cloud/index.js';
import { LocalOnnxEmbedder } from './search/index.js';
import type { AuthorityTier } from './types.js';

const program = new Command();

program
  .name('amneshia')
  .description('🧠 Amneshia v3 — Git-native knowledge graph for AI agents with truth maintenance')
  .version('3.2.0')
  .option('--data-dir <path>', 'Custom data directory')
  .option('-l, --local', 'Use local repository directory (.amneshia) instead of global ~/.amneshia')
  .option('--tool-profile <profile>', 'MCP tool profile: "core" (4 tools) or "full" (all tools)', 'core')
  .option('--http', 'Enable HTTP/SSE server mode', true)
  .option('--no-dashboard', 'Disable HTTP Web Dashboard server')
  .option('-p, --port <number>', 'Dashboard port number', (val) => parseInt(val, 10), 3457)
  .option('-b, --background', 'Run server in background daemon mode', false)
  .option('-d, --daemon', 'Alias for --background', false)
  .action(async () => {
    await runDefault();
  });

// Subcommand: init
program
  .command('init [dir]')
  .description('Initialize a local .amneshia/ knowledge graph repository')
  .option('-d, --adopt-domain <domain>', 'Automatically adopt global entities belonging to this domain')
  .option('-a, --adopt-all', 'Automatically adopt all global memory entities into this project')
  .action(async (dir, cmdOpts) => {
    const targetDir = dir ? path.resolve(dir) : process.cwd();
    const { dataDir, knowledgeDir } = initAmneshiaProject(targetDir);
    console.log(`[Amneshia] Initialized local repository:`);
    console.log(`  - Data Directory:      ${dataDir}`);
    console.log(`  - Knowledge Markdown:  ${knowledgeDir}`);
    console.log(`  - Config File:         ${path.join(dataDir, 'config.yaml')}`);
    console.log(`  - Cache .gitignore:    ${path.join(dataDir, '.gitignore')}`);

    if (cmdOpts.adoptDomain || cmdOpts.adoptAll) {
      console.log(`\n[Amneshia] Adopting memories from global storage (~/.amneshia)...`);
      try {
        const adoptRes = await adoptMemory({
          targetDataDir: dataDir,
          domain: cmdOpts.adoptDomain,
          all: cmdOpts.adoptAll,
        });
        console.log(`[Amneshia] Adoption complete:`);
        console.log(`  - Entities Adopted:     ${adoptRes.entitiesAdopted.length} [${adoptRes.entitiesAdopted.join(', ')}]`);
        console.log(`  - Observations Adopted: ${adoptRes.observationsAdopted}`);
        console.log(`  - Relations Adopted:    ${adoptRes.relationsAdopted}`);
        console.log(`  - Skipped Duplicates:   ${adoptRes.skippedDuplicates}`);
        if (adoptRes.contradictionWarnings.length > 0) {
          console.warn(`  - Contradiction Warnings: ${adoptRes.contradictionWarnings.length}`);
        }
      } catch (err: any) {
        console.warn(`[Amneshia] Adoption warning: ${err.message}`);
      }
    }

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
  .description('Garbage collect decayed, expired, and invalidated observations, and purge orphan CAS media blobs')
  .option('-l, --local', 'Run GC on local repository')
  .action((cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);
    const expired = db.cleanupExpired();
    const decayed = db.gc();
    const orphanRes = db.pruneOrphanMedia(config.knowledgeDir);
    console.log(`[Amneshia] Garbage collection complete:`);
    console.log(`  - Purged Expired:      ${expired}`);
    console.log(`  - Purged Decayed:      ${decayed}`);
    console.log(`  - Pruned Orphan Media: ${orphanRes.prunedCount} (${(orphanRes.reclaimedBytes / 1024).toFixed(1)} KB reclaimed)`);
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
    console.log(`  Total Media Assets:   ${stats.totalMediaAssets ?? 0}`);
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
  .option('-p, --port <number>', 'Port number', (val) => parseInt(val, 10))
  .option('-l, --local', 'Use local repository')
  .action(async (cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local;
    const port = cmdOpts.port ?? program.opts().port ?? 3457;
    await startServer({ local: isLocal, http: true, port, stdio: false });
  });

// Subcommand: export
program
  .command('export <output>')
  .description('Export memory knowledge graph to SQLite (.db), Markdown bundle, or JSON')
  .option('-f, --format <format>', 'Export format: sqlite, markdown, json', 'sqlite')
  .option('-d, --domain <domain>', 'Filter by domain name')
  .option('-e, --entity <entities...>', 'Filter by specific entity names')
  .option('-t, --tier <tier>', 'Filter by minimum authority tier (agent, user, system)')
  .option('-q, --query <query>', 'Filter observations using FTS5 search query')
  .option('-l, --local', 'Export from local project repository (.amneshia) instead of global')
  .action(async (output, cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);

    const validFormats: ExportFormat[] = ['sqlite', 'markdown', 'json'];
    const format = (cmdOpts.format || 'sqlite').toLowerCase() as ExportFormat;
    if (!validFormats.includes(format)) {
      console.error(`[Amneshia] Invalid export format: "${cmdOpts.format}". Allowed: ${validFormats.join(', ')}`);
      db.close();
      process.exit(1);
    }

    const tiers: AuthorityTier[] | undefined = cmdOpts.tier
      ? [cmdOpts.tier.toLowerCase() as AuthorityTier]
      : undefined;

    const exporter = new MemoryExporter(db);
    console.log(`[Amneshia] Exporting knowledge graph (${config.mode.toUpperCase()} mode) to ${output}...`);
    try {
      const result = await exporter.export(format, output, {
        domain: cmdOpts.domain,
        entities: cmdOpts.entity,
        tiers,
        query: cmdOpts.query,
      });

      console.log(`\n✅ Amneshia Export Complete:`);
      console.log(`  - Format:       ${result.format.toUpperCase()}`);
      console.log(`  - Destination:  ${result.outputPath}`);
      console.log(`  - Entities:     ${result.entitiesCount}`);
      console.log(`  - Observations: ${result.observationsCount}`);
      console.log(`  - Relations:    ${result.relationsCount}`);
    } catch (err: any) {
      console.error(`[Amneshia] Export failed: ${err.message}`);
      db.close();
      process.exit(1);
    }
    db.close();
  });

// Subcommand: adopt
program
  .command('adopt')
  .description('Adopt accumulated memories from global storage (~/.amneshia) into current local project')
  .option('-d, --domain <domain>', 'Filter global entities by domain')
  .option('-e, --entity <entities...>', 'Filter global entities by names')
  .option('-a, --all', 'Adopt all entities from global storage')
  .option('--dry-run', 'Preview adoption without modifying local project')
  .option('--move', 'Remove adopted observations from source storage after copying')
  .option('-s, --source <path>', 'Custom source data directory (defaults to ~/.amneshia)')
  .option('-t, --target <path>', 'Custom target data directory (defaults to ./.amneshia)')
  .action(async (cmdOpts) => {
    try {
      console.log(`[Amneshia] Starting memory adoption...`);
      const result = await adoptMemory({
        sourceDataDir: cmdOpts.source,
        targetDataDir: cmdOpts.target,
        domain: cmdOpts.domain,
        entities: cmdOpts.entity,
        all: cmdOpts.all,
        dryRun: cmdOpts.dryRun,
        move: cmdOpts.move,
      });

      console.log(`\n${result.dryRun ? '🔍 [DRY RUN] ' : '✅ '}Amneshia Adoption Summary:`);
      console.log(`  - Source:               ${result.sourceDir}`);
      console.log(`  - Target:               ${result.targetDir}`);
      console.log(`  - Entities Adopted:     ${result.entitiesAdopted.length} ${result.entitiesAdopted.length > 0 ? `[${result.entitiesAdopted.join(', ')}]` : ''}`);
      console.log(`  - Observations Adopted: ${result.observationsAdopted}`);
      console.log(`  - Relations Adopted:    ${result.relationsAdopted}`);
      console.log(`  - Skipped Duplicates:   ${result.skippedDuplicates}`);

      if (result.contradictionWarnings.length > 0) {
        console.warn(`\n⚠️  Contradiction Warnings (${result.contradictionWarnings.length}):`);
        for (const warn of result.contradictionWarnings) {
          console.warn(`    - Entity "${warn.entity}": ${warn.fact} (${warn.reason})`);
        }
      }
    } catch (err: any) {
      console.error(`[Amneshia] Adoption failed: ${err.message}`);
      process.exit(1);
    }
  });

// Subcommand: embed
program
  .command('embed')
  .description('Compute local ONNX vector embeddings for all observations for hybrid semantic search')
  .option('-l, --local', 'Use local repository (.amneshia)')
  .option('-f, --force', 'Force re-embedding of all observations')
  .action(async (cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);
    const embedder = new LocalOnnxEmbedder();

    try {
      console.log(`[Amneshia] Initializing local ONNX embedder (${embedder.getModelName()})...`);
      await embedder.init();

      const engineName =
        embedder.getBackend() === 'native'
          ? 'Native C++ (PC Hardware Accelerated)'
          : 'WebAssembly SIMD (Universal / Termux)';
      console.log(`[Amneshia] Active Inference Engine: ${engineName}`);

      if (cmdOpts.force) {
        db.clearEmbeddings(embedder.getModelName());
      }

      const pending = db.getUnembeddedObservations(embedder.getModelName());
      console.log(`[Amneshia] Found ${pending.length} observations needing vector embeddings.`);

      if (pending.length === 0) {
        console.log(`✅ All observations are already embedded.`);
        db.close();
        return;
      }

      const start = Date.now();
      let completed = 0;
      const isMobile = process.platform === 'android' || Boolean(process.env.TERMUX_VERSION);
      const chunkSize = isMobile ? 5 : 16;

      for (let i = 0; i < pending.length; i += chunkSize) {
        const chunk = pending.slice(i, i + chunkSize);
        const vectors = await Promise.all(chunk.map((item) => embedder.embed(item.content)));
        for (let j = 0; j < chunk.length; j++) {
          db.saveObservationEmbedding(chunk[j].id, vectors[j], embedder.getModelName());
        }
        completed += chunk.length;
        process.stdout.write(`\r  Embedding progress: ${completed}/${pending.length} (${Math.round((completed / pending.length) * 100)}%)`);
      }

      const duration = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`\n\n✅ Embedding complete: ${completed} observations embedded in ${duration}s.`);
    } catch (err: any) {
      console.error(`\n[Amneshia] Embedding failed: ${err.message}`);
      db.close();
      process.exit(1);
    }
    db.close();
  });

// Subcommand: search
program
  .command('search <query>')
  .description('Search knowledge graph using Hybrid Semantic (FTS5 + ONNX Vector RRF)')
  .option('-d, --domain <domain>', 'Filter by domain')
  .option('-l, --local', 'Use local repository')
  .option('-n, --limit <number>', 'Result limit', (val) => parseInt(val, 10), 10)
  .action(async (query, cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);

    try {
      const results = await db.searchHybrid(query, {
        limit: cmdOpts.limit || 10,
        domain: cmdOpts.domain,
      });

      console.log(`\n🔍 Hybrid Search Results for "${query}" (${results.length} matches):`);
      console.log(`-------------------------------------------------------------`);
      if (results.length === 0) {
        console.log('  No matching memories found.');
      } else {
        for (const res of results) {
          console.log(`\n📌 ${res.entity.name} [${res.entity.domain}] (RRF Score: ${res.rank.toFixed(5)})`);
          for (const obs of res.observations) {
            console.log(`   - [${obs.authorityTier}] ${obs.content}`);
          }
        }
      }
      console.log('');
    } catch (err: any) {
      console.error(`[Amneshia] Search error: ${err.message}`);
      db.close();
      process.exit(1);
    }
    db.close();
  });

// Subcommand: media
const mediaCmd = program
  .command('media')
  .description('Manage Content-Addressable Storage (CAS) media memory assets');

mediaCmd
  .command('list')
  .description('List all registered media assets across the knowledge graph')
  .option('-l, --local', 'Use local repository (.amneshia)')
  .action((cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);
    const assets = db.getAllMediaAssets();

    console.log(`\n📸 Amneshia Media Assets (${assets.length} stored in ${config.mode.toUpperCase()} mode):`);
    console.log(`--------------------------------------------------------------------------------`);
    if (assets.length === 0) {
      console.log('  No media assets found.');
    } else {
      for (const asset of assets) {
        const ent = db.getEntityById(asset.entityId);
        const entName = ent ? ent.name : asset.entityId;
        const sizeKb = (asset.fileSize / 1024).toFixed(1);
        console.log(`📌 Entity: "${entName}" | File: ${asset.fileName} (${asset.mimeType}, ${sizeKb} KB)`);
        console.log(`   SHA-256: ${asset.sha256}`);
        console.log(`   Path:    ${asset.relativePath}`);
        console.log(`   Created: ${asset.createdAt}\n`);
      }
    }
    db.close();
  });

mediaCmd
  .command('remember <filePath>')
  .description('Ingest a local media asset with attached facts and relations into CAS')
  .requiredOption('-e, --entity <name>', 'Entity name representing this media asset')
  .option('-d, --domain <domain>', 'Domain namespace', 'personal')
  .option('-f, --fact <facts...>', 'Factual observations describing the media')
  .option('-t, --tier <tier>', 'Authority tier (invariant, architectural, contextual, ephemeral)', 'contextual')
  .option('-r, --relation <relations...>', 'Relationship links in format "relationType:targetEntity"')
  .option('-l, --local', 'Use local repository (.amneshia)')
  .action(async (filePath, cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);
    const sync = new DualWriteSync(config.knowledgeDir, db);
    const graph = new KnowledgeGraph(db, sync);

    const facts: string[] = cmdOpts.fact ?? [];
    if (facts.length === 0) {
      facts.push(`Media asset ${path.basename(filePath)} ingested into Amneshia CAS.`);
    }

    const relations: Array<{ to: string; relationType: string }> = [];
    if (cmdOpts.relation) {
      for (const relStr of cmdOpts.relation) {
        const colonIdx = relStr.indexOf(':');
        if (colonIdx > 0) {
          const relationType = relStr.slice(0, colonIdx).trim();
          const to = relStr.slice(colonIdx + 1).trim();
          if (relationType && to) {
            relations.push({ relationType, to });
          }
        }
      }
    }

    try {
      const resolvedPath = path.resolve(filePath);
      console.log(`[Amneshia] Ingesting media: ${resolvedPath}...`);
      const result = await graph.rememberMedia({
        filePath: resolvedPath,
        entity: cmdOpts.entity,
        domain: cmdOpts.domain,
        facts,
        tier: cmdOpts.tier as AuthorityTier,
        relations,
      });

      console.log(`\n✅ Media Ingested Successfully:`);
      console.log(`  - Entity:       ${result.entity.name} [${result.entity.domain}]`);
      console.log(`  - Media File:   ${result.media.fileName} (${result.media.mimeType}, ${(result.media.fileSize / 1024).toFixed(1)} KB)`);
      console.log(`  - SHA-256:      ${result.media.sha256}`);
      console.log(`  - Sharded Path: ${result.media.relativePath}`);
      console.log(`  - Deduplicated: ${result.deduplicated ? 'Yes (reused existing blob)' : 'No (new blob stored)'}`);
      console.log(`  - Observations: ${result.observationIds.length}`);
      console.log(`  - Relations:    ${result.relations.length}`);
    } catch (err: any) {
      console.error(`[Amneshia] Media ingestion failed: ${err.message}`);
      db.close();
      process.exit(1);
    }
    db.close();
  });

mediaCmd
  .command('prune')
  .description('Purge unreferenced orphan media blobs from CAS storage')
  .option('-l, --local', 'Use local repository (.amneshia)')
  .action((cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);

    console.log(`[Amneshia] Scanning CAS storage for orphan blobs in ${config.knowledgeDir}...`);
    const pruneRes = db.pruneOrphanMedia(config.knowledgeDir);
    console.log(`\n✅ Media CAS Pruning Complete:`);
    console.log(`  - Blobs Removed:  ${pruneRes.prunedCount}`);
    console.log(`  - Reclaimed Disk: ${(pruneRes.reclaimedBytes / 1024).toFixed(1)} KB`);
    db.close();
  });

// Subcommand: cloud
const cloudCmd = program
  .command('cloud')
  .description('Git-native cross-device synchronization for Amneshia knowledge');

cloudCmd
  .command('setup <remoteUrl>')
  .description('Initialize or link a Git remote repository for cloud knowledge sync')
  .option('-b, --branch <branch>', 'Target git branch', 'main')
  .option('-l, --local', 'Use local repository (.amneshia) instead of global')
  .action(async (remoteUrl, cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    try {
      console.log(`[Amneshia] Setting up Git-native cloud sync at: ${config.knowledgeDir}`);
      const res = await setupGitRemote(config.knowledgeDir, remoteUrl, cmdOpts.branch);
      console.log(`\n✅ Cloud Remote Configured:`);
      console.log(`  - Knowledge Dir: ${config.knowledgeDir}`);
      console.log(`  - Remote URL:    ${res.remoteUrl}`);
      console.log(`  - Branch:        ${res.branch}`);
      console.log(`\nNext steps: Run "amneshia cloud push" or "amneshia cloud sync" to sync knowledge.`);
    } catch (err: any) {
      console.error(`[Amneshia] Cloud setup failed: ${err.message}`);
      process.exit(1);
    }
  });

cloudCmd
  .command('status')
  .description('Check cloud sync status, branch info, and uncommitted knowledge changes')
  .option('-l, --local', 'Use local repository')
  .action(async (cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    try {
      const status = await getCloudStatus(config.knowledgeDir);
      console.log(`\n🧠 Amneshia Cloud Status (${config.mode.toUpperCase()} mode):`);
      console.log(`-----------------------------------------------`);
      console.log(`  Initialized:     ${status.initialized ? 'Yes' : 'No'}`);
      console.log(`  Knowledge Dir:   ${status.knowledgeDir}`);
      console.log(`  Remote URL:      ${status.remoteUrl ?? '(None - run "amneshia cloud setup <url>")'}`);
      console.log(`  Branch:          ${status.branch}`);
      console.log(`  Clean:           ${status.clean ? 'Yes' : 'Has uncommitted changes'}`);
      console.log(`  Last Synced At:  ${status.lastSyncAt ?? 'Never'}`);
      if (status.uncommittedFiles.length > 0) {
        console.log(`\n  Uncommitted Changes (${status.uncommittedFiles.length}):`);
        for (const file of status.uncommittedFiles) {
          console.log(`    - ${file}`);
        }
      }
      console.log('');
    } catch (err: any) {
      console.error(`[Amneshia] Cloud status check failed: ${err.message}`);
      process.exit(1);
    }
  });

cloudCmd
  .command('pull')
  .description('Pull latest knowledge updates from Git remote and rebuild SQLite FTS5 index')
  .option('-b, --branch <branch>', 'Branch to pull from', 'main')
  .option('-l, --local', 'Use local repository')
  .action(async (cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);
    try {
      console.log(`[Amneshia] Pulling from cloud remote into ${config.knowledgeDir}...`);
      const result = await cloudPull(config.knowledgeDir, db, cmdOpts.branch);
      console.log(`\n✅ Knowledge Pulled & Reindexed:`);
      console.log(`  - Entities Reindexed:     ${result.reindex.entities}`);
      console.log(`  - Observations Reindexed: ${result.reindex.observations}`);
      console.log(`  - Relations Reindexed:    ${result.reindex.relations}`);
    } catch (err: any) {
      console.error(`[Amneshia] Cloud pull failed: ${err.message}`);
      db.close();
      process.exit(1);
    }
    db.close();
  });

cloudCmd
  .command('push')
  .description('Commit and push local knowledge markdown changes to Git remote')
  .option('-m, --message <message>', 'Custom commit message')
  .option('-b, --branch <branch>', 'Branch to push to', 'main')
  .option('-l, --local', 'Use local repository')
  .action(async (cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    try {
      console.log(`[Amneshia] Pushing knowledge to cloud remote...`);
      const result = await cloudPush(config.knowledgeDir, cmdOpts.message, cmdOpts.branch);
      console.log(`\n✅ Cloud Push Complete:`);
      console.log(`  - Status:  ${result.message}`);
      if (result.commitHash) {
        console.log(`  - Commit:  ${result.commitHash}`);
      }
    } catch (err: any) {
      console.error(`[Amneshia] Cloud push failed: ${err.message}`);
      process.exit(1);
    }
  });

cloudCmd
  .command('sync')
  .description('Atomic bidirectional sync: pull remote changes, reindex, and push local changes')
  .option('-b, --branch <branch>', 'Target git branch', 'main')
  .option('-l, --local', 'Use local repository')
  .action(async (cmdOpts) => {
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    const db = new DatabaseLayer(config.dataDir);
    try {
      console.log(`[Amneshia] Running bidirectional cloud sync on ${config.knowledgeDir}...`);
      const result = await cloudSync(config.knowledgeDir, db, cmdOpts.branch);
      console.log(`\n✅ Cloud Sync Successful (${result.syncedAt}):`);
      console.log(`  - Reindexed Entities:     ${result.pull.reindex.entities}`);
      console.log(`  - Reindexed Observations: ${result.pull.reindex.observations}`);
      console.log(`  - Push Status:            ${result.push.message}`);
      if (result.push.commitHash) {
        console.log(`  - Commit Hash:            ${result.push.commitHash}`);
      }
    } catch (err: any) {
      console.error(`[Amneshia] Cloud sync failed: ${err.message}`);
      db.close();
      process.exit(1);
    }
    db.close();
  });

cloudCmd
  .command('merge-driver <base> <ours> <theirs> [targetPath]')
  .description('Internal 3-way git merge driver for knowledge markdown entities')
  .action((base, ours, theirs, targetPath) => {
    try {
      mergeMarkdownFiles(base, ours, theirs, targetPath);
      process.exit(0);
    } catch (err: any) {
      console.error(`[Amneshia Merge Driver] Conflict resolution failed: ${err.message}`);
      process.exit(1);
    }
  });

cloudCmd
  .command('setup-driver')
  .description('Configure and activate the 3-way git merge driver in knowledge directory or globally (~/.gitconfig)')
  .option('-g, --global', 'Configure globally across all Git repositories (~/.gitconfig)')
  .option('-l, --local', 'Use local repository')
  .action(async (cmdOpts) => {
    const isGlobal = Boolean(cmdOpts.global);
    const isLocal = cmdOpts.local || program.opts().local || fs.existsSync(path.join(process.cwd(), '.amneshia'));
    const config = resolveStorageConfig(isLocal);
    try {
      const success = await setupMergeDriver(config.knowledgeDir, { isGlobal });
      if (success) {
        if (isGlobal) {
          console.log(`\n✅ Amneshia 3-Way Git Merge Driver successfully activated globally in ~/.gitconfig!`);
          console.log(`   Any repository with "*.md merge=amneshia" will now use Amneshia automatically.`);
        } else {
          console.log(`\n✅ Amneshia 3-Way Git Merge Driver successfully activated for ${config.knowledgeDir}`);
        }
      } else {
        console.error(`[Amneshia] Knowledge directory not initialized with Git. Run "amneshia cloud setup <url>" first.`);
        process.exit(1);
      }
    } catch (err: any) {
      console.error(`[Amneshia] Setup merge driver failed: ${err.message}`);
      process.exit(1);
    }
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

// Parse arguments and execute
await program.parseAsync(process.argv).catch((err) => {
  console.error('[Amneshia] Fatal error:', err);
  process.exit(1);
});

