/**
 * @module
 * Self-update subsystem for Amneshia CLI.
 * Detects installation method, queries release registries (GitHub Releases & JSR),
 * and performs seamless in-place updates.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

export interface ReleaseInfo {
  version: string;
  tagName: string;
  releaseUrl: string;
  tarballUrl?: string;
  notes?: string;
  publishedAt?: string;
  source: 'github' | 'jsr';
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseInfo: ReleaseInfo;
}

export interface UpdateExecutionResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  method: 'git' | 'tarball' | 'registry' | 'none';
  message: string;
}

/**
 * Parses and compares two SemVer strings.
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string): number[] => {
    const clean = v.replace(/^v/i, '').split('-')[0].trim();
    return clean.split('.').map((part) => {
      const num = parseInt(part, 10);
      return Number.isNaN(num) ? 0 : num;
    });
  };

  const parts1 = parse(v1);
  const parts2 = parse(v2);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] ?? 0;
    const p2 = parts2[i] ?? 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * Fetches the latest published release of Amneshia.
 * Queries GitHub Releases API first, with JSR registry fallback.
 */
export async function fetchLatestRelease(
  repo: string = 'SabilMurti/Amneshia',
  timeoutMs: number = 8000
): Promise<ReleaseInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 1. Try GitHub Releases API
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        'User-Agent': 'Amneshia-Updater/3.2.1',
        Accept: 'application/vnd.github.v3+json',
      },
      signal: controller.signal,
    });

    if (res.ok) {
      const data: any = await res.json();
      const tagName: string = data.tag_name || '';
      const version = tagName.replace(/^v/i, '');
      const tarballAsset = (data.assets || []).find((a: any) =>
        a.name === 'amneshia-latest.tgz' || a.name.endsWith('.tgz')
      );

      clearTimeout(timer);
      return {
        version,
        tagName,
        releaseUrl: data.html_url || `https://github.com/${repo}/releases/latest`,
        tarballUrl: tarballAsset?.browser_download_url || `https://github.com/${repo}/releases/latest/download/amneshia-latest.tgz`,
        notes: data.body || '',
        publishedAt: data.published_at,
        source: 'github',
      };
    }
  } catch {
    // GitHub API timed out or errored; proceed to fallback
  }

  // 2. Fallback: Query JSR Registry API
  try {
    const jsrRes = await fetch('https://jsr.io/api/scopes/sabilmurti/packages/amneshia', {
      headers: {
        'User-Agent': 'Amneshia-Updater/3.2.1',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (jsrRes.ok) {
      const data: any = await jsrRes.json();
      const latestVersion: string = data.latestVersion || '3.2.1';
      clearTimeout(timer);
      return {
        version: latestVersion,
        tagName: `v${latestVersion}`,
        releaseUrl: `https://jsr.io/@sabilmurti/amneshia`,
        tarballUrl: `https://github.com/${repo}/releases/latest/download/amneshia-latest.tgz`,
        source: 'jsr',
      };
    }
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`Failed to check for Amneshia updates: Network error (${err.message})`);
  } finally {
    clearTimeout(timer);
  }

  throw new Error(`Could not retrieve latest release information from GitHub or JSR.`);
}

/**
 * Checks if a newer version of Amneshia is available.
 */
export async function checkForUpdate(
  currentVersion: string,
  repo?: string
): Promise<UpdateCheckResult> {
  const releaseInfo = await fetchLatestRelease(repo);
  const cmp = compareSemver(releaseInfo.version, currentVersion);
  return {
    currentVersion,
    latestVersion: releaseInfo.version,
    hasUpdate: cmp > 0,
    releaseInfo,
  };
}

/**
 * Detects the installation environment and preferred package manager.
 */
export function detectInstallEnvironment(): {
  isGitClone: boolean;
  gitDir?: string;
  pkgManager: 'bun' | 'pnpm' | 'npm';
} {
  // Check if currently executing from a Git clone of Amneshia
  let isGitClone = false;
  let gitDir: string | undefined;

  try {
    const cwdGit = path.join(process.cwd(), '.git');
    if (fs.existsSync(cwdGit)) {
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === '@sabilmurti/amneshia' || pkg.name === 'amneshia') {
          isGitClone = true;
          gitDir = process.cwd();
        }
      }
    }
  } catch {
    // Ignore detection errors
  }

  // Detect preferred package manager
  let pkgManager: 'bun' | 'pnpm' | 'npm' = 'npm';
  if (process.env.BUN_INSTALL || process.versions.bun) {
    pkgManager = 'bun';
  }

  return { isGitClone, gitDir, pkgManager };
}

