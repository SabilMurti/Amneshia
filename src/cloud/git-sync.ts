/**
 * @module
 * Git-Native Cloud Synchronization Engine for Amneshia.
 * Leverages Git as a zero-cost, self-hostable, version-controlled sync layer for Markdown knowledge files.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DatabaseLayer } from '../database/index.js';
import { reindexFromMarkdown, type ReindexResult } from '../storage/reindex.js';

const execFileAsync = promisify(execFile);

export interface CloudConfig {
  remoteUrl: string;
  branch: string;
  lastSyncAt: string | null;
}

export interface CloudStatusResult {
  initialized: boolean;
  knowledgeDir: string;
  remoteUrl: string | null;
  branch: string;
  clean: boolean;
  uncommittedFiles: string[];
  lastSyncAt: string | null;
}

export interface CloudPullResult {
  pulled: boolean;
  rawOutput: string;
  reindex: ReindexResult;
}

export interface CloudPushResult {
  pushed: boolean;
  commitHash?: string;
  message: string;
}

export interface CloudSyncResult {
  pull: CloudPullResult;
  push: CloudPushResult;
  syncedAt: string;
}

/**
 * Execute a git command inside the target directory using safe argument arrays.
 */
async function git(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync('git', args, { cwd });
  } catch (error: any) {
    const errorMsg = error.stderr || error.stdout || error.message;
    throw new Error(`Git error (${args[0]}): ${errorMsg.trim()}`);
  }
}

function getCloudConfigPath(knowledgeDir: string): string {
  return path.join(path.dirname(knowledgeDir), 'cloud.json');
}

