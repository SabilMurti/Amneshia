import { describe, it, expect } from 'vitest';
import { compareSemver, detectInstallEnvironment, fetchLatestRelease, checkForUpdate } from '../src/updater/index.js';

describe('Amneshia Self-Updater Tests', () => {
  describe('compareSemver', () => {
    it('should correctly compare standard semver versions', () => {
      expect(compareSemver('3.2.0', '3.1.0')).toBe(1);
      expect(compareSemver('3.1.0', '3.2.0')).toBe(-1);
      expect(compareSemver('3.2.0', '3.2.0')).toBe(0);
    });

    it('should handle versions with leading v prefix', () => {
      expect(compareSemver('v3.2.0', '3.1.0')).toBe(1);
      expect(compareSemver('3.1.0', 'v3.2.0')).toBe(-1);
      expect(compareSemver('v3.2.0', 'v3.2.0')).toBe(0);
    });

    it('should handle patch and minor increments', () => {
      expect(compareSemver('3.0.1', '3.0.0')).toBe(1);
      expect(compareSemver('3.1.0', '3.0.99')).toBe(1);
      expect(compareSemver('4.0.0', '3.99.99')).toBe(1);
      expect(compareSemver('3.0.0', '3.0.1')).toBe(-1);
    });

    it('should handle varying segment lengths and suffixes', () => {
      expect(compareSemver('3.2', '3.2.0')).toBe(0);
      expect(compareSemver('3.2.0-beta.1', '3.2.0')).toBe(0);
      expect(compareSemver('3.2.1-rc.1', '3.2.0')).toBe(1);
    });
  });

  describe('detectInstallEnvironment', () => {
    it('should return environment info with package manager', () => {
      const env = detectInstallEnvironment();
      expect(env).toBeDefined();
      expect(['npm', 'pnpm', 'bun']).toContain(env.pkgManager);
      expect(typeof env.isGitClone).toBe('boolean');
    });
  });

  describe('fetchLatestRelease & checkForUpdate', () => {
    it('should query live release endpoints and return structured ReleaseInfo', async () => {
      const release = await fetchLatestRelease('SabilMurti/Amneshia', 10000);
      expect(release).toBeDefined();
      expect(typeof release.version).toBe('string');
      expect(release.tagName).toMatch(/^v?\d+\.\d+\.\d+/);
      expect(['github', 'jsr']).toContain(release.source);
      expect(release.releaseUrl).toContain('http');
    });

    it('should perform update comparison against current version', async () => {
      const check = await checkForUpdate('1.0.0', 'SabilMurti/Amneshia');
      expect(check.hasUpdate).toBe(true);
      expect(check.currentVersion).toBe('1.0.0');
      expect(check.latestVersion).toBeDefined();

      const futureCheck = await checkForUpdate('99.0.0', 'SabilMurti/Amneshia');
      expect(futureCheck.hasUpdate).toBe(false);
    });
  });
});
