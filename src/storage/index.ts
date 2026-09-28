import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseLayer } from '../database/index.js';
import type { Entity, Observation, RelationWithNames } from '../types.js';
import {
  deleteEntityMarkdown,
  getEntityFilePath,
  loadAllEntityMarkdowns,
  parseEntityMarkdown,
  saveEntityMarkdown,
  serializeEntity,
} from './markdown-store.js';
import { reindexFromMarkdown, type ReindexResult } from './reindex.js';

export * from './markdown-store.js';
export * from './reindex.js';
export * from './slug.js';

export interface StorageConfig {
  mode: 'global' | 'local';
  dataDir: string;
  knowledgeDir: string;
}

export function resolveStorageConfig(forceLocal = false): StorageConfig {
  const cwd = process.cwd();
  const localAmneshiaDir = path.join(cwd, '.amneshia');

  // If explicitly requested or if local .amneshia exists in cwd
  if (forceLocal || fs.existsSync(localAmneshiaDir)) {
    return {
      mode: 'local',
      dataDir: localAmneshiaDir,
      knowledgeDir: path.join(localAmneshiaDir, 'knowledge'),
    };
  }

  const globalDir = path.join(os.homedir(), '.amneshia');
  return {
    mode: 'global',
    dataDir: globalDir,
    knowledgeDir: path.join(globalDir, 'knowledge'),
  };
}

export function initAmneshiaProject(targetDir: string = process.cwd()): { dataDir: string; knowledgeDir: string } {
  const dataDir = path.join(targetDir, '.amneshia');
  const knowledgeDir = path.join(dataDir, 'knowledge');
  const configPath = path.join(dataDir, 'config.yaml');
  const gitignorePath = path.join(dataDir, '.gitignore');

  fs.mkdirSync(knowledgeDir, { recursive: true });

  if (!fs.existsSync(configPath)) {
    const defaultConfig = `# Amneshia v3 Project Configuration
version: "3.0.0"
storage:
  mode: "local"
  dual_write: true
truth_maintenance:
  auto_cascade: true
  contradiction_detection: true
maintenance:
  jaccard_threshold: 0.8
  decay_enabled: true
`;
    fs.writeFileSync(configPath, defaultConfig, 'utf-8');
  }

  if (!fs.existsSync(gitignorePath)) {
    const defaultGitignore = `# Amneshia ephemeral SQLite cache (rebuilt automatically from knowledge/)
*.db
*.db-wal
*.db-shm
*.log
`;
    fs.writeFileSync(gitignorePath, defaultGitignore, 'utf-8');
  }

  return { dataDir, knowledgeDir };
}

export class DualWriteSync {
  constructor(private readonly knowledgeDir: string, private readonly database: DatabaseLayer) {
    fs.mkdirSync(this.knowledgeDir, { recursive: true });
  }

  syncEntity(entity: Entity): string {
    const observations = this.database.getObservationsByEntity(entity.id);
    const relations = this.database.getRelationsByEntity(entity.id);
    return saveEntityMarkdown(this.knowledgeDir, entity, observations, relations);
  }

  syncAll(): number {
    const snapshot = this.database.readGraph();
    let count = 0;
    for (const entity of snapshot.entities) {
      saveEntityMarkdown(this.knowledgeDir, entity, entity.observations, entity.relations);
      count++;
    }
    return count;
  }

  removeEntity(domain: string, name: string): boolean {
    return deleteEntityMarkdown(this.knowledgeDir, domain, name);
  }

  reindex(): ReindexResult {
    return reindexFromMarkdown(this.knowledgeDir, this.database);
  }
}
