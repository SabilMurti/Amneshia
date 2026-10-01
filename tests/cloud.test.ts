import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseLayer } from '../src/database/index.js';
import { DualWriteSync } from '../src/storage/index.js';
import {
  setupGitRemote,
  getCloudStatus,
  cloudPush,
  cloudPull,
  cloudSync,
} from '../src/cloud/index.js';

const execFileAsync = promisify(execFile);

describe('Git-Native Cloud Synchronization Tests', () => {
  let tempBase: string;
  let bareRemotePath: string;
  let deviceADataDir: string;
  let deviceBDataDir: string;
  let deviceAKnowledge: string;
  let deviceBKnowledge: string;

  beforeEach(async () => {
    tempBase = path.join(os.tmpdir(), `amneshia-cloud-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    bareRemotePath = path.join(tempBase, 'remote.git');
    deviceADataDir = path.join(tempBase, 'deviceA');
    deviceBDataDir = path.join(tempBase, 'deviceB');
    deviceAKnowledge = path.join(deviceADataDir, 'knowledge');
    deviceBKnowledge = path.join(deviceBDataDir, 'knowledge');

    fs.mkdirSync(bareRemotePath, { recursive: true });
    fs.mkdirSync(deviceAKnowledge, { recursive: true });
    fs.mkdirSync(deviceBKnowledge, { recursive: true });

    // Initialize a local bare git repo as the mock "cloud remote"
    await execFileAsync('git', ['init', '--bare', '-b', 'main', bareRemotePath]);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {}
  });

  it('should initialize and configure git remote correctly', async () => {
    const res = await setupGitRemote(deviceAKnowledge, bareRemotePath, 'main');
    expect(res.success).toBe(true);
    expect(res.remoteUrl).toBe(bareRemotePath);
    expect(res.branch).toBe('main');

    const status = await getCloudStatus(deviceAKnowledge);
    expect(status.initialized).toBe(true);
    expect(status.remoteUrl).toBe(bareRemotePath);
    expect(status.branch).toBe('main');
  });

  it('should push local knowledge markdown to remote git repository', async () => {
    // 1. Setup DB and write knowledge on Device A
    const dbA = new DatabaseLayer(deviceADataDir);
    const ent = dbA.createEntity({
      name: 'CloudSync Architecture',
      entityType: 'architecture',
      domain: 'cloud',
      visibility: 'public',
    });
    dbA.addObservation(
      ent.id,
      'Git is used as zero-cost decentralized markdown synchronization transport',
      'spec',
      'high',
      1.0,
      undefined,
      'architectural'
    );

    const syncA = new DualWriteSync(deviceAKnowledge, dbA);
    syncA.syncAll();
    dbA.close();

    // 2. Setup remote and push
    await setupGitRemote(deviceAKnowledge, bareRemotePath, 'main');
    const pushRes = await cloudPush(deviceAKnowledge, 'Initial knowledge push', 'main');
    expect(pushRes.pushed).toBe(true);
    expect(pushRes.commitHash).toBeDefined();

    const status = await getCloudStatus(deviceAKnowledge);
    expect(status.clean).toBe(true);
    expect(status.lastSyncAt).not.toBeNull();
  });

  it('should synchronize knowledge across two devices via git remote and reindex SQLite FTS5', async () => {
    // 1. Device A writes knowledge and pushes to remote
    const dbA = new DatabaseLayer(deviceADataDir);
    const entA = dbA.createEntity({
      name: 'Distributed State Pattern',
      entityType: 'pattern',
      domain: 'architecture',
      visibility: 'public',
    });
    dbA.addObservation(
      entA.id,
      'Local SQLite provides microsecond read cache while Markdown maintains audit history',
      'system',
      'critical',
      0.98,
      undefined,
      'invariant'
    );
    const syncA = new DualWriteSync(deviceAKnowledge, dbA);
    syncA.syncAll();
    dbA.close();

    await setupGitRemote(deviceAKnowledge, bareRemotePath, 'main');
    await cloudPush(deviceAKnowledge, 'Device A sync', 'main');

    // 2. Device B links remote and pulls
    await setupGitRemote(deviceBKnowledge, bareRemotePath, 'main');
    const dbB = new DatabaseLayer(deviceBDataDir);

    const pullRes = await cloudPull(deviceBKnowledge, dbB, 'main');
    expect(pullRes.pulled).toBe(true);
    expect(pullRes.reindex.entities).toBe(1);
    expect(pullRes.reindex.observations).toBe(1);

    // Verify Device B's local SQLite has the pulled entity and observation
    const entB = dbB.getEntityByName('Distributed State Pattern');
    expect(entB).toBeDefined();
    const obsB = dbB.getObservationsByEntity(entB!.id);
    expect(obsB.length).toBe(1);
    expect(obsB[0].content).toContain('microsecond read cache');

    // Verify Device B can run FTS search on the pulled observation immediately
    const searchRes = dbB.searchFTSRelevant('microsecond', 5);
    expect(searchRes.length).toBe(1);
    expect(searchRes[0].entity.name).toBe('Distributed State Pattern');

    dbB.close();
  });

  it('should perform bidirectional cloudSync seamlessly', async () => {
    // Device A setup & push
    const dbA = new DatabaseLayer(deviceADataDir);
    const ent = dbA.createEntity({
      name: 'Bidirectional Test',
      entityType: 'test',
      domain: 'tests',
      visibility: 'public',
    });
    dbA.addObservation(
      ent.id,
      'Sync verifies atomic pull then push',
      'test',
      'medium',
      1.0,
      undefined,
      'contextual'
    );
    const syncA = new DualWriteSync(deviceAKnowledge, dbA);
    syncA.syncAll();

    await setupGitRemote(deviceAKnowledge, bareRemotePath, 'main');
    const syncRes = await cloudSync(deviceAKnowledge, dbA, 'main');
    expect(syncRes.pull.pulled).toBe(true);
    expect(syncRes.push.pushed).toBe(true);
    expect(syncRes.syncedAt).toBeDefined();

    dbA.close();
  });
});
