import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const entryPoint = path.resolve(__dirname, '../dist/index.js');

describe('CLI Integration Tests', () => {
  it('should display version with --version flag', async () => {
    const { stdout } = await execFileAsync('node', [entryPoint, '--version']);
    expect(stdout.trim()).toBe('3.0.1');
  });

  it('should display help with --help flag and exit 0', async () => {
    const { stdout } = await execFileAsync('node', [entryPoint, '--help']);
    expect(stdout).toContain('Usage: amneshia [options] [command]');
    expect(stdout).toContain('--tool-profile <profile>');
    expect(stdout).toContain('Commands:');
    expect(stdout).toContain('init [dir]');
    expect(stdout).toContain('serve [options]');
  });

  it('should run stats command successfully', async () => {
    const { stdout } = await execFileAsync('node', [entryPoint, 'stats']);
    expect(stdout).toContain('Amneshia Knowledge Graph Stats');
    expect(stdout).toContain('Total Entities:');
    expect(stdout).toContain('Total Observations:');
  });
});
