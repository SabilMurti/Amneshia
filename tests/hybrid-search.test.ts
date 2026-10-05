import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WordPieceTokenizer } from '../src/search/tokenizer.js';
import { LocalOnnxEmbedder } from '../src/search/embedder.js';
import { fuseRRF } from '../src/search/hybrid.js';
import { DatabaseLayer } from '../src/database/index.js';
import type { SearchResult, Entity, Observation } from '../src/types.js';

describe('Amneshia Hybrid Semantic Vector Search', () => {
  let tempDir: string;
  let db: DatabaseLayer;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amneshia-hybrid-test-'));
    db = new DatabaseLayer(tempDir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('WordPieceTokenizer', () => {
    it('should tokenize text correctly using provided vocab', () => {
      const vocab = {
        '[PAD]': 0,
        '[UNK]': 100,
        '[CLS]': 101,
        '[SEP]': 102,
        'hello': 1000,
        'world': 1001,
        'test': 1002,
        '##ing': 1003,
      };

      const tokenizer = new WordPieceTokenizer(vocab);
      const encoded = tokenizer.tokenize('Hello testing world!');

      expect(encoded.tokens).toEqual(['[CLS]', 'hello', 'test', '##ing', 'world', '[UNK]', '[SEP]']);
      expect(Array.from(encoded.inputIds)).toEqual([101n, 1000n, 1002n, 1003n, 1001n, 100n, 102n]);
      expect(Array.from(encoded.attentionMask)).toEqual([1n, 1n, 1n, 1n, 1n, 1n, 1n]);
    });
  });

  describe('Reciprocal Rank Fusion (fuseRRF)', () => {
    it('should correctly fuse and rank lexical and semantic results', () => {
      const entityA: Entity = {
        id: 'ent-a',
        name: 'Entity Alpha',
        entityType: 'concept',
        domain: 'test',
        visibility: 'public',
        allowedAgents: [],
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const entityB: Entity = {
        id: 'ent-b',
        name: 'Entity Beta',
        entityType: 'concept',
        domain: 'test',
        visibility: 'public',
        allowedAgents: [],
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const obsA: Observation = {
        id: 'obs-a',
        entityId: 'ent-a',
        content: 'Fact A',
        source: null,
        importance: 'normal',
        confidence: 1.0,
        authorityTier: 'contextual',
        derivedFrom: [],
        accessCount: 0,
        lastAccessedAt: null,
        status: 'active',
        expiresAt: null,
        supersedes: null,
      };

      const obsB: Observation = {
        id: 'obs-b',
        entityId: 'ent-b',
        content: 'Fact B',
        source: null,
        importance: 'normal',
        confidence: 1.0,
        authorityTier: 'contextual',
        derivedFrom: [],
        accessCount: 0,
        lastAccessedAt: null,
        status: 'active',
        expiresAt: null,
        supersedes: null,
      };

      // Entity A is rank 1 in lexical, rank 2 in semantic
      // Entity B is rank 2 in lexical, rank 1 in semantic
      const lexicalResults: SearchResult[] = [
        { entity: entityA, observations: [obsA], matchedContent: 'Fact A', rank: -1.0 },
        { entity: entityB, observations: [obsB], matchedContent: 'Fact B', rank: -0.5 },
      ];

      const semanticResults = [
        { entity: entityB, observations: [obsB], matchedContent: 'Fact B', similarity: 0.95 },
        { entity: entityA, observations: [obsA], matchedContent: 'Fact A', similarity: 0.85 },
      ];

      const fused = fuseRRF(lexicalResults, semanticResults, { k: 60 });
      expect(fused).toHaveLength(2);
      // Both entities should have RRF score = 1/(60+1) + 1/(60+2)
      const expectedScore = 1 / 61 + 1 / 62;
      expect(fused[0].rank).toBeCloseTo(expectedScore, 5);
      expect(fused[1].rank).toBeCloseTo(expectedScore, 5);
    });
  });

  describe('DatabaseLayer Vector & Hybrid Search', () => {
    it('should store and query vector embeddings accurately', () => {
      const entity = db.createEntity({
        name: 'Database Cluster',
        entityType: 'infrastructure',
        domain: 'backend',
      });

      const obs1 = db.addObservation(entity.id, 'PostgreSQL primary on port 5432 with replication.', 'admin');
      const obs2 = db.addObservation(entity.id, 'Redis cache on port 6379 with LRU eviction.', 'admin');

      // Create two synthetic 384-dimensional normalized vectors
      const vec1 = new Float32Array(384);
      vec1[0] = 1.0; // High in dimension 0

      const vec2 = new Float32Array(384);
      vec2[1] = 1.0; // High in dimension 1

      db.saveObservationEmbedding(obs1.id, vec1, 'test-model');
      db.saveObservationEmbedding(obs2.id, vec2, 'test-model');

      const retrieved1 = db.getObservationEmbedding(obs1.id);
      expect(retrieved1).not.toBeNull();
      expect(retrieved1![0]).toBeCloseTo(1.0, 5);
      expect(retrieved1![1]).toBeCloseTo(0.0, 5);

      // Query nearest to vec1
      const queryVec = new Float32Array(384);
      queryVec[0] = 0.9;
      queryVec[1] = 0.1;

      const vectorMatches = db.searchVector(queryVec, 10, 'test-model', 0.1);
      expect(vectorMatches).toHaveLength(2);
      expect(vectorMatches[0].observations[0].id).toBe(obs1.id);
      expect(vectorMatches[0].similarity).toBeCloseTo(0.9, 2);
      expect(vectorMatches[1].observations[0].id).toBe(obs2.id);
      expect(vectorMatches[1].similarity).toBeCloseTo(0.1, 2);
    });

    it('should perform searchHybrid with seamless fallback if model is mock/unavailable', async () => {
      const entity = db.createEntity({
        name: 'Nginx Web Server',
        entityType: 'infrastructure',
        domain: 'network',
      });
      db.addObservation(entity.id, 'Nginx reverse proxy configured on port 443 with SSL.', 'admin');

      // FTS5 will find 'Nginx'
      const results = await db.searchHybrid('Nginx reverse proxy');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entity.name).toBe('Nginx Web Server');
    });
  });

  describe('Local ONNX Model Embedder Inference', () => {
    it('should generate valid normalized vector and calculate cosine similarity', async () => {
      const embedder = new LocalOnnxEmbedder();
      // Test if model files exist
      const { modelPath, tokenizerPath } = await embedder.ensureModelFiles();
      expect(fs.existsSync(modelPath)).toBe(true);
      expect(fs.existsSync(tokenizerPath)).toBe(true);

      const vecA = await embedder.embed('Server crashed due to out of memory error');
      const vecB = await embedder.embed('VPS killed process because RAM exceeded limit');
      const vecC = await embedder.embed('Delicious chocolate cake recipe with strawberries');

      expect(vecA.length).toBe(384);
      expect(vecB.length).toBe(384);
      expect(vecC.length).toBe(384);

      const simRelated = LocalOnnxEmbedder.cosineSimilarity(vecA, vecB);
      const simUnrelated = LocalOnnxEmbedder.cosineSimilarity(vecA, vecC);

      // Semantic similarity between server crash & RAM exceeded should be significantly higher than cake
      expect(simRelated).toBeGreaterThan(0.4);
      expect(simUnrelated).toBeLessThan(0.2);
      expect(simRelated).toBeGreaterThan(simUnrelated + 0.3);
    }, 25000);
  });
});