/**
 * Executes the self-update process.
 */
export async function performUpdate(options: {
  currentVersion: string;
  force?: boolean;
  onProgress?: (message: string) => void;
  repo?: string;
}): Promise<UpdateExecutionResult> {
  const { currentVersion, force = false, onProgress, repo = 'SabilMurti/Amneshia' } = options;

  onProgress?.('Checking for the latest release on GitHub / JSR...');
  const check = await checkForUpdate(currentVersion, repo);

  if (!check.hasUpdate && !force) {
    return {
      success: true,
      fromVersion: currentVersion,
      toVersion: check.latestVersion,
      method: 'none',
      message: `Amneshia is already on the latest version (v${currentVersion}).`,
    };
  }

  const env = detectInstallEnvironment();

  // Mode 1: Git repository update
  if (env.isGitClone && env.gitDir) {
    onProgress?.(`Updating Amneshia from git repository (${env.gitDir})...`);
    try {
      onProgress?.('Fetching latest changes from origin/main...');
      await execFileAsync('git', ['pull', '--rebase', 'origin', 'main'], { cwd: env.gitDir });

      onProgress?.('Installing updated dependencies...');
      await execFileAsync(env.pkgManager, ['install'], { cwd: env.gitDir });

      onProgress?.('Rebuilding production bundles...');
      await execFileAsync(env.pkgManager, ['run', 'build'], { cwd: env.gitDir });

      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: check.latestVersion,
        method: 'git',
        message: `Successfully updated Amneshia repository from v${currentVersion} to v${check.latestVersion}.`,
      };
    } catch (err: any) {
      throw new Error(`Git update failed: ${err.message}`);
    }
  }

  // Mode 2: Global installation via Release Tarball or Registry
  onProgress?.(`Installing Amneshia v${check.latestVersion} globally via ${env.pkgManager}...`);
  const tarballUrl = check.releaseInfo.tarballUrl || `https://github.com/${repo}/releases/latest/download/amneshia-latest.tgz`;
  if (!tarballUrl.startsWith(`https://github.com/${repo}/releases/`)) {
    throw new Error(`Untrusted tarball source rejected: "${tarballUrl}"`);
  }

  let installSuccess = false;
  let method: 'tarball' | 'registry' = 'tarball';

  // Attempt A: Direct GitHub Release Tarball
  try {
    onProgress?.(`Downloading and installing release tarball: ${tarballUrl}`);
    if (env.pkgManager === 'bun') {
      await execFileAsync('bun', ['install', '-g', tarballUrl]);
    } else if (env.pkgManager === 'pnpm') {
      await execFileAsync('pnpm', ['add', '-g', tarballUrl]);
    } else {
      await execFileAsync('npm', ['install', '-g', tarballUrl]);
    }
    installSuccess = true;
    method = 'tarball';
  } catch (tarballErr: any) {
    onProgress?.(`Tarball installation failed (${tarballErr.message}). Falling back to package registry...`);
  }

  // Attempt B: Registry fallback (@sabilmurti/amneshia@latest)
  if (!installSuccess) {
    try {
      const pkgTarget = `@sabilmurti/amneshia@${check.latestVersion}`;
      onProgress?.(`Installing ${pkgTarget} via ${env.pkgManager}...`);
      if (env.pkgManager === 'bun') {
        await execFileAsync('bun', ['install', '-g', pkgTarget]);
      } else if (env.pkgManager === 'pnpm') {
        await execFileAsync('pnpm', ['add', '-g', pkgTarget]);
      } else {
        await execFileAsync('npm', ['install', '-g', pkgTarget]);
      }
      installSuccess = true;
      method = 'registry';
    } catch (regErr: any) {
      throw new Error(`Package registry installation failed: ${regErr.message}`);
    }
  }

  return {
    success: true,
    fromVersion: currentVersion,
    toVersion: check.latestVersion,
    method,
    message: `Amneshia successfully updated from v${currentVersion} to v${check.latestVersion}!`,
  };
}
