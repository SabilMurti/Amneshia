import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseLayer } from '../src/database/index.js';
import { KnowledgeGraph } from '../src/graph.js';
import { DualWriteSync } from '../src/storage/index.js';
import { storeMediaAsset, detectMimeType, computeFileSha256 } from '../src/storage/media-store.js';
import { serializeEntity, parseEntityMarkdown } from '../src/storage/markdown-store.js';
import { reindexFromMarkdown } from '../src/storage/reindex.js';

describe('Media Memory Engine (Deterministic CAS & Graph Integration)', () => {
  let testDir: string;
  let sampleImagePath: string;
  let sampleAudioPath: string;
  let db: DatabaseLayer;
  let sync: DualWriteSync;
  let graph: KnowledgeGraph;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `amneshia-media-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Create dummy sample media files
    sampleImagePath = path.join(testDir, 'sample_photo.jpg');
    fs.writeFileSync(sampleImagePath, Buffer.from('FAKE_JPEG_IMAGE_DATA_BINARY_STREAM_12345'));

    sampleAudioPath = path.join(testDir, 'sample_voice.ogg');
    fs.writeFileSync(sampleAudioPath, Buffer.from('FAKE_OGG_AUDIO_STREAM_67890'));

    db = new DatabaseLayer(testDir);
    sync = new DualWriteSync(path.join(testDir, 'knowledge'), db);
    graph = new KnowledgeGraph(db, sync);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Content-Addressable Storage (CAS)', () => {
    it('detects MIME types deterministically from file extensions', () => {
      expect(detectMimeType('photo.jpg')).toBe('image/jpeg');
      expect(detectMimeType('photo.png')).toBe('image/png');
      expect(detectMimeType('audio.ogg')).toBe('audio/ogg');
      expect(detectMimeType('audio.mp3')).toBe('audio/mpeg');
      expect(detectMimeType('video.mp4')).toBe('video/mp4');
      expect(detectMimeType('document.pdf')).toBe('application/pdf');
      expect(detectMimeType('unknown.xyz')).toBe('application/octet-stream');
    });

    it('computes exact SHA-256 cryptographic digest', async () => {
      const sha = await computeFileSha256(sampleImagePath);
      expect(sha).toHaveLength(64);
      expect(sha).toMatch(/^[a-f0-9]{64}$/);
    });

    it('shards media files into 2-tier CAS directory structure and deduplicates identical blobs', async () => {
      const result1 = await storeMediaAsset(sampleImagePath, testDir);
      expect(result1.deduplicated).toBe(false);
      expect(result1.mimeType).toBe('image/jpeg');
      expect(result1.fileName).toBe('sample_photo.jpg');

      const expectedSubPath = path.join(
        'media',
        'blobs',
        result1.sha256.slice(0, 2),
        result1.sha256.slice(2, 4),
        `${result1.sha256}.jpg`
      );
      expect(result1.relativePath).toBe(expectedSubPath.replace(/\\/g, '/'));
      expect(fs.existsSync(result1.absolutePath)).toBe(true);

      // Ingest the exact same file again: should be deduplicated
      const result2 = await storeMediaAsset(sampleImagePath, testDir);
      expect(result2.deduplicated).toBe(true);
      expect(result2.sha256).toBe(result1.sha256);
      expect(result2.relativePath).toBe(result1.relativePath);
    });

    it('throws error on missing or invalid files', async () => {
      await expect(storeMediaAsset(path.join(testDir, 'non_existent.png'), testDir)).rejects.toThrow(
        'Media file not found'
      );
    });
  });

  describe('Database Media Persistence', () => {
    it('creates, retrieves, and deletes media asset records', async () => {
      const entity = db.createEntity({
        name: 'Profile Picture',
        entityType: 'media',
        domain: 'personal',
      });

      const media = db.createMediaAsset({
        entityId: entity.id,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        mimeType: 'image/jpeg',
        fileName: 'profile.jpg',
        fileSize: 1024,
        relativePath: 'media/blobs/e3/b0/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.jpg',
      });

      expect(media.id).toBeDefined();
      expect(media.entityId).toBe(entity.id);

      // Retrieve by entity
      const foundByEntity = db.getMediaByEntity(entity.id);
      expect(foundByEntity).not.toBeNull();
      expect(foundByEntity?.sha256).toBe(media.sha256);

      // Retrieve by hash
      const foundByHash = db.getMediaByHash(media.sha256);
      expect(foundByHash).not.toBeNull();
      expect(foundByHash?.entityId).toBe(entity.id);

      // Delete
      const deleted = db.deleteMediaByEntity(entity.id);
      expect(deleted).toBe(true);
      expect(db.getMediaByEntity(entity.id)).toBeNull();
    });
  });

  describe('KnowledgeGraph.rememberMedia Integration', () => {
    it('persists media asset, creates entity, records facts, establishes relations, and syncs markdown', async () => {
      // Create a related target entity
      const user = db.createEntity({
        name: 'Sabil Murti',
        entityType: 'person',
        domain: 'personal',
      });

      const res = await graph.rememberMedia({
        filePath: sampleImagePath,
        entity: 'Sabil Murti Avatar Photo',
        domain: 'personal',
        facts: [
          'High-resolution portrait photograph of Sabil Murti wearing dark glasses.',
          'Taken during the Amneshia v3 architecture release session.',
        ],
        tier: 'invariant',
        relations: [
          { to: 'Sabil Murti', relationType: 'depicts' },
        ],
      });

      expect(res.ok).toBe(true);
      expect(res.entity.name).toBe('Sabil Murti Avatar Photo');
      expect(res.entity.entityType).toBe('media');
      expect(res.media.mimeType).toBe('image/jpeg');
      expect(res.media.fileName).toBe('sample_photo.jpg');
      expect(res.observationIds).toHaveLength(2);
      expect(res.relations).toHaveLength(1);

      // Verify Markdown file was written with frontmatter & media preview
      const mdPath = path.join(testDir, 'knowledge', 'personal', 'sabil-murti-avatar-photo.md');
      expect(fs.existsSync(mdPath)).toBe(true);

      const mdContent = fs.readFileSync(mdPath, 'utf-8');
      expect(mdContent).toContain('media:');
      expect(mdContent).toContain(`sha256: "${res.media.sha256}"`);
      expect(mdContent).toContain('mime_type: "image/jpeg"');
      expect(mdContent).toContain('![sample_photo.jpg](../media/blobs/');
      expect(mdContent).toContain('High-resolution portrait photograph of Sabil Murti');
      expect(mdContent).toContain('`depicts` -> Sabil Murti');

      // Verify parseEntityMarkdown parses media frontmatter back accurately
      const parsed = parseEntityMarkdown(mdContent);
      expect(parsed.media).toBeDefined();
      expect(parsed.media?.sha256).toBe(res.media.sha256);
      expect(parsed.media?.mimeType).toBe('image/jpeg');
      expect(parsed.media?.fileSize).toBe(res.media.fileSize);
      expect(parsed.observations).toHaveLength(2);
    });

    it('fully restores media assets during database reindexing from Markdown', async () => {
      await graph.rememberMedia({
        filePath: sampleAudioPath,
        entity: 'Important Audio Memo',
        domain: 'notes',
        facts: ['Audio recording of architectural directives for Amneshia core TMS.'],
        tier: 'architectural',
      });

      // Verify entity & media in DB
      const originalEntity = db.getEntityByName('Important Audio Memo');
      expect(originalEntity).not.toBeNull();
      const originalMedia = db.getMediaByEntity(originalEntity!.id);
      expect(originalMedia).not.toBeNull();

      // Close and wipe SQLite database file to simulate disaster recovery / cloud pull
      db.close();
      const dbPath = path.join(testDir, 'memory.db');
      fs.unlinkSync(dbPath);
      if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
      if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);

      // Re-initialize fresh empty database
      const restoredDb = new DatabaseLayer(testDir);
      const knowledgeDir = path.join(testDir, 'knowledge');

      // Rebuild database exclusively from Markdown
      const reindexResult = reindexFromMarkdown(knowledgeDir, restoredDb);
      expect(reindexResult.entities).toBeGreaterThanOrEqual(1);
      expect(reindexResult.mediaAssets).toBeGreaterThanOrEqual(1);

      // Verify media asset was completely restored
      const restoredEntity = restoredDb.getEntityByName('Important Audio Memo');
      expect(restoredEntity).not.toBeNull();

      const restoredMedia = restoredDb.getMediaByEntity(restoredEntity!.id);
      expect(restoredMedia).not.toBeNull();
      expect(restoredMedia?.sha256).toBe(originalMedia?.sha256);
      expect(restoredMedia?.mimeType).toBe('audio/ogg');
      expect(restoredMedia?.fileName).toBe('sample_voice.ogg');

      restoredDb.close();
    });
  });
});
