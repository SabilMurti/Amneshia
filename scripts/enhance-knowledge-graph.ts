/**
 * Script to enrich and establish relational graph edges across Amneshia memory entities.
 * Automatically synchronizes changes to both SQLite and Markdown knowledge files.
 */
import { DatabaseLayer } from '../src/database/index.js';
import { DualWriteSync, resolveStorageConfig } from '../src/storage/index.js';

async function main() {
  const config = resolveStorageConfig(false);
  const db = new DatabaseLayer(config.dataDir);
  const dualWrite = new DualWriteSync(config.knowledgeDir, db);

  const relationsToCreate: Array<{ from: string; to: string; relationType: string }> = [
    // --- Sabil Murti Core Projects & Systems ---
    { from: 'Sabil Murti', to: 'Amneshia', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'Calesteria', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'Caria', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'MitraXNine', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'Klore-Noir', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'Pormulir', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'Voting OSIS (Pemilos)', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'JHIC SMKN9', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'DivineMCLauncher', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'DeviceTrackingSystem', relationType: 'creator_of' },
    { from: 'Sabil Murti', to: 'Amneshia Core Architecture', relationType: 'architect_of' },
    { from: 'Sabil Murti', to: 'Amneshia Project Roadmap & PC Workstation Handoff', relationType: 'author_of' },
    { from: 'Sabil Murti', to: 'Antigravity Journal Dedicated App Architecture & Roadmap', relationType: 'author_of' },
    { from: 'Sabil Murti', to: 'Jurnal 2026-10-05: Implementasi Sistem Curhat Otomatis Antigravity & Amneshia', relationType: 'author_of' },
    { from: 'Sabil Murti', to: 'MurtixEnvironment', relationType: 'configured' },
    { from: 'Sabil Murti', to: 'WSL2 Enterprise Optimization & Security Hardening', relationType: 'configured' },
    { from: 'Sabil Murti', to: 'Termux Operational Environment', relationType: 'configured' },
    { from: 'Sabil Murti', to: 'Termux Startup and Shell Configuration', relationType: 'configured' },
    { from: 'Sabil Murti', to: 'Architectural Stack Recommendation for Sabil Murti', relationType: 'subject_of' },

    // --- Amneshia Ecosystem ---
    { from: 'Amneshia Core Architecture', to: 'Amneshia', relationType: 'subsystem_of' },
    { from: 'Amneshia Core Principles and Contributing Guide', to: 'Amneshia', relationType: 'documentation_of' },
    { from: 'Amneshia Distribution Pipeline', to: 'Amneshia', relationType: 'pipeline_of' },
    { from: 'Amneshia Multi-Channel Distribution Pipeline', to: 'Amneshia', relationType: 'pipeline_of' },
    { from: 'Amneshia PC-First & Termux Hybrid Semantic Engine', to: 'Amneshia', relationType: 'feature_of' },
    { from: 'Amneshia Backup System', to: 'Amneshia', relationType: 'subsystem_of' },
    { from: 'Amneshia Branding & Social Assets', to: 'Amneshia', relationType: 'asset_of' },
    { from: 'Amneshia Dashboard & Diagnostics', to: 'Amneshia', relationType: 'feature_of' },
    { from: 'Amneshia Marketing & Distribution', to: 'Amneshia', relationType: 'marketing_for' },
    { from: 'Amneshia Cloud Setup', to: 'Amneshia', relationType: 'configuration_of' },
    { from: 'Amneshia Cloud Synchronization', to: 'Amneshia', relationType: 'subsystem_of' },
    { from: 'Amneshia Cloud Memory Synchronization', to: 'Amneshia', relationType: 'feature_of' },
    { from: 'Amneshia Directives & Rules', to: 'Amneshia', relationType: 'documentation_of' },
    { from: 'Amneshia Project Roadmap & PC Workstation Handoff', to: 'Amneshia', relationType: 'roadmap_of' },
    { from: 'Amneshia Changelog and GitHub Release Update', to: 'Amneshia', relationType: 'release_of' },
    { from: 'Amneshia JSR Release v3.0.2', to: 'Amneshia', relationType: 'release_of' },
    { from: 'Amneshia Release v3.1.0 Multi-Channel Status', to: 'Amneshia', relationType: 'release_of' },
    { from: 'AmneshiaRelease', to: 'Amneshia', relationType: 'release_of' },
    { from: 'Amneshia Cloud Sync Preference', to: 'Amneshia', relationType: 'preference_for' },
    { from: 'Amneshia README Screenshots', to: 'Amneshia', relationType: 'documentation_of' },
    { from: 'GlamaIntegration', to: 'Amneshia', relationType: 'integration_for' },

    // --- MitraXNine Subsystems ---
    { from: 'MitraXNine Local Build & Zero-RAM Deploy Pattern', to: 'MitraXNine', relationType: 'deployment_pattern_of' },
    { from: 'MitraXNine Admin Dashboard Support WhatsApp', to: 'MitraXNine', relationType: 'feature_of' },
    { from: 'MitraXNine Admin Account Credentials', to: 'MitraXNine', relationType: 'credential_of' },
    { from: 'MitraXNine Cloudflare Turnstile Login Integration', to: 'MitraXNine', relationType: 'security_layer_of' },
    { from: 'MitraXNine Cloudflare Turnstile Production Deployment', to: 'MitraXNine', relationType: 'deployment_of' },
    { from: 'MitraXNine Loading Splash Screen & Attribution', to: 'MitraXNine', relationType: 'ui_component_of' },
    { from: 'MitraXNine Login Tracing & Test Verification', to: 'MitraXNine', relationType: 'testing_of' },
    { from: 'MitraXNine Mobile Footer Padding Fix', to: 'MitraXNine', relationType: 'ui_fix_of' },
    { from: 'MitraXNine Production Deployment', to: 'MitraXNine', relationType: 'deployment_of' },
    { from: 'MitraXNine Production Deployment (Loading Delay & Attribution)', to: 'MitraXNine', relationType: 'deployment_of' },
    { from: 'MitraXNine Production Frontend API URL Fix', to: 'MitraXNine', relationType: 'bugfix_of' },
    { from: 'MitraXNine Security Audit and SuperAdmin Authentication', to: 'MitraXNine', relationType: 'security_audit_of' },
    { from: 'MitraXNine Splash Attribution PPLG Removal', to: 'MitraXNine', relationType: 'ui_revision_of' },
    { from: 'MitraXNine Splash Attribution Revision', to: 'MitraXNine', relationType: 'ui_revision_of' },
    { from: 'MitraXNine Splash Comic Font & Fast Loading Revision', to: 'MitraXNine', relationType: 'ui_revision_of' },
    { from: 'MitraXNine SuperAdmin Password Update', to: 'MitraXNine', relationType: 'credential_of' },
    { from: 'MitraXNine Termux Setup', to: 'MitraXNine', relationType: 'environment_of' },
    { from: 'VPS Migration (202.10.38.46)', to: 'MitraXNine', relationType: 'infrastructure_of' },

    // --- Calesteria & Caria ---
    { from: 'Calesteria installer', to: 'Calesteria', relationType: 'installer_for' },
    { from: 'Calesteria/framework', to: 'Calesteria', relationType: 'core_framework_of' },
    { from: 'Caria', to: 'Calesteria', relationType: 'language_for' },
    { from: 'caria_codegen_wasm', to: 'Caria', relationType: 'compiler_target_of' },
    { from: 'Caria Regex FFI', to: 'Caria', relationType: 'module_of' },
    { from: 'Caria String FFI', to: 'Caria', relationType: 'module_of' },
    { from: 'FFI AOT Pattern', to: 'Caria', relationType: 'pattern_used_by' },

    // --- Voting OSIS / Pemilos ---
    { from: 'project-voting-osis', to: 'Voting OSIS (Pemilos)', relationType: 'project_spec_of' },
    { from: 'Pemilos OSIS Web (Zidan) & High-Concurrency Optimization', to: 'Voting OSIS (Pemilos)', relationType: 'optimization_of' },
    { from: 'Pemilos OSIS Web (Zidan) & Cloudflare Infrastructure', to: 'Voting OSIS (Pemilos)', relationType: 'infrastructure_of' },
    { from: 'Sabil Murti & Zidan Fathul', to: 'Voting OSIS (Pemilos)', relationType: 'lead_developers_of' },

    // --- Journal Pipeline ---
    { from: 'Antigravity Termux API Quick Journaling Pipeline', to: 'Antigravity Journal Dedicated App Architecture & Roadmap', relationType: 'prototype_of' },
    { from: 'Jurnal 2026-10-05: Implementasi Sistem Curhat Otomatis Antigravity & Amneshia', to: 'Antigravity Termux API Quick Journaling Pipeline', relationType: 'entry_of' },
    { from: 'Antigravity Journal Dedicated App Architecture & Roadmap', to: 'Antigravity IDE', relationType: 'powered_by' },
    { from: 'Antigravity Journal Dedicated App Architecture & Roadmap', to: 'Amneshia', relationType: 'stores_memory_in' },
    { from: 'Antigravity Termux API Quick Journaling Pipeline', to: 'Amneshia', relationType: 'stores_memory_in' },

    // --- Antigravity IDE & Tools ---
    { from: 'Antigravity IDE', to: 'amneshia', relationType: 'uses_mcp' },
    { from: 'Antigravity IDE', to: 'codebase-memory-mcp', relationType: 'uses_mcp' },
    { from: 'Antigravity IDE', to: 'github-mcp-server', relationType: 'uses_mcp' },
    { from: 'Antigravity IDE', to: 'filesystem', relationType: 'uses_mcp' },
    { from: 'Antigravity IDE', to: 'context-mode', relationType: 'uses_mcp' },
    { from: 'Antigravity IDE', to: 'context7', relationType: 'uses_mcp' },
    { from: 'Antigravity IDE', to: 'sequential-thinking', relationType: 'uses_mcp' },

    // --- Workspaces & Environments ---
    { from: 'WSL2 Enterprise Optimization & Security Hardening', to: 'MurtixEnvironment', relationType: 'host_environment_of' },
    { from: 'WSL2 Optimization & Security Hardening', to: 'MurtixEnvironment', relationType: 'host_environment_of' },
    { from: 'Termux Operational Environment', to: 'MurtixEnvironment', relationType: 'mobile_environment_of' },
    { from: 'Termux Startup and Shell Configuration', to: 'Termux Operational Environment', relationType: 'configuration_of' },
  ];

  let createdCount = 0;
  let skippedCount = 0;

  for (const rel of relationsToCreate) {
    const fromEntity = db.getEntityByName(rel.from);
    const toEntity = db.getEntityByName(rel.to);

    if (!fromEntity) {
      console.warn(`[Warning] Entity not found: "${rel.from}"`);
      skippedCount++;
      continue;
    }
    if (!toEntity) {
      console.warn(`[Warning] Entity not found: "${rel.to}"`);
      skippedCount++;
      continue;
    }

    try {
      db.createRelation(fromEntity.id, toEntity.id, rel.relationType);
      createdCount++;
      console.log(`[Created] ${fromEntity.name} --(${rel.relationType})--> ${toEntity.name}`);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint failed')) {
        // already exists
        skippedCount++;
      } else {
        console.error(`[Error] Failed to link "${rel.from}" -> "${rel.to}":`, err.message);
      }
    }
  }

  console.log(`\nRelation sync summary: ${createdCount} created, ${skippedCount} skipped/existing.`);

  console.log('[DualWrite] Serializing updated relations into Markdown files...');
  const syncedFiles = dualWrite.syncAll();
  console.log(`[DualWrite] Synced ${syncedFiles} markdown files in ${config.knowledgeDir}`);

  db.close();
}

main().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