export function readCloudConfig(knowledgeDir: string): CloudConfig | null {
  const cfgPath = getCloudConfigPath(knowledgeDir);
  if (!fs.existsSync(cfgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveCloudConfig(knowledgeDir: string, config: CloudConfig): void {
  const cfgPath = getCloudConfigPath(knowledgeDir);
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Configure and initialize git-native remote repository inside knowledge directory.
 */
export async function setupGitRemote(
  knowledgeDir: string,
  remoteUrl: string,
  branch = 'main'
): Promise<{ success: boolean; remoteUrl: string; branch: string }> {
  fs.mkdirSync(knowledgeDir, { recursive: true });

  const gitDir = path.join(knowledgeDir, '.git');
  if (!fs.existsSync(gitDir)) {
    await git(knowledgeDir, ['init', '-b', branch]);
  }

  // Ensure git user identity is configured locally if not set globally
  try {
    await git(knowledgeDir, ['config', 'user.name']);
  } catch {
    await git(knowledgeDir, ['config', 'user.name', 'Amneshia Agent']);
    await git(knowledgeDir, ['config', 'user.email', 'amneshia@local']);
  }

  // Setup standard .gitignore inside knowledgeDir
  const gitignorePath = path.join(knowledgeDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "*.db*\n*.log*\n.DS_Store\n", 'utf-8');
  }

  // Setup remote origin
  let hasOrigin = false;
  try {
    const { stdout } = await git(knowledgeDir, ['remote']);
    hasOrigin = stdout.split('\n').map((r) => r.trim()).includes('origin');
  } catch {}

  if (hasOrigin) {
    await git(knowledgeDir, ['remote', 'set-url', 'origin', remoteUrl]);
  } else {
    await git(knowledgeDir, ['remote', 'add', 'origin', remoteUrl]);
  }

  saveCloudConfig(knowledgeDir, {
    remoteUrl,
    branch,
    lastSyncAt: null,
  });

  // Automatically activate smart 3-way merge driver for markdown knowledge
  await setupMergeDriver(knowledgeDir);

  return { success: true, remoteUrl, branch };
}

/**
 * Setup and activate smart 3-way merge driver in the knowledge repository or globally in ~/.gitconfig.
 */
export async function setupMergeDriver(
  knowledgeDir: string,
  options?: { isGlobal?: boolean }
): Promise<boolean> {
  if (options?.isGlobal) {
    await git(process.cwd(), ['config', '--global', 'merge.amneshia.name', 'Amneshia Markdown 3-Way Merge Driver']);
    await git(process.cwd(), ['config', '--global', 'merge.amneshia.driver', 'amneshia cloud merge-driver %O %A %B %P']);
    return true;
  }

  const gitDir = path.join(knowledgeDir, '.git');
  if (!fs.existsSync(gitDir)) return false;

  // 1. Ensure .gitattributes maps *.md to amneshia merge driver
  const gitattributesPath = path.join(knowledgeDir, '.gitattributes');
  const attrLine = '*.md merge=amneshia';
  if (!fs.existsSync(gitattributesPath)) {
    fs.writeFileSync(gitattributesPath, `${attrLine}\n`, 'utf-8');
  } else {
    const content = fs.readFileSync(gitattributesPath, 'utf-8');
    if (!content.includes('merge=amneshia')) {
      fs.appendFileSync(gitattributesPath, `\n${attrLine}\n`, 'utf-8');
    }
  }

  // 2. Configure git merge driver in repository config
  await git(knowledgeDir, ['config', 'merge.amneshia.name', 'Amneshia Markdown 3-Way Merge Driver']);
  await git(knowledgeDir, ['config', 'merge.amneshia.driver', 'amneshia cloud merge-driver %O %A %B %P']);

  return true;
}

/**
 * Check current git-native cloud sync status.
 */
export async function getCloudStatus(knowledgeDir: string): Promise<CloudStatusResult> {
  const gitDir = path.join(knowledgeDir, '.git');
  const initialized = fs.existsSync(gitDir);
  const config = readCloudConfig(knowledgeDir);

  if (!initialized) {
    return {
      initialized: false,
      knowledgeDir,
      remoteUrl: config?.remoteUrl ?? null,
      branch: config?.branch ?? 'main',
      clean: true,
      uncommittedFiles: [],
      lastSyncAt: config?.lastSyncAt ?? null,
    };
  }

  let remoteUrl = config?.remoteUrl ?? null;
  try {
    const { stdout } = await git(knowledgeDir, ['remote', 'get-url', 'origin']);
    remoteUrl = stdout.trim();
  } catch {}

  let branch = config?.branch ?? 'main';
  try {
    const { stdout } = await git(knowledgeDir, ['branch', '--show-current']);
    if (stdout.trim()) branch = stdout.trim();
  } catch {}

  const { stdout: statusOut } = await git(knowledgeDir, ['status', '--porcelain']);
  const uncommittedFiles = statusOut
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    initialized: true,
    knowledgeDir,
    remoteUrl,
    branch,
    clean: uncommittedFiles.length === 0,
    uncommittedFiles,
    lastSyncAt: config?.lastSyncAt ?? null,
  };
}

/**
 * Pull latest markdown changes from remote git repository and reindex into SQLite FTS5.
 */
export async function cloudPull(
  knowledgeDir: string,
  db: DatabaseLayer,
  branch = 'main'
): Promise<CloudPullResult> {
  const status = await getCloudStatus(knowledgeDir);
  if (!status.initialized || !status.remoteUrl) {
    throw new Error('Cloud sync not initialized. Run "amneshia cloud setup <remote-url>" first.');
  }

  // If untracked .gitignore or .gitattributes exists locally, temporarily remove to avoid merge conflicts with remote
  const gitignorePath = path.join(knowledgeDir, '.gitignore');
  let hadUntrackedGitignore = false;
  if (fs.existsSync(gitignorePath)) {
    try {
      const { stdout } = await git(knowledgeDir, ['status', '--porcelain', '.gitignore']);
      if (stdout.includes('??')) {
        fs.unlinkSync(gitignorePath);
        hadUntrackedGitignore = true;
      }
    } catch {}
  }

  const gitattributesPath = path.join(knowledgeDir, '.gitattributes');
  let hadUntrackedGitattributes = false;
  if (fs.existsSync(gitattributesPath)) {
    try {
      const { stdout } = await git(knowledgeDir, ['status', '--porcelain', '.gitattributes']);
      if (stdout.includes('??')) {
        fs.unlinkSync(gitattributesPath);
        hadUntrackedGitattributes = true;
      }
    } catch {}
  }

  // Ensure merge driver configuration in git config is set before pulling
  await git(knowledgeDir, ['config', 'merge.amneshia.name', 'Amneshia Markdown 3-Way Merge Driver']);
  await git(knowledgeDir, ['config', 'merge.amneshia.driver', 'amneshia cloud merge-driver %O %A %B %P']);

  let rawOutput = '';
  try {
    const res = await git(knowledgeDir, ['pull', 'origin', branch, '--no-rebase']);
    rawOutput = res.stdout + res.stderr;
  } catch (err: any) {
    // If remote branch does not exist yet (e.g. freshly created remote), treat as initial pull
    if (err.message.includes("couldn't find remote ref") || err.message.includes("no such ref")) {
      rawOutput = 'Remote branch does not exist yet; continuing with local state.';
    } else {
      // Restore files if pull failed and they were removed
      if (hadUntrackedGitignore && !fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, "*.db*\n*.log*\n.DS_Store\n", 'utf-8');
      }
      if (hadUntrackedGitattributes && !fs.existsSync(gitattributesPath)) {
        fs.writeFileSync(gitattributesPath, "*.md merge=amneshia\n", 'utf-8');
      }
      throw err;
    }
  }

  // Ensure .gitignore and merge driver (.gitattributes) exist after pull
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "*.db*\n*.log*\n.DS_Store\n", 'utf-8');
  }
  await setupMergeDriver(knowledgeDir);

  // Rebuild SQLite FTS5 index from updated markdown files
  const reindex = reindexFromMarkdown(knowledgeDir, db);

  const cfg = readCloudConfig(knowledgeDir) ?? { remoteUrl: status.remoteUrl, branch, lastSyncAt: null };
  cfg.lastSyncAt = new Date().toISOString();
  saveCloudConfig(knowledgeDir, cfg);

  return {
    pulled: true,
    rawOutput,
    reindex,
  };
}

/**
 * Stage, commit, and push markdown files to remote git repository.
 */
export async function cloudPush(
  knowledgeDir: string,
  message?: string,
  branch = 'main'
): Promise<CloudPushResult> {
  const status = await getCloudStatus(knowledgeDir);
  if (!status.initialized || !status.remoteUrl) {
    throw new Error('Cloud sync not initialized. Run "amneshia cloud setup <remote-url>" first.');
  }

  await git(knowledgeDir, ['add', '-A']);

  const { stdout: statusOut } = await git(knowledgeDir, ['status', '--porcelain']);
  const hasChanges = statusOut.trim().length > 0;

  if (hasChanges) {
    const hostname = os.hostname();
    const timestamp = new Date().toISOString();
    const commitMsg = message ?? `amneshia(sync): update knowledge graph from ${hostname} (${timestamp})`;
    await git(knowledgeDir, ['commit', '-m', commitMsg]);
  }

  let commitHash = '';
  try {
    const { stdout: revOut } = await git(knowledgeDir, ['rev-parse', 'HEAD']);
    commitHash = revOut.trim();
  } catch {}

  const pushRes = await git(knowledgeDir, ['push', '-u', 'origin', branch]);

  const cfg = readCloudConfig(knowledgeDir) ?? { remoteUrl: status.remoteUrl, branch, lastSyncAt: null };
  cfg.lastSyncAt = new Date().toISOString();
  saveCloudConfig(knowledgeDir, cfg);

  return {
    pushed: true,
    commitHash,
    message: hasChanges ? 'Committed and pushed latest changes' : 'Pushed existing commits (no new local changes)',
  };
}

/**
 * Atomic sync: pull latest remote changes, reindex SQLite FTS5, then push local changes.
 */
export async function cloudSync(
  knowledgeDir: string,
  db: DatabaseLayer,
  branch = 'main'
): Promise<CloudSyncResult> {
  const pull = await cloudPull(knowledgeDir, db, branch);
  const push = await cloudPush(knowledgeDir, undefined, branch);

  return {
    pull,
    push,
    syncedAt: new Date().toISOString(),
  };
}
