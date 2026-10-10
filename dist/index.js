#!/data/data/com.termux/files/usr/bin/env node

// src/index.ts
import os7 from "os";
import path14 from "path";
import fs13 from "fs";
import { spawn } from "child_process";
import { Command } from "commander";

// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

// src/database/index.ts
import fs4 from "fs";
import os2 from "os";
import path3 from "path";
import crypto3 from "crypto";
import Database from "better-sqlite3";

// src/database/schema.ts
var SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'personal',
  visibility TEXT NOT NULL DEFAULT 'public',
  allowed_agents TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT,
  importance TEXT NOT NULL DEFAULT 'normal',
  confidence REAL NOT NULL DEFAULT 1.0,
  authority_tier TEXT NOT NULL DEFAULT 'contextual' CHECK(authority_tier IN ('invariant', 'architectural', 'contextual', 'ephemeral')),
  derived_from TEXT NOT NULL DEFAULT '[]',
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'stale', 'invalidated', 'superseded', 'decayed')),
  expires_at TEXT,
  supersedes TEXT REFERENCES observations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  from_entity TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(from_entity, to_entity, relation_type)
);

CREATE TABLE IF NOT EXISTS observation_history (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  old_content TEXT NOT NULL,
  new_content TEXT NOT NULL,
  changed_by TEXT,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  auto_export INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contradiction_log (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL,
  conflicting_observation_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolution TEXT CHECK(resolution IN ('override', 'kept_both', 'rejected', NULL)),
  detected_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS access_log (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  observation_id TEXT,
  accessed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(entity_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_obs_entity_status ON observations(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_obs_authority ON observations(authority_tier);
CREATE INDEX IF NOT EXISTS idx_obs_status ON observations(status);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity);
CREATE INDEX IF NOT EXISTS idx_access_log_obs ON access_log(observation_id);
CREATE INDEX IF NOT EXISTS idx_contradiction_entity ON contradiction_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_media_entity ON media_assets(entity_id);
CREATE INDEX IF NOT EXISTS idx_media_sha256 ON media_assets(sha256);
CREATE INDEX IF NOT EXISTS idx_entities_name_nocase ON entities(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS observation_embeddings (
  observation_id TEXT PRIMARY KEY REFERENCES observations(id) ON DELETE CASCADE,
  dimensions INTEGER NOT NULL,
  vector BLOB NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_obs_emb_model ON observation_embeddings(model);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  entity_name,
  entity_type,
  observation_content,
  observation_id UNINDEXED,
  entity_id UNINDEXED,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
  SELECT e.name, e.entity_type, NEW.content, NEW.id, NEW.entity_id
  FROM entities e
  WHERE e.id = NEW.entity_id;
END;

CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
  DELETE FROM memory_fts WHERE observation_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
  DELETE FROM memory_fts WHERE observation_id = OLD.id;
  INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
  SELECT e.name, e.entity_type, NEW.content, NEW.id, NEW.entity_id
  FROM entities e
  WHERE e.id = NEW.entity_id;
END;

CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
  VALUES (NEW.name, NEW.entity_type, NEW.name || ' ' || NEW.entity_type, NULL, NEW.id);
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  DELETE FROM memory_fts WHERE observation_id IS NULL AND entity_id = OLD.id;
  INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id)
  VALUES (NEW.name, NEW.entity_type, NEW.name || ' ' || NEW.entity_type, NULL, NEW.id);
  UPDATE observations SET updated_at = updated_at WHERE entity_id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  DELETE FROM memory_fts WHERE entity_id = OLD.id;
END;
`;

// src/database/migrations.ts
function runMigrations(db) {
  const versionRow = db.pragma("user_version", { simple: true });
  if (versionRow < 3) {
    const tableCheck = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='observations'").get();
    if (tableCheck && tableCheck.count > 0) {
      const columns = db.pragma("table_info(observations)");
      const columnNames = new Set(columns.map((c) => c.name));
      if (!columnNames.has("authority_tier")) {
        db.exec(
          "ALTER TABLE observations ADD COLUMN authority_tier TEXT NOT NULL DEFAULT 'contextual' CHECK(authority_tier IN ('invariant', 'architectural', 'contextual', 'ephemeral'))"
        );
      }
      if (!columnNames.has("derived_from")) {
        db.exec("ALTER TABLE observations ADD COLUMN derived_from TEXT NOT NULL DEFAULT '[]'");
      }
      if (!columnNames.has("access_count")) {
        db.exec("ALTER TABLE observations ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0");
      }
      if (!columnNames.has("last_accessed_at")) {
        db.exec("ALTER TABLE observations ADD COLUMN last_accessed_at TEXT");
      }
      if (!columnNames.has("status")) {
        db.exec(
          "ALTER TABLE observations ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'stale', 'invalidated', 'superseded', 'decayed'))"
        );
      }
      try {
        db.exec("UPDATE observations SET status = 'superseded' WHERE supersedes IS NOT NULL AND status = 'active'");
      } catch {
      }
    }
    try {
      db.exec("DROP TABLE IF EXISTS bridge_servers;");
    } catch {
    }
  }
  if (versionRow < 4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS observation_embeddings (
        observation_id TEXT PRIMARY KEY REFERENCES observations(id) ON DELETE CASCADE,
        dimensions INTEGER NOT NULL,
        vector BLOB NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_obs_emb_model ON observation_embeddings(model);
    `);
  }
  db.pragma("user_version = 4");
}

// src/search/tokenizer.ts
import fs from "fs";
var WordPieceTokenizer = class {
  vocab = {};
  unkId = 100;
  clsId = 101;
  sepId = 102;
  padId = 0;
  maxSeqLength = 128;
  constructor(vocabOrJsonPath, maxSeqLength = 128) {
    this.maxSeqLength = maxSeqLength;
    if (typeof vocabOrJsonPath === "string") {
      this.loadFromJsonFile(vocabOrJsonPath);
    } else if (vocabOrJsonPath) {
      this.vocab = vocabOrJsonPath;
      this.initSpecialTokens();
    }
  }
  loadFromJsonFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.model && parsed.model.vocab) {
      this.vocab = parsed.model.vocab;
    } else if (typeof parsed === "object") {
      this.vocab = parsed;
    }
    this.initSpecialTokens();
  }
  initSpecialTokens() {
    if (this.vocab["[UNK]"] !== void 0) this.unkId = this.vocab["[UNK]"];
    if (this.vocab["[CLS]"] !== void 0) this.clsId = this.vocab["[CLS]"];
    if (this.vocab["[SEP]"] !== void 0) this.sepId = this.vocab["[SEP]"];
    if (this.vocab["[PAD]"] !== void 0) this.padId = this.vocab["[PAD]"];
  }
  /**
   * Normalize text by lowercasing and normalizing whitespace.
   */
  normalize(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }
  /**
   * Tokenize an input string into WordPiece token IDs.
   */
  tokenize(text) {
    const normalized = this.normalize(text);
    const words = normalized.match(/[\w]+|[^\s\w]/g) || [];
    const tokenIds = [this.clsId];
    const tokens = ["[CLS]"];
    for (const word of words) {
      let start = 0;
      while (start < word.length) {
        let end = word.length;
        let matched = false;
        while (start < end) {
          const substr = word.slice(start, end);
          const piece = start === 0 ? substr : `##${substr}`;
          if (this.vocab[piece] !== void 0) {
            tokenIds.push(this.vocab[piece]);
            tokens.push(piece);
            start = end;
            matched = true;
            break;
          }
          end--;
        }
        if (!matched) {
          tokenIds.push(this.unkId);
          tokens.push("[UNK]");
          break;
        }
        if (tokenIds.length >= this.maxSeqLength - 1) {
          break;
        }
      }
      if (tokenIds.length >= this.maxSeqLength - 1) {
        break;
      }
    }
    tokenIds.push(this.sepId);
    tokens.push("[SEP]");
    const seqLen = tokenIds.length;
    const inputIds = new BigInt64Array(seqLen);
    const attentionMask = new BigInt64Array(seqLen);
    const tokenTypeIds = new BigInt64Array(seqLen);
    for (let i = 0; i < seqLen; i++) {
      inputIds[i] = BigInt(tokenIds[i]);
      attentionMask[i] = 1n;
      tokenTypeIds[i] = 0n;
    }
    return {
      inputIds,
      attentionMask,
      tokenTypeIds,
      tokens
    };
  }
};

// src/search/embedder.ts
import fs2 from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import * as ortWeb from "onnxruntime-web";
var LocalOnnxEmbedder = class _LocalOnnxEmbedder {
  static DEFAULT_MODEL = "all-MiniLM-L6-v2";
  static DIMENSIONS = 384;
  session = null;
  tokenizer = null;
  isInitializing = null;
  backend = "wasm";
  ort = ortWeb;
  modelName;
  modelDir;
  maxSeqLength;
  constructor(config) {
    this.modelName = config?.modelName || _LocalOnnxEmbedder.DEFAULT_MODEL;
    this.maxSeqLength = config?.maxSeqLength || 128;
    this.modelDir = config?.modelDir || path.join(os.homedir(), ".amneshia", "models", this.modelName);
  }
  getModelName() {
    return this.modelName;
  }
  getDimensions() {
    return _LocalOnnxEmbedder.DIMENSIONS;
  }
  getModelDir() {
    return this.modelDir;
  }
  getBackend() {
    return this.backend;
  }
  /**
   * Ensure model and tokenizer files exist locally, or download them from HuggingFace.
   */
  async ensureModelFiles() {
    fs2.mkdirSync(this.modelDir, { recursive: true });
    let modelPath = path.join(this.modelDir, "onnx", "model_quantized.onnx");
    if (!fs2.existsSync(modelPath)) {
      modelPath = path.join(this.modelDir, "model_quantized.onnx");
    }
    if (!fs2.existsSync(modelPath)) {
      modelPath = path.join(this.modelDir, "model.onnx");
    }
    const tokenizerPath = path.join(this.modelDir, "tokenizer.json");
    const hasModel = fs2.existsSync(modelPath);
    const hasTokenizer = fs2.existsSync(tokenizerPath);
    if (hasModel && hasTokenizer) {
      return { modelPath, tokenizerPath };
    }
    console.log(`[Amneshia Embedder] Downloading ${this.modelName} from HuggingFace Hub...`);
    if (!hasTokenizer) {
      const tokenizerUrl = `https://huggingface.co/Xenova/${this.modelName}/resolve/main/tokenizer.json`;
      console.log(`[Amneshia Embedder] Fetching tokenizer.json...`);
      const resp = await fetch(tokenizerUrl);
      if (!resp.ok) throw new Error(`Failed to download tokenizer.json: ${resp.statusText}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      fs2.writeFileSync(tokenizerPath, buf);
    }
    if (!hasModel) {
      const targetModelPath = path.join(this.modelDir, "model_quantized.onnx");
      const modelUrl = `https://huggingface.co/Xenova/${this.modelName}/resolve/main/onnx/model_quantized.onnx`;
      console.log(`[Amneshia Embedder] Fetching model_quantized.onnx (~23MB)...`);
      const resp = await fetch(modelUrl);
      if (!resp.ok) throw new Error(`Failed to download model_quantized.onnx: ${resp.statusText}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      fs2.writeFileSync(targetModelPath, buf);
      modelPath = targetModelPath;
    }
    console.log(`[Amneshia Embedder] Model files verified at ${this.modelDir}`);
    return { modelPath, tokenizerPath };
  }
  /**
   * Initialize ONNX session and tokenizer.
   * Prioritizes native onnxruntime-node on PC environments for maximum C++ AVX/GPU throughput.
   * Gracefully falls back to onnxruntime-web WASM SIMD for Termux / mobile userspace.
   */
  async init() {
    if (this.session && this.tokenizer) return;
    if (this.isInitializing) return this.isInitializing;
    this.isInitializing = (async () => {
      const { modelPath, tokenizerPath } = await this.ensureModelFiles();
      const isAndroid = process.platform === "android" || Boolean(process.env.TERMUX_VERSION);
      let loadedOrt = null;
      let selectedBackend = "wasm";
      if (!isAndroid) {
        try {
          const nodeOrt = await import("onnxruntime-node");
          loadedOrt = nodeOrt.default || nodeOrt;
          selectedBackend = "native";
        } catch {
        }
      }
      if (!loadedOrt) {
        loadedOrt = ortWeb;
        selectedBackend = "wasm";
        try {
          const req = createRequire(import.meta.url);
          const ortEntry = req.resolve("onnxruntime-web");
          loadedOrt.env.wasm.wasmPaths = path.dirname(ortEntry) + "/";
        } catch {
          try {
            const currentDir = path.dirname(fileURLToPath(import.meta.url));
            const candidate = path.join(currentDir, "..", "node_modules", "onnxruntime-web", "dist") + "/";
            if (fs2.existsSync(candidate)) {
              loadedOrt.env.wasm.wasmPaths = candidate;
            } else {
              loadedOrt.env.wasm.wasmPaths = path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist") + "/";
            }
          } catch {
            loadedOrt.env.wasm.wasmPaths = path.join(process.cwd(), "node_modules", "onnxruntime-web", "dist") + "/";
          }
        }
        loadedOrt.env.wasm.numThreads = 1;
      }
      this.ort = loadedOrt;
      this.backend = selectedBackend;
      this.tokenizer = new WordPieceTokenizer(tokenizerPath, this.maxSeqLength);
      this.session = await this.ort.InferenceSession.create(modelPath);
    })();
    try {
      await this.isInitializing;
    } finally {
      this.isInitializing = null;
    }
  }
  /**
   * Generate 384-dimensional normalized vector embedding for an input string.
   */
  async embed(text) {
    await this.init();
    if (!this.session || !this.tokenizer) {
      throw new Error("Embedder session not initialized.");
    }
    const { inputIds, attentionMask, tokenTypeIds } = this.tokenizer.tokenize(text);
    const seqLen = inputIds.length;
    const feeds = {
      input_ids: new this.ort.Tensor("int64", inputIds, [1, seqLen]),
      attention_mask: new this.ort.Tensor("int64", attentionMask, [1, seqLen]),
      token_type_ids: new this.ort.Tensor("int64", tokenTypeIds, [1, seqLen])
    };
    const results = await this.session.run(feeds);
    const lastHidden = results.last_hidden_state;
    const rawData = lastHidden.cpuData || lastHidden.data;
    const dim = _LocalOnnxEmbedder.DIMENSIONS;
    const pooled = new Float32Array(dim);
    let activeTokenCount = 0;
    for (let i = 0; i < seqLen; i++) {
      if (attentionMask[i] === 1n) {
        activeTokenCount++;
        const tokenOffset = i * dim;
        for (let d = 0; d < dim; d++) {
          pooled[d] += rawData[tokenOffset + d];
        }
      }
    }
    if (activeTokenCount > 0) {
      for (let d = 0; d < dim; d++) {
        pooled[d] /= activeTokenCount;
      }
    }
    let norm = 0;
    for (let d = 0; d < dim; d++) {
      norm += pooled[d] * pooled[d];
    }
    norm = Math.sqrt(norm);
    if (norm > 1e-12) {
      for (let d = 0; d < dim; d++) {
        pooled[d] /= norm;
      }
    }
    return pooled;
  }
  /**
   * Batch embedding generation.
   * On PC: Parallel chunking with configurable concurrency for fast multi-core inference.
   * On Termux: Sequential execution to prevent Android Low Memory Killer (LMK) eviction.
   */
  async embedBatch(texts, concurrency = 8) {
    await this.init();
    const results = new Array(texts.length);
    const isMobile = process.platform === "android" || Boolean(process.env.TERMUX_VERSION);
    const limit = isMobile ? 1 : Math.max(1, concurrency);
    if (limit === 1) {
      for (let i = 0; i < texts.length; i++) {
        results[i] = await this.embed(texts[i]);
      }
      return results;
    }
    for (let i = 0; i < texts.length; i += limit) {
      const chunk = texts.slice(i, i + limit);
      const chunkEmbeddings = await Promise.all(chunk.map((t) => this.embed(t)));
      for (let j = 0; j < chunkEmbeddings.length; j++) {
        results[i + j] = chunkEmbeddings[j];
      }
    }
    return results;
  }
  /**
   * Cosine similarity between two L2-normalized float vectors.
   * Since vectors are normalized, cosine similarity is simply the dot product.
   */
  static cosineSimilarity(a, b) {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }
};

// src/search/hybrid.ts
function fuseRRF(lexicalResults, semanticResults, options) {
  const k = options?.k || 60;
  const limit = options?.limit || 20;
  const entityMap = /* @__PURE__ */ new Map();
  lexicalResults.forEach((item, index) => {
    const rank = index + 1;
    const rrfContrib = 1 / (k + rank);
    entityMap.set(item.entity.id, {
      entity: item.entity,
      observations: [...item.observations],
      matchedContent: item.matchedContent,
      lexicalRank: rank,
      rrfScore: rrfContrib,
      matchType: "lexical"
    });
  });
  semanticResults.forEach((item, index) => {
    const rank = index + 1;
    const rrfContrib = 1 / (k + rank);
    const existing = entityMap.get(item.entity.id);
    if (existing) {
      existing.rrfScore += rrfContrib;
      existing.semanticRank = rank;
      existing.semanticSimilarity = item.similarity;
      existing.matchType = "hybrid";
      const existingObsIds = new Set(existing.observations.map((o) => o.id));
      for (const obs of item.observations) {
        if (!existingObsIds.has(obs.id)) {
          existing.observations.push(obs);
          existingObsIds.add(obs.id);
        }
      }
    } else {
      entityMap.set(item.entity.id, {
        entity: item.entity,
        observations: [...item.observations],
        matchedContent: item.matchedContent,
        semanticRank: rank,
        semanticSimilarity: item.similarity,
        rrfScore: rrfContrib,
        matchType: "semantic"
      });
    }
  });
  const sorted = Array.from(entityMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
  return sorted.slice(0, limit).map((match) => ({
    entity: match.entity,
    observations: match.observations,
    matchedContent: match.matchedContent,
    rank: match.rrfScore
  }));
}

// src/storage/media-store.ts
import fs3 from "fs";
import path2 from "path";
import crypto2 from "crypto";
var MIME_EXTENSIONS = {
  // Images
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  // Audio
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  // Documents & Text
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv"
};
function detectMimeType(filePath) {
  const ext = path2.extname(filePath).toLowerCase();
  return MIME_EXTENSIONS[ext] || "application/octet-stream";
}
function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto2.createHash("sha256");
    const stream = fs3.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}
function getShardedRelativePath(sha256, extension) {
  const tier1 = sha256.slice(0, 2);
  const tier2 = sha256.slice(2, 4);
  let safeExt = "";
  if (extension && extension.trim().length > 0) {
    const raw = extension.startsWith(".") ? extension : `.${extension}`;
    safeExt = raw.toLowerCase().replace(/[^a-z0-9._-]/g, "");
  }
  return path2.posix.join("media", "blobs", tier1, tier2, `${sha256}${safeExt}`);
}
async function storeMediaAsset(sourceFilePath, storageRoot) {
  const resolvedSource = path2.resolve(sourceFilePath);
  const sensitivePatterns = [
    /(?:^|[/\\])\.ssh(?:[/\\]|$)/i,
    /(?:^|[/\\])\.gnupg(?:[/\\]|$)/i,
    /(?:^|[/\\])\.env(?:\.[a-zA-Z0-9]+)?$/i,
    /(?:^|[/\\])\.bash_history$/i,
    /(?:^|[/\\])\.zsh_history$/i,
    /(?:^|[/\\])etc[/\\]shadow$/i,
    /(?:^|[/\\])etc[/\\]passwd$/i
  ];
  for (const pattern of sensitivePatterns) {
    if (pattern.test(resolvedSource)) {
      throw new Error(`Security violation: reading sensitive file "${sourceFilePath}" is prohibited.`);
    }
  }
  if (!fs3.existsSync(resolvedSource)) {
    throw new Error(`Media file not found: "${sourceFilePath}"`);
  }
  const stat = fs3.statSync(resolvedSource);
  if (!stat.isFile()) {
    throw new Error(`Path is not a regular file: "${sourceFilePath}"`);
  }
  const fileName = path2.basename(resolvedSource);
  const ext = path2.extname(resolvedSource).toLowerCase();
  const mimeType = detectMimeType(resolvedSource);
  const sha256 = await computeFileSha256(resolvedSource);
  const relativePath = getShardedRelativePath(sha256, ext);
  const absoluteDestPath = path2.resolve(storageRoot, relativePath);
  const destDir = path2.dirname(absoluteDestPath);
  const relCheck = path2.relative(storageRoot, absoluteDestPath);
  if (relCheck.startsWith("..") || path2.isAbsolute(relCheck)) {
    throw new Error(`Path traversal violation detected: destination escapes storage root.`);
  }
  fs3.mkdirSync(destDir, { recursive: true });
  let deduplicated = false;
  if (fs3.existsSync(absoluteDestPath)) {
    deduplicated = true;
  } else {
    fs3.copyFileSync(resolvedSource, absoluteDestPath);
  }
  return {
    sha256,
    mimeType,
    fileName,
    fileSize: stat.size,
    relativePath,
    absolutePath: absoluteDestPath,
    deduplicated
  };
}
function findOrphanMediaBlobs(storageRoot, activeHashes) {
  const blobsDir = path2.join(storageRoot, "media", "blobs");
  if (!fs3.existsSync(blobsDir)) return [];
  const orphans = [];
  function scan(dir) {
    const entries = fs3.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path2.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        const base = path2.basename(entry.name);
        const dotIdx = base.indexOf(".");
        const fileHash = dotIdx > 0 ? base.slice(0, dotIdx) : base;
        if (!activeHashes.has(fileHash)) {
          orphans.push(fullPath);
        }
      }
    }
  }
  scan(blobsDir);
  return orphans;
}
function pruneOrphanMediaBlobs(storageRoot, activeHashes) {
  const orphans = findOrphanMediaBlobs(storageRoot, activeHashes);
  let reclaimedBytes = 0;
  let prunedCount = 0;
  for (const orphanPath of orphans) {
    try {
      const stat = fs3.statSync(orphanPath);
      reclaimedBytes += stat.size;
      fs3.unlinkSync(orphanPath);
      prunedCount++;
      let parent = path2.dirname(orphanPath);
      for (let i = 0; i < 2; i++) {
        if (fs3.existsSync(parent) && fs3.readdirSync(parent).length === 0) {
          fs3.rmdirSync(parent);
          parent = path2.dirname(parent);
        } else {
          break;
        }
      }
    } catch {
    }
  }
  return { prunedCount, reclaimedBytes };
}

// src/database/index.ts
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function uuid() {
  return crypto3.randomUUID();
}
function homedirDataDir() {
  return path3.join(os2.homedir(), ".amneshia");
}
function ensureDir(dir) {
  fs4.mkdirSync(dir, { recursive: true });
}
function toAllowedAgents(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return parsed;
    }
  } catch {
  }
  return [];
}
function toDerivedFrom(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      return parsed;
    }
  } catch {
  }
  return [];
}
function toEntity(row) {
  return {
    id: row.id,
    name: row.name,
    entityType: row.entity_type,
    domain: row.domain,
    visibility: row.visibility,
    allowedAgents: toAllowedAgents(row.allowed_agents),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function toObservation(row) {
  return {
    id: row.id,
    entityId: row.entity_id,
    content: row.content,
    source: row.source,
    importance: row.importance,
    confidence: row.confidence,
    authorityTier: row.authority_tier || "contextual",
    derivedFrom: toDerivedFrom(row.derived_from),
    accessCount: row.access_count ?? 0,
    lastAccessedAt: row.last_accessed_at,
    status: row.status || "active",
    expiresAt: row.expires_at,
    supersedes: row.supersedes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function toRelationWithNames(row) {
  return {
    id: row.id,
    fromEntity: row.from_entity,
    fromEntityName: row.from_entity_name,
    toEntity: row.to_entity,
    toEntityName: row.to_entity_name,
    relationType: row.relation_type,
    createdAt: row.created_at
  };
}
function toExportTarget(row) {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    format: row.format,
    autoExport: row.auto_export === 1
  };
}
function toMediaAsset(row) {
  return {
    id: row.id,
    entityId: row.entity_id,
    sha256: row.sha256,
    mimeType: row.mime_type,
    fileName: row.file_name,
    fileSize: row.file_size,
    relativePath: row.relative_path,
    createdAt: row.created_at
  };
}
var STOP_WORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "when",
  "where",
  "why",
  "how",
  "who",
  "what",
  "which",
  "this",
  "that",
  "these",
  "those",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "about",
  "from",
  "up",
  "down",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "just",
  "only",
  "also",
  "some",
  "any",
  "no",
  "not",
  "other",
  "than",
  "yang",
  "di",
  "ke",
  "dari",
  "ini",
  "itu",
  "untuk",
  "dengan",
  "pada",
  "adalah",
  "dan",
  "atau",
  "tapi",
  "tetapi",
  "jika",
  "maka",
  "kapan",
  "dimana",
  "mengapa",
  "bagaimana",
  "siapa",
  "apa",
  "secara",
  "oleh",
  "tentang",
  "ada",
  "adapun",
  "bagi",
  "sebagai",
  "ia",
  "mereka",
  "kita",
  "kami",
  "saya",
  "anda",
  "kamu",
  "dia",
  "yaitu",
  "yakni",
  "seperti",
  "serta",
  "bisa",
  "dapat",
  "harus",
  "akan",
  "telah",
  "sudah",
  "belum",
  "sedang",
  "boleh",
  "hanya",
  "saja",
  "juga",
  "pun",
  "lah",
  "kah",
  "deh",
  "sih",
  "dong",
  "kok",
  "tuh"
]);
function stripStopWords(query) {
  const cleaned = query.split(/\s+/).filter((word) => !STOP_WORDS.has(word.toLowerCase().replace(/[^a-zA-Z0-9]/g, ""))).join(" ");
  return cleaned.trim().length > 0 ? cleaned : query;
}
function sanitizeFtsQuery(query) {
  const tokens = query.trim().split(/\s+/).map((token) => token.replace(/["'`]/g, " ").replace(/[\-+<>~*():]/g, " ")).flatMap((token) => token.split(/\s+/)).map((token) => token.trim()).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return '""';
  }
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" OR ");
}
function normalizeArray(value) {
  return JSON.stringify(value ?? []);
}
var DatabaseLayer = class {
  db;
  dataDir;
  sharedEmbedder = null;
  statements;
  constructor(dataDir) {
    this.dataDir = dataDir ?? homedirDataDir();
    ensureDir(this.dataDir);
    const databasePath = path3.join(this.dataDir, "memory.db");
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("synchronous = NORMAL");
    this.initializeSchema();
    this.statements = this.prepareStatements();
  }
  initializeSchema() {
    runMigrations(this.db);
    this.db.exec(SCHEMA_SQL);
    this.ensureDefaultExportTargets();
  }
  ensureDefaultExportTargets() {
    try {
      const defaultPath = path3.join(os2.homedir(), ".amneshia", "export", "MEMORY.md");
      const check1 = this.db.prepare("SELECT count(*) as count FROM export_targets WHERE name = ? OR path = ?").get("Memory Default", defaultPath);
      if (check1.count === 0) {
        this.db.prepare("INSERT OR IGNORE INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)").run(uuid(), "Memory Default", defaultPath, "markdown", 1);
      }
      const projectPath = path3.join(process.cwd(), "MEMORY.md");
      const check2 = this.db.prepare("SELECT count(*) as count FROM export_targets WHERE name = ? OR path = ?").get("Amneshia Project", projectPath);
      if (check2.count === 0) {
        this.db.prepare("INSERT OR IGNORE INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)").run(uuid(), "Amneshia Project", projectPath, "markdown", 1);
      }
    } catch (e) {
      console.error("Failed to configure default export targets:", e);
    }
  }
  prepareStatements() {
    return {
      createEntity: this.db.prepare(
        "INSERT INTO entities (id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ),
      getEntityByName: this.db.prepare(
        "SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE name = ? COLLATE NOCASE LIMIT 1"
      ),
      getEntityById: this.db.prepare(
        "SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE id = ? LIMIT 1"
      ),
      deleteEntity: this.db.prepare("DELETE FROM entities WHERE id = ?"),
      insertObservation: this.db.prepare(
        "INSERT INTO observations (id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ),
      getObservationsByEntity: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? ORDER BY created_at ASC"
      ),
      getActiveObservationsByEntity: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? AND status = 'active' ORDER BY created_at ASC"
      ),
      getObservationById: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE id = ? LIMIT 1"
      ),
      updateObservation: this.db.prepare(
        "UPDATE observations SET content = ?, authority_tier = ?, status = ?, updated_at = ? WHERE id = ?"
      ),
      setObservationStatus: this.db.prepare("UPDATE observations SET status = ?, updated_at = ? WHERE id = ?"),
      deleteObservation: this.db.prepare("DELETE FROM observations WHERE id = ?"),
      createRelation: this.db.prepare(
        "INSERT OR IGNORE INTO relations (id, from_entity, to_entity, relation_type, created_at) VALUES (?, ?, ?, ?, ?)"
      ),
      getRelationsByEntity: this.db.prepare(
        `SELECT r.id, r.from_entity, fe.name AS from_entity_name, r.to_entity, te.name AS to_entity_name, r.relation_type, r.created_at
         FROM relations r
         JOIN entities fe ON fe.id = r.from_entity
         JOIN entities te ON te.id = r.to_entity
         WHERE r.from_entity = ? OR r.to_entity = ?
         ORDER BY r.created_at ASC`
      ),
      deleteRelation: this.db.prepare("DELETE FROM relations WHERE id = ?"),
      insertMediaAsset: this.db.prepare(
        "INSERT OR REPLACE INTO media_assets (id, entity_id, sha256, mime_type, file_name, file_size, relative_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ),
      getMediaByEntity: this.db.prepare(
        "SELECT id, entity_id, sha256, mime_type, file_name, file_size, relative_path, created_at FROM media_assets WHERE entity_id = ? LIMIT 1"
      ),
      getMediaByHash: this.db.prepare(
        "SELECT id, entity_id, sha256, mime_type, file_name, file_size, relative_path, created_at FROM media_assets WHERE sha256 = ? LIMIT 1"
      ),
      getAllMediaAssets: this.db.prepare(
        "SELECT id, entity_id, sha256, mime_type, file_name, file_size, relative_path, created_at FROM media_assets ORDER BY created_at DESC"
      ),
      deleteMediaByEntity: this.db.prepare("DELETE FROM media_assets WHERE entity_id = ?"),
      deleteFtsObservation: this.db.prepare("DELETE FROM memory_fts WHERE observation_id = ?"),
      insertFtsObservation: this.db.prepare(
        "INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id) VALUES (?, ?, ?, ?, ?)"
      ),
      insertFtsEntity: this.db.prepare(
        "INSERT INTO memory_fts(entity_name, entity_type, observation_content, observation_id, entity_id) VALUES (?, ?, ?, ?, ?)"
      ),
      searchFts: this.db.prepare(
        "SELECT entity_id, observation_id, observation_content, rank FROM memory_fts WHERE memory_fts MATCH ? ORDER BY rank LIMIT ?"
      ),
      readGraphEntities: this.db.prepare(
        "SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE (? IS NULL OR domain = ?) AND (? IS NULL OR entity_type = ?) ORDER BY name ASC"
      ),
      readGraphObservations: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id = ? ORDER BY created_at ASC"
      ),
      readGraphRelations: this.db.prepare(
        `SELECT r.id, r.from_entity, fe.name AS from_entity_name, r.to_entity, te.name AS to_entity_name, r.relation_type, r.created_at
         FROM relations r
         JOIN entities fe ON fe.id = r.from_entity
         JOIN entities te ON te.id = r.to_entity
         WHERE r.from_entity = ? OR r.to_entity = ?
         ORDER BY r.created_at ASC`
      ),
      openNodesEntities: this.db.prepare(
        "SELECT id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at FROM entities WHERE name IN (SELECT value FROM json_each(?)) ORDER BY name ASC"
      ),
      openNodesObservations: this.db.prepare(
        "SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE entity_id IN (SELECT id FROM entities WHERE name IN (SELECT value FROM json_each(?))) ORDER BY created_at ASC"
      ),
      openNodesRelations: this.db.prepare(
        `SELECT r.id, r.from_entity, fe.name AS from_entity_name, r.to_entity, te.name AS to_entity_name, r.relation_type, r.created_at
         FROM relations r
         JOIN entities fe ON fe.id = r.from_entity
         JOIN entities te ON te.id = r.to_entity
         WHERE r.from_entity IN (SELECT id FROM entities WHERE name IN (SELECT value FROM json_each(?)))
            OR r.to_entity IN (SELECT id FROM entities WHERE name IN (SELECT value FROM json_each(?)))
         ORDER BY r.created_at ASC`
      ),
      countEntities: this.db.prepare("SELECT COUNT(*) AS value FROM entities"),
      countObservations: this.db.prepare("SELECT COUNT(*) AS value FROM observations"),
      countRelations: this.db.prepare("SELECT COUNT(*) AS value FROM relations"),
      countExportTargets: this.db.prepare("SELECT COUNT(*) AS value FROM export_targets"),
      countMediaAssets: this.db.prepare("SELECT COUNT(*) AS value FROM media_assets"),
      countContradictions: this.db.prepare("SELECT COUNT(*) AS value FROM contradiction_log WHERE resolution IS NULL"),
      entitiesByType: this.db.prepare(
        "SELECT entity_type AS key, COUNT(*) AS value FROM entities GROUP BY entity_type ORDER BY entity_type ASC"
      ),
      entitiesByDomain: this.db.prepare(
        "SELECT domain AS key, COUNT(*) AS value FROM entities GROUP BY domain ORDER BY domain ASC"
      ),
      observationsByTier: this.db.prepare(
        "SELECT authority_tier AS key, COUNT(*) AS value FROM observations GROUP BY authority_tier ORDER BY authority_tier ASC"
      ),
      observationsByStatus: this.db.prepare(
        "SELECT status AS key, COUNT(*) AS value FROM observations GROUP BY status ORDER BY status ASC"
      ),
      recentActivity: this.db.prepare(
        `SELECT 'observation' AS type, content, created_at
         FROM observations
         UNION ALL
         SELECT 'entity' AS type, name AS content, created_at
         FROM entities
         ORDER BY created_at DESC
         LIMIT 10`
      ),
      cleanupExpired: this.db.prepare(
        "DELETE FROM observations WHERE expires_at IS NOT NULL AND expires_at <= ? AND (authority_tier = 'ephemeral' OR importance = 'ephemeral')"
      ),
      gcObservations: this.db.prepare(
        "DELETE FROM observations WHERE status IN ('decayed', 'invalidated')"
      ),
      getExportTargets: this.db.prepare("SELECT id, name, path, format, auto_export FROM export_targets ORDER BY name ASC"),
      addExportTarget: this.db.prepare(
        "INSERT INTO export_targets (id, name, path, format, auto_export) VALUES (?, ?, ?, ?, ?)"
      ),
      removeExportTarget: this.db.prepare("DELETE FROM export_targets WHERE id = ?"),
      observationHistory: this.db.prepare(
        "INSERT INTO observation_history (id, observation_id, old_content, new_content, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
      ),
      updateEntityTimestamps: this.db.prepare("UPDATE entities SET updated_at = ? WHERE id = ?"),
      insertContradiction: this.db.prepare(
        "INSERT INTO contradiction_log (id, observation_id, conflicting_observation_id, entity_id, reason, resolution, detected_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ),
      getContradictionsByEntity: this.db.prepare(
        "SELECT id, observation_id, conflicting_observation_id, entity_id, reason, resolution, detected_at, resolved_at FROM contradiction_log WHERE entity_id = ? ORDER BY detected_at DESC"
      ),
      getAllContradictions: this.db.prepare(
        "SELECT id, observation_id, conflicting_observation_id, entity_id, reason, resolution, detected_at, resolved_at FROM contradiction_log ORDER BY detected_at DESC LIMIT ?"
      ),
      resolveContradiction: this.db.prepare(
        "UPDATE contradiction_log SET resolution = ?, resolved_at = ? WHERE id = ?"
      ),
      insertAccessLog: this.db.prepare("INSERT INTO access_log (id, entity_id, observation_id, accessed_at) VALUES (?, ?, ?, ?)"),
      incrementAccess: this.db.prepare(
        "UPDATE observations SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?"
      ),
      upsertEmbedding: this.db.prepare(
        "INSERT OR REPLACE INTO observation_embeddings (observation_id, dimensions, vector, model, created_at) VALUES (?, ?, ?, ?, ?)"
      ),
      getEmbedding: this.db.prepare(
        "SELECT vector, dimensions, model FROM observation_embeddings WHERE observation_id = ?"
      ),
      getAllEmbeddings: this.db.prepare(
        "SELECT oe.observation_id, oe.vector, o.entity_id, o.content, o.status, o.authority_tier FROM observation_embeddings oe JOIN observations o ON oe.observation_id = o.id WHERE oe.model = ?"
      ),
      getUnembeddedObservations: this.db.prepare(
        "SELECT o.id, o.entity_id, o.content FROM observations o LEFT JOIN observation_embeddings oe ON o.id = oe.observation_id AND oe.model = ? WHERE oe.observation_id IS NULL AND o.status != 'invalidated' AND o.status != 'decayed'"
      )
    };
  }
  getEntityRowByName(name) {
    return this.statements.getEntityByName.get(name);
  }
  getEntityRowById(id) {
    return this.statements.getEntityById.get(id);
  }
  getObservationRowById(id) {
    return this.statements.getObservationById.get(id);
  }
  getDataDir() {
    return this.dataDir;
  }
  createEntity(input) {
    const now = nowIso();
    const entity = {
      id: uuid(),
      name: input.name.trim(),
      entityType: input.entityType.trim(),
      domain: (input.domain ?? "personal").trim(),
      visibility: (input.visibility ?? "public").trim(),
      allowedAgents: input.allowedAgents ?? [],
      createdAt: now,
      updatedAt: now
    };
    this.statements.createEntity.run(
      entity.id,
      entity.name,
      entity.entityType,
      entity.domain,
      entity.visibility,
      normalizeArray(entity.allowedAgents),
      entity.createdAt,
      entity.updatedAt
    );
    this.statements.insertFtsEntity.run(entity.name, entity.entityType, `${entity.name} ${entity.entityType}`, null, entity.id);
    return entity;
  }
  getEntityByName(name) {
    const row = this.getEntityRowByName(name);
    return row ? toEntity(row) : null;
  }
  getEntityById(id) {
    const row = this.getEntityRowById(id);
    return row ? toEntity(row) : null;
  }
  deleteEntity(id) {
    const result = this.statements.deleteEntity.run(id);
    return result.changes > 0;
  }
  addObservation(entityId, content, source, importance = "normal", confidence = 1, expiresAt, authorityTier = "contextual", derivedFrom = [], id, createdAt) {
    const now = nowIso();
    const observation = {
      id: id || uuid(),
      entityId,
      content,
      source: source ?? null,
      importance,
      confidence,
      authorityTier,
      derivedFrom,
      accessCount: 0,
      lastAccessedAt: null,
      status: "active",
      expiresAt: expiresAt ?? null,
      supersedes: null,
      createdAt: createdAt ?? now,
      updatedAt: now
    };
    this.statements.insertObservation.run(
      observation.id,
      observation.entityId,
      observation.content,
      observation.source,
      observation.importance,
      observation.confidence,
      observation.authorityTier,
      JSON.stringify(observation.derivedFrom),
      observation.accessCount,
      observation.lastAccessedAt,
      observation.status,
      observation.expiresAt,
      observation.supersedes,
      observation.createdAt,
      observation.updatedAt
    );
    return observation;
  }
  getObservationsByEntity(entityId, activeOnly = false) {
    const stmt = activeOnly ? this.statements.getActiveObservationsByEntity : this.statements.getObservationsByEntity;
    return stmt.all(entityId).map(toObservation);
  }
  getObservationById(id) {
    const row = this.getObservationRowById(id);
    return row ? toObservation(row) : null;
  }
  updateObservation(id, newContent, changedBy, authorityTier, status) {
    const existing = this.getObservationRowById(id);
    if (!existing) {
      throw new Error(`Observation not found: ${id}`);
    }
    const now = nowIso();
    const finalTier = authorityTier ?? existing.authority_tier ?? "contextual";
    const finalStatus = status ?? existing.status ?? "active";
    this.db.transaction(() => {
      this.statements.observationHistory.run(uuid(), id, existing.content, newContent, changedBy ?? null, now);
      this.statements.updateObservation.run(newContent, finalTier, finalStatus, now, id);
    })();
    const updated = this.getObservationRowById(id);
    if (!updated) {
      throw new Error(`Observation update failed: ${id}`);
    }
    return toObservation(updated);
  }
  setObservationStatus(id, status) {
    const now = nowIso();
    const result = this.statements.setObservationStatus.run(status, now, id);
    return result.changes > 0;
  }
  setSupersedes(id, supersedingId, changedBy) {
    const existing = this.getObservationRowById(id);
    if (!existing) {
      throw new Error(`Observation not found: ${id}`);
    }
    const now = nowIso();
    this.db.transaction(() => {
      this.statements.observationHistory.run(uuid(), id, existing.content, existing.content, changedBy ?? null, now);
      this.db.prepare("UPDATE observations SET supersedes = ?, status = 'superseded', updated_at = ? WHERE id = ?").run(supersedingId, now, id);
    })();
  }
  deleteObservation(id) {
    const result = this.statements.deleteObservation.run(id);
    return result.changes > 0;
  }
  createRelation(fromId, toId, relationType) {
    const relation = {
      id: uuid(),
      fromEntity: fromId,
      toEntity: toId,
      relationType,
      createdAt: nowIso()
    };
    this.statements.createRelation.run(relation.id, relation.fromEntity, relation.toEntity, relation.relationType, relation.createdAt);
    return relation;
  }
  getRelationsByEntity(entityId) {
    return this.statements.getRelationsByEntity.all(entityId, entityId).map(toRelationWithNames);
  }
  deleteRelation(id) {
    const result = this.statements.deleteRelation.run(id);
    return result.changes > 0;
  }
  // --- Media Asset Persistence ---
  createMediaAsset(input) {
    const asset = {
      id: uuid(),
      entityId: input.entityId,
      sha256: input.sha256,
      mimeType: input.mimeType,
      fileName: input.fileName,
      fileSize: input.fileSize,
      relativePath: input.relativePath,
      createdAt: nowIso()
    };
    this.statements.insertMediaAsset.run(
      asset.id,
      asset.entityId,
      asset.sha256,
      asset.mimeType,
      asset.fileName,
      asset.fileSize,
      asset.relativePath,
      asset.createdAt
    );
    return asset;
  }
  getMediaByEntity(entityId) {
    const row = this.statements.getMediaByEntity.get(entityId);
    return row ? toMediaAsset(row) : null;
  }
  getMediaByHash(sha256) {
    const row = this.statements.getMediaByHash.get(sha256);
    return row ? toMediaAsset(row) : null;
  }
  getAllMediaAssets() {
    const rows = this.statements.getAllMediaAssets.all();
    return rows.map(toMediaAsset);
  }
  getActiveMediaHashes() {
    const rows = this.db.prepare("SELECT DISTINCT sha256 FROM media_assets").all();
    return new Set(rows.map((r) => r.sha256));
  }
  pruneOrphanMedia(storageRoot) {
    const activeHashes = this.getActiveMediaHashes();
    return pruneOrphanMediaBlobs(storageRoot, activeHashes);
  }
  deleteMediaByEntity(entityId) {
    const result = this.statements.deleteMediaByEntity.run(entityId);
    return result.changes > 0;
  }
  // --- Truth Maintenance & Provenance Helpers ---
  getDependentObservations(observationId, activeOnly = false) {
    const query = activeOnly ? "SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE derived_from LIKE ? AND status = 'active'" : "SELECT id, entity_id, content, source, importance, confidence, authority_tier, derived_from, access_count, last_accessed_at, status, expires_at, supersedes, created_at, updated_at FROM observations WHERE derived_from LIKE ?";
    const rows = this.db.prepare(query).all(`%${observationId}%`);
    return rows.map(toObservation).filter((obs) => obs.derivedFrom.includes(observationId));
  }
  cascadeInvalidate(observationId) {
    const staleIds = [];
    const queue = [observationId];
    const visited = /* @__PURE__ */ new Set();
    this.setObservationStatus(observationId, "invalidated");
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const dependents = this.getDependentObservations(currentId, false);
      for (const dep of dependents) {
        if (!visited.has(dep.id)) {
          if (dep.status === "active") {
            this.setObservationStatus(dep.id, "stale");
            staleIds.push(dep.id);
          }
          queue.push(dep.id);
        }
      }
    }
    return { invalidatedIds: [observationId], staleIds };
  }
  // --- Contradiction Log Helpers ---
  recordContradiction(observationId, conflictingObservationId, entityId, reason) {
    const entry = {
      id: uuid(),
      observationId,
      conflictingObservationId,
      entityId,
      reason,
      resolution: null,
      detectedAt: nowIso(),
      resolvedAt: null
    };
    this.statements.insertContradiction.run(
      entry.id,
      entry.observationId,
      entry.conflictingObservationId,
      entry.entityId,
      entry.reason,
      entry.resolution,
      entry.detectedAt,
      entry.resolvedAt
    );
    return entry;
  }
  getContradictions(entityId, limit = 50) {
    const rows = entityId ? this.statements.getContradictionsByEntity.all(entityId) : this.statements.getAllContradictions.all(limit);
    return rows.map((r) => ({
      id: r.id,
      observationId: r.observation_id,
      conflictingObservationId: r.conflicting_observation_id,
      entityId: r.entity_id,
      reason: r.reason,
      resolution: r.resolution,
      detectedAt: r.detected_at,
      resolvedAt: r.resolved_at
    }));
  }
  resolveContradiction(id, resolution) {
    const now = nowIso();
    const result = this.statements.resolveContradiction.run(resolution, now, id);
    return result.changes > 0;
  }
  // --- Access Tracking ---
  recordAccess(entityId, observationId) {
    const now = nowIso();
    this.statements.insertAccessLog.run(uuid(), entityId, observationId ?? null, now);
    if (observationId) {
      this.statements.incrementAccess.run(now, observationId);
    }
  }
  // --- Search & Retrieval ---
  searchFTS(query, limit = 20, includeInactive = false) {
    try {
      const sanitized = sanitizeFtsQuery(query);
      if (sanitized === '""') return [];
      const rows = this.statements.searchFts.all(sanitized, limit);
      const matches = /* @__PURE__ */ new Map();
      for (const row of rows) {
        const entityRow = this.getEntityRowById(row.entity_id);
        if (!entityRow) continue;
        const entity = toEntity(entityRow);
        const observations = row.observation_id ? this.getObservationsByEntity(row.entity_id).filter((obs) => obs.id === row.observation_id).filter((obs) => includeInactive || obs.status !== "invalidated" && obs.status !== "decayed") : [];
        if (row.observation_id && observations.length === 0) {
          continue;
        }
        const existing = matches.get(entity.id);
        if (existing) {
          if (row.observation_content && !existing.observations.some((obs) => obs.id === row.observation_id)) {
            existing.observations.push(...observations);
          }
          continue;
        }
        matches.set(entity.id, {
          entity,
          observations,
          matchedContent: row.observation_content,
          rank: row.rank
        });
      }
      return [...matches.values()].map((match) => ({
        entity: match.entity,
        observations: match.observations,
        matchedContent: match.matchedContent,
        rank: match.rank
      }));
    } catch (err) {
      console.warn("FTS5 search query error:", err);
      return [];
    }
  }
  searchFTSRelevant(query, limit = 20, includeInactive = false) {
    const cleaned = stripStopWords(query);
    return this.searchFTS(cleaned, limit, includeInactive);
  }
  saveObservationEmbedding(observationId, vector, model = LocalOnnxEmbedder.DEFAULT_MODEL) {
    const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
    this.statements.upsertEmbedding.run(observationId, vector.length, buffer, model, nowIso());
  }
  getObservationEmbedding(observationId) {
    const row = this.statements.getEmbedding.get(observationId);
    if (!row) return null;
    return new Float32Array(row.vector.buffer, row.vector.byteOffset, row.dimensions);
  }
  getUnembeddedObservations(model = LocalOnnxEmbedder.DEFAULT_MODEL) {
    return this.statements.getUnembeddedObservations.all(model);
  }
  clearEmbeddings(model) {
    if (model) {
      this.db.prepare("DELETE FROM observation_embeddings WHERE model = ?").run(model);
    } else {
      this.db.prepare("DELETE FROM observation_embeddings").run();
    }
  }
  searchVector(queryVector, limit = 20, model = LocalOnnxEmbedder.DEFAULT_MODEL, minSimilarity = 0.25) {
    const rows = this.statements.getAllEmbeddings.all(model);
    const scored = [];
    const dim = queryVector.length;
    for (const r of rows) {
      if (r.status === "invalidated" || r.status === "decayed") continue;
      const v = new Float32Array(r.vector.buffer, r.vector.byteOffset, dim);
      let dot = 0;
      for (let i = 0; i < dim; i++) {
        dot += queryVector[i] * v[i];
      }
      if (dot >= minSimilarity) {
        scored.push({ row: r, similarity: dot });
      }
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    const topScored = scored.slice(0, limit);
    const results = [];
    for (const item of topScored) {
      const entityRow = this.getEntityRowById(item.row.entity_id);
      if (!entityRow) continue;
      const entity = toEntity(entityRow);
      const obs = this.getObservationsByEntity(entity.id).filter((o) => o.id === item.row.observation_id);
      results.push({
        entity,
        observations: obs,
        matchedContent: item.row.content,
        similarity: item.similarity
      });
    }
    return results;
  }
  getSharedEmbedder() {
    if (!this.sharedEmbedder) {
      this.sharedEmbedder = new LocalOnnxEmbedder();
    }
    return this.sharedEmbedder;
  }
  async searchHybrid(query, options) {
    const limit = options?.limit || 20;
    const lexicalResults = this.searchFTSRelevant(query, limit * 2);
    try {
      const embedder = options?.embedder ?? this.getSharedEmbedder();
      const queryVector = await embedder.embed(query);
      const semanticResults = this.searchVector(queryVector, limit * 2, embedder.getModelName(), options?.minSimilarity ?? 0.2);
      let fused = fuseRRF(lexicalResults, semanticResults, { limit, k: 60 });
      if (options?.domain) {
        fused = fused.filter((r) => r.entity.domain === options.domain);
      }
      return fused.slice(0, limit);
    } catch {
      if (options?.domain) {
        return lexicalResults.filter((r) => r.entity.domain === options.domain).slice(0, limit);
      }
      return lexicalResults.slice(0, limit);
    }
  }
  readGraph(domain, entityType, statusFilter) {
    const rows = this.statements.readGraphEntities.all(domain ?? null, domain ?? null, entityType ?? null, entityType ?? null);
    const entities = rows.map((row) => {
      const entity = toEntity(row);
      let observations = this.getObservationsByEntity(entity.id);
      if (statusFilter) {
        observations = observations.filter((obs) => obs.status === statusFilter);
      }
      const relations = this.getRelationsByEntity(entity.id);
      return { ...entity, observations, relations };
    });
    return { entities };
  }
  openNodes(names) {
    if (names.length === 0) {
      return { entities: [] };
    }
    const payload = JSON.stringify(names);
    const entityRows = this.statements.openNodesEntities.all(payload);
    const entityMap = /* @__PURE__ */ new Map();
    for (const row of entityRows) {
      entityMap.set(row.id, toEntity(row));
    }
    const entities = [...entityMap.values()].map((entity) => ({
      ...entity,
      observations: this.getObservationsByEntity(entity.id),
      relations: this.getRelationsByEntity(entity.id)
    }));
    return { entities };
  }
  getStats() {
    const entitiesByTypeRows = this.statements.entitiesByType.all();
    const entitiesByDomainRows = this.statements.entitiesByDomain.all();
    const observationsByTierRows = this.statements.observationsByTier.all();
    const observationsByStatusRows = this.statements.observationsByStatus.all();
    const recentActivityRows = this.statements.recentActivity.all();
    const contradictionCount = this.statements.countContradictions.get().value;
    return {
      totalEntities: this.statements.countEntities.get().value,
      totalObservations: this.statements.countObservations.get().value,
      totalRelations: this.statements.countRelations.get().value,
      totalExportTargets: this.statements.countExportTargets.get().value,
      totalMediaAssets: this.statements.countMediaAssets.get().value,
      totalContradictions: contradictionCount,
      entitiesByType: Object.fromEntries(entitiesByTypeRows.map((row) => [row.key, row.value])),
      entitiesByDomain: Object.fromEntries(entitiesByDomainRows.map((row) => [row.key, row.value])),
      observationsByTier: Object.fromEntries(observationsByTierRows.map((row) => [row.key, row.value])),
      observationsByStatus: Object.fromEntries(observationsByStatusRows.map((row) => [row.key, row.value])),
      recentActivity: recentActivityRows.map((row) => ({ type: row.type, content: row.content, createdAt: row.created_at }))
    };
  }
  cleanupExpired() {
    const now = nowIso();
    const result = this.statements.cleanupExpired.run(now);
    return result.changes;
  }
  gc() {
    const result = this.statements.gcObservations.run();
    return result.changes;
  }
  getExportTargets() {
    return this.statements.getExportTargets.all().map(toExportTarget);
  }
  addExportTarget(name, targetPath, format = "markdown", autoExport = 1) {
    const target = {
      id: uuid(),
      name,
      path: targetPath,
      format,
      autoExport: autoExport === 1
    };
    this.statements.addExportTarget.run(target.id, target.name, target.path, target.format, autoExport);
    return target;
  }
  removeExportTarget(id) {
    const result = this.statements.removeExportTarget.run(id);
    return result.changes > 0;
  }
  updateExportTarget(id, autoExport) {
    const result = this.db.prepare("UPDATE export_targets SET auto_export = ? WHERE id = ?").run(autoExport ? 1 : 0, id);
    return result.changes > 0;
  }
  listObservationHistory(observationId) {
    const rows = this.db.prepare(
      "SELECT id, observation_id, old_content, new_content, changed_by, changed_at FROM observation_history WHERE observation_id = ? ORDER BY changed_at ASC"
    ).all(observationId);
    return rows.map((row) => ({
      id: row.id,
      observationId: row.observation_id,
      oldContent: row.old_content,
      newContent: row.new_content,
      changedBy: row.changed_by,
      changedAt: row.changed_at
    }));
  }
  close() {
    this.db.close();
  }
};

// src/graph.ts
import path5 from "path";

// src/export/markdown.ts
import fs5 from "fs";
import path4 from "path";
function groupTitle(entityType) {
  const normalized = entityType.trim().toLowerCase();
  if (normalized === "person" || normalized === "people") return "People";
  if (normalized === "tool") return "Tools";
  if (normalized === "project") return "Projects";
  if (normalized === "preference") return "Preferences";
  if (normalized === "skill") return "Skills";
  return "Concepts";
}
function relationSummary(entityName, relations) {
  if (relations.length === 0) return "";
  return relations.map((relation) => {
    const other = relation.fromEntityName === entityName ? relation.toEntityName : relation.fromEntityName;
    return `${relation.relationType} \u2192 ${other}`;
  }).join(", ");
}
function renderMarkdown(snapshot) {
  const lines = [];
  lines.push("# Amneshia Memory Export");
  lines.push(`> Generated at ${(/* @__PURE__ */ new Date()).toISOString()}`);
  lines.push("");
  const grouped = /* @__PURE__ */ new Map();
  for (const entity of snapshot.entities) {
    const key = groupTitle(entity.entityType);
    const current = grouped.get(key) ?? [];
    current.push(entity);
    grouped.set(key, current);
  }
  for (const [title, entities] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`## ${title}`);
    for (const entity of entities) {
      lines.push(`### ${entity.name}`);
      const activeObs = entity.observations.filter(
        (o) => !o.supersedes && (o.expiresAt === null || new Date(o.expiresAt).getTime() > Date.now())
      );
      if (activeObs.length === 0) {
        lines.push("- No observations yet");
      } else {
        for (const observation of activeObs) {
          lines.push(`- ${observation.content}`);
        }
      }
      if (entity.relations.length > 0) {
        const relationText = relationSummary(entity.name, entity.relations);
        lines.push(`**Relations:** ${relationText}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}
`;
}
function resolveTargetPath(targetPath) {
  if (targetPath.endsWith(".md")) {
    return targetPath;
  }
  return path4.join(targetPath, "MEMORY.md");
}
function exportToMarkdown(graph, forceAll = false) {
  const targets = graph.manageExportTargets({ action: "list" });
  const snapshot = graph.readGraph();
  const markdown = renderMarkdown(snapshot);
  const writes = [];
  for (const target of targets) {
    if (target.format !== "markdown") continue;
    if (!forceAll && !target.autoExport) continue;
    try {
      const outputPath = resolveTargetPath(target.path);
      fs5.mkdirSync(path4.dirname(outputPath), { recursive: true });
      fs5.writeFileSync(outputPath, markdown, "utf8");
      writes.push({ target: target.name, path: outputPath });
    } catch (error) {
      console.warn(`Export target "${target.name}" failed:`, error instanceof Error ? error.message : error);
    }
  }
  return writes;
}

// src/graph.ts
var KnowledgeGraph = class {
  /**
   * Initializes the KnowledgeGraph orchestration service.
   * @param database Database storage layer instance
   * @param dualWriteSync Optional dual-write markdown synchronization handler
   */
  constructor(database, dualWriteSync) {
    this.database = database;
    this.dualWriteSync = dualWriteSync;
  }
  database;
  dualWriteSync;
  getDualWriteSync() {
    return this.dualWriteSync;
  }
  /**
   * Creates one or more named entities in the graph.
   * @param inputs List of entity definitions to create
   * @returns Array of created entity records
   */
  createEntities(inputs) {
    const created = [];
    for (const input of inputs) {
      const existing = this.database.getEntityByName(input.name);
      if (existing) {
        continue;
      }
      created.push(this.database.createEntity(input));
    }
    this.triggerAutoExport();
    return created;
  }
  /**
   * Creates directed relationship edges between existing entities.
   * @param inputs Array of relations to establish
   * @returns Array of created relation identifiers
   */
  createRelations(inputs) {
    const created = [];
    for (const input of inputs) {
      const fromEntity = this.database.getEntityByName(input.from);
      const toEntity2 = this.database.getEntityByName(input.to);
      if (!fromEntity || !toEntity2) {
        continue;
      }
      const rel = this.database.createRelation(fromEntity.id, toEntity2.id, input.relationType);
      created.push({ relation: rel.id });
    }
    this.triggerAutoExport();
    return created;
  }
  /**
   * Attaches factual observations to entities.
   * @param inputs List of observation insertion payloads
   * @returns Array of mapped entity names and assigned observation UUIDs
   */
  async addObservations(inputs) {
    const created = [];
    for (const input of inputs) {
      const entity = this.database.getEntityByName(input.entityName);
      if (!entity) {
        continue;
      }
      const observationIds = [];
      for (const content of input.contents) {
        const observation = this.database.addObservation(
          entity.id,
          content,
          input.source,
          input.importance ?? "normal",
          1,
          input.expiresAt,
          input.authorityTier ?? "contextual",
          input.derivedFrom ?? []
        );
        observationIds.push(observation.id);
      }
      created.push({ entityName: entity.name, observationIds });
    }
    this.triggerAutoExport();
    return created;
  }
  /**
   * Deletes entities and their associated observations and relations by name.
   * @param names List of entity names to delete
   * @returns Number of entities removed
   */
  deleteEntities(names) {
    let removed = 0;
    for (const name of names) {
      const entity = this.database.getEntityByName(name);
      if (!entity) continue;
      if (this.database.deleteEntity(entity.id)) {
        if (this.dualWriteSync) {
          this.dualWriteSync.removeEntity(entity.domain, entity.name);
        }
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }
  /**
   * Deletes discrete observations by UUID.
   * @param ids Observation UUIDs to delete
   * @returns Count of observations removed
   */
  deleteObservations(ids) {
    let removed = 0;
    for (const id of ids) {
      if (this.database.deleteObservation(id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }
  /**
   * Deletes relationship edges by UUID.
   * @param ids Relation UUIDs to delete
   * @returns Count of relations removed
   */
  deleteRelations(ids) {
    let removed = 0;
    for (const id of ids) {
      if (this.database.deleteRelation(id)) {
        removed += 1;
      }
    }
    this.triggerAutoExport();
    return removed;
  }
  /**
   * Updates an observation and executes cascading invalidation if marked stale or invalidated.
   * @param input Update observation payload
   * @returns Updated observation record
   */
  updateObservation(input) {
    const updated = this.database.updateObservation(
      input.observationId,
      input.newContent,
      input.changedBy,
      input.authorityTier,
      input.status
    );
    if (input.status === "invalidated" || input.status === "stale") {
      this.database.cascadeInvalidate(input.observationId);
    }
    this.triggerAutoExport();
    return updated;
  }
  /**
   * Performs standard FTS5 full-text search against the knowledge graph.
   * @param query Search query string
   * @param limit Maximum results to return
   * @param domain Optional domain filter
   * @returns Formatted search result
   */
  searchMemory(query, limit = 20, domain) {
    const filtered = this.database.searchFTS(query, limit * 2).filter((result) => domain ? result.entity.domain === domain : true);
    return {
      query,
      limit,
      results: filtered.slice(0, limit)
    };
  }
  /**
   * Performs BM25 relevance-ranked FTS5 search excluding invalidated facts.
   * @param query Search query string
   * @param limit Maximum results to return
   * @param domain Optional domain filter
   * @returns Formatted search result
   */
  searchRelevantMemory(query, limit = 20, domain) {
    const filtered = this.database.searchFTSRelevant(query, limit * 2).filter((result) => domain ? result.entity.domain === domain : true);
    return {
      query,
      limit,
      results: filtered.slice(0, limit)
    };
  }
  /**
   * Executes multi-hop GraphRAG traversal to compile rich structured context for an agent.
   * @param query Search query topic
   * @param depth Graph hop traversal depth
   * @param limit Maximum seed entities
   * @param domain Optional domain filter
   * @returns Markdown-formatted GraphRAG context document
   */
  getContext(query, depth = 1, limit = 5, domain) {
    const seeds = this.database.searchFTSRelevant(query, limit).filter((result) => domain ? result.entity.domain === domain : true);
    if (seeds.length === 0) return "No relevant context found.";
    const visitedEntityIds = /* @__PURE__ */ new Set();
    const currentLevelIds = /* @__PURE__ */ new Set();
    for (const seed of seeds) {
      visitedEntityIds.add(seed.entity.id);
      currentLevelIds.add(seed.entity.id);
    }
    const relationsCollected = /* @__PURE__ */ new Map();
    for (let currentDepth = 0; currentDepth < depth; currentDepth++) {
      const nextLevelIds = /* @__PURE__ */ new Set();
      for (const id of currentLevelIds) {
        const relations = this.database.getRelationsByEntity(id);
        for (const rel of relations) {
          relationsCollected.set(rel.id, rel);
          if (!visitedEntityIds.has(rel.fromEntity)) {
            nextLevelIds.add(rel.fromEntity);
            visitedEntityIds.add(rel.fromEntity);
          }
          if (!visitedEntityIds.has(rel.toEntity)) {
            nextLevelIds.add(rel.toEntity);
            visitedEntityIds.add(rel.toEntity);
          }
        }
      }
      currentLevelIds.clear();
      for (const id of nextLevelIds) currentLevelIds.add(id);
    }
    const entities = Array.from(visitedEntityIds).map((id) => {
      const entity = this.database.getEntityById(id);
      if (!entity) return null;
      const observations = this.database.getObservationsByEntity(id).filter(
        (o) => o.status === "active" && !o.supersedes && (o.expiresAt === null || new Date(o.expiresAt).getTime() > Date.now())
      );
      return { ...entity, observations };
    }).filter((e) => e !== null);
    const lines = [];
    lines.push(`# GraphRAG Context for: "${query}"`);
    lines.push(`> Depth: ${depth}, Seed matches: ${seeds.length}, Total entities in subgraph: ${entities.length}
`);
    for (const entity of entities) {
      lines.push(`### ${entity.name} [${entity.entityType}]`);
      if (entity.observations.length === 0) {
        lines.push(`- (No active observations)`);
      } else {
        for (const obs of entity.observations) {
          lines.push(`- ${obs.content}`);
        }
      }
      const entityRels = Array.from(relationsCollected.values()).filter((r) => r.fromEntity === entity.id || r.toEntity === entity.id);
      if (entityRels.length > 0) {
        const relSummaries = Array.from(new Set(entityRels.map((r) => {
          const other = r.fromEntity === entity.id ? r.toEntityName : r.fromEntityName;
          const direction = r.fromEntity === entity.id ? "\u2192" : "\u2190";
          return `${direction} ${r.relationType} ${other}`;
        })));
        lines.push(`**Relations:** ${relSummaries.join(", ")}`);
      }
      lines.push("");
    }
    return lines.join("\n").trimEnd();
  }
  /**
   * Retrieves a full snapshot of the knowledge graph.
   * @param domain Optional domain filter
   * @param entityType Optional entity type filter
   * @returns Graph snapshot with entities, observations, and relations
   */
  readGraph(domain, entityType) {
    return this.database.readGraph(domain, entityType);
  }
  /**
   * Opens specific nodes by entity name, returning their complete subgraphs.
   * @param names List of entity names to inspect
   * @returns Graph snapshot for matching nodes
   */
  openNodes(names) {
    return this.database.openNodes(names);
  }
  /**
   * Fetches health metrics and quantitative storage breakdown.
   * @returns MemoryStats object
   */
  getStats() {
    return this.database.getStats();
  }
  /**
   * Purges expired observations that have passed their TTL.
   * @returns Count of observations removed
   */
  cleanupExpired() {
    return this.database.cleanupExpired();
  }
  /**
   * Exports memory snapshot to all configured export targets.
   * @returns Summary of exported targets
   */
  exportMemory() {
    const targets = this.database.getExportTargets();
    return { exported: targets.length, targets };
  }
  /**
   * Manages export targets (list, add, remove, toggle).
   * @param input Action payload
   * @returns Target mutation result
   */
  manageExportTargets(input) {
    if (input.action === "list") {
      return this.database.getExportTargets();
    }
    if (input.action === "add") {
      if (!input.name || !input.path) {
        throw new Error("name and path are required when adding an export target");
      }
      const resolvedTarget = path5.resolve(input.path);
      const sensitivePatterns = [
        /(?:^|[/\\])\.ssh(?:[/\\]|$)/i,
        /(?:^|[/\\])\.gnupg(?:[/\\]|$)/i,
        /(?:^|[/\\])\.bashrc$/i,
        /(?:^|[/\\])\.zshrc$/i,
        /(?:^|[/\\])\.profile$/i,
        /(?:^|[/\\])etc[/\\]/i
      ];
      for (const pattern of sensitivePatterns) {
        if (pattern.test(resolvedTarget)) {
          throw new Error(`Security violation: export target cannot point to system or shell config file "${input.path}".`);
        }
      }
      const autoExport = input.autoExport !== false ? 1 : 0;
      return this.database.addExportTarget(input.name, input.path, input.format ?? "markdown", autoExport);
    }
    if (input.action === "remove") {
      if (!input.id) {
        throw new Error("id is required when removing an export target");
      }
      return { removed: this.database.removeExportTarget(input.id) };
    }
    if (input.action === "toggle") {
      if (!input.id) {
        throw new Error("id is required when toggling an export target");
      }
      const targets = this.database.getExportTargets();
      const target = targets.find((t) => t.id === input.id);
      if (!target) {
        throw new Error(`Export target with id ${input.id} not found`);
      }
      const newAutoExport = !target.autoExport;
      this.database.updateExportTarget(input.id, newAutoExport);
      return { id: input.id, autoExport: newAutoExport };
    }
    throw new Error(`Invalid action: ${input.action}`);
  }
  /**
   * Resolves the primary storage root directory for media CAS.
   * Prefers the Git-synced knowledgeDir if dual-write sync is active.
   */
  getStorageRoot() {
    return this.dualWriteSync ? this.dualWriteSync.getKnowledgeDir() : this.database.getDataDir();
  }
  /**
   * Ingests an immutable media asset into Content-Addressable Storage (CAS),
   * creates or links an entity, persists a media_assets record, attaches descriptive observations,
   * establishes directed relations, and triggers dual-write sync.
   * @param input High-level media ingestion payload
   * @returns Ingestion outcome including entity, media asset, and observation identifiers
   */
  async rememberMedia(input) {
    const storageRoot = this.getStorageRoot();
    const stored = await storeMediaAsset(input.filePath, storageRoot);
    let entity = this.database.getEntityByName(input.entity);
    if (!entity) {
      entity = this.database.createEntity({
        name: input.entity,
        entityType: "media",
        domain: input.domain ?? "personal"
      });
    }
    let media = this.database.getMediaByEntity(entity.id);
    if (!media) {
      media = this.database.createMediaAsset({
        entityId: entity.id,
        sha256: stored.sha256,
        mimeType: stored.mimeType,
        fileName: stored.fileName,
        fileSize: stored.fileSize,
        relativePath: stored.relativePath
      });
    } else if (media.sha256 !== stored.sha256) {
      this.database.deleteMediaByEntity(entity.id);
      media = this.database.createMediaAsset({
        entityId: entity.id,
        sha256: stored.sha256,
        mimeType: stored.mimeType,
        fileName: stored.fileName,
        fileSize: stored.fileSize,
        relativePath: stored.relativePath
      });
    }
    const observationIds = [];
    const tier = input.tier ?? "contextual";
    for (const fact of input.facts) {
      const obs = this.database.addObservation(
        entity.id,
        fact,
        "media-ingest",
        "normal",
        1,
        void 0,
        tier
      );
      observationIds.push(obs.id);
    }
    const relationsCreated = [];
    if (input.relations && input.relations.length > 0) {
      for (const rel of input.relations) {
        const targetEntity = this.database.getEntityByName(rel.to);
        if (targetEntity) {
          const createdRel = this.database.createRelation(entity.id, targetEntity.id, rel.relationType);
          relationsCreated.push(createdRel.id);
        }
      }
    }
    this.triggerAutoExport();
    return {
      ok: true,
      entity,
      media,
      observationIds,
      relations: relationsCreated,
      deduplicated: stored.deduplicated
    };
  }
  /**
   * Retrieves media asset details associated with an entity.
   * @param entityId Entity UUID
   * @returns MediaAsset record or null if not found
   */
  getMediaByEntity(entityId) {
    return this.database.getMediaByEntity(entityId);
  }
  /**
   * Retrieves media asset details by cryptographic SHA-256 hash.
   * @param sha256 Content digest
   * @returns MediaAsset record or null if not found
   */
  getMediaByHash(sha256) {
    return this.database.getMediaByHash(sha256);
  }
  /**
   * Retrieves all registered media assets across the knowledge graph.
   * @returns Array of MediaAsset records
   */
  getAllMedia() {
    return this.database.getAllMediaAssets();
  }
  /**
   * Scans and purges unreferenced media blobs from CAS storage.
   * @returns Count of deleted files and reclaimed byte count
   */
  pruneOrphanMedia() {
    const storageRoot = this.getStorageRoot();
    return this.database.pruneOrphanMedia(storageRoot);
  }
  triggerAutoExport(targetEntityNames) {
    exportToMarkdown(this);
    if (this.dualWriteSync) {
      try {
        if (targetEntityNames) {
          const names = Array.isArray(targetEntityNames) ? targetEntityNames : [targetEntityNames];
          for (const name of names) {
            const ent = this.database.getEntityByName(name);
            if (ent) {
              this.dualWriteSync.syncEntity(ent);
            }
          }
          return;
        }
        this.dualWriteSync.syncAll();
      } catch (err) {
        console.warn("Failed to sync to markdown storage:", err);
      }
    }
  }
};

// src/tools/index.ts
import { z as z8 } from "zod";

// src/tools/core.ts
import path8 from "path";
import { z } from "zod";

// src/maintenance/contradiction.ts
var NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bnever\b/i,
  /\bno longer\b/i,
  /\binstead of\b/i,
  /\bdeprecated\b/i,
  /\bremoved\b/i,
  /\bdisabled\b/i,
  /\breplaced by\b/i,
  /\bmigrated from\b/i,
  /\bswitched from\b/i,
  /\btidak lagi\b/i,
  /\bbukan\b/i,
  /\bjangan\b/i
];
function tokenize(text) {
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 2)
  );
}
function detectRuleBasedContradiction(incomingContent, existingObservations) {
  const incomingTokens = tokenize(incomingContent);
  const incomingHasNegation = NEGATION_PATTERNS.some((pattern) => pattern.test(incomingContent));
  for (const existing of existingObservations) {
    if (existing.status !== "active") continue;
    const existingTokens = tokenize(existing.content);
    const existingHasNegation = NEGATION_PATTERNS.some((pattern) => pattern.test(existing.content));
    const intersection = new Set([...incomingTokens].filter((t) => existingTokens.has(t)));
    const overlapRatio = intersection.size / Math.min(incomingTokens.size, existingTokens.size || 1);
    if (overlapRatio >= 0.5 && incomingHasNegation !== existingHasNegation) {
      return {
        hasContradiction: true,
        conflictingObservation: existing,
        reason: `Contradiction detected: polar opposition on overlapping topic ("${[...intersection].slice(0, 3).join(", ")}")`,
        suggestion: `The existing fact is: "${existing.content}" [${existing.authorityTier}]. Consider updating or superseding it instead of adding a conflicting fact.`
      };
    }
    const insteadMatch = incomingContent.match(/instead of\s+([a-zA-Z0-9_-]+)/i);
    if (insteadMatch && existing.content.toLowerCase().includes(insteadMatch[1].toLowerCase())) {
      return {
        hasContradiction: true,
        conflictingObservation: existing,
        reason: `Explicit replacement detected: "${incomingContent}" replaces "${insteadMatch[1]}"`,
        suggestion: `The existing fact mentions "${insteadMatch[1]}". Consider superseding observation ${existing.id}.`
      };
    }
  }
  return { hasContradiction: false };
}
async function checkContradiction(incomingContent, entityId, db) {
  const activeObservations = db.getObservationsByEntity(entityId, true);
  if (activeObservations.length === 0) {
    return { hasContradiction: false };
  }
  return detectRuleBasedContradiction(incomingContent, activeObservations);
}

// src/cloud/git-sync.ts
import fs7 from "fs";
import path7 from "path";
import os3 from "os";
import { execFile } from "child_process";
import { promisify } from "util";

// src/storage/markdown-store.ts
import fs6 from "fs";
import path6 from "path";

// src/storage/slug.ts
function toSlug(text) {
  const slug = text.toLowerCase().trim().replace(/\.+/g, "-").replace(/[:\/\\?#\[\]@!$&'()*+,;=]/g, "-").replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!slug || slug === "." || slug === "..") {
    return "unnamed";
  }
  return slug;
}

// src/storage/markdown-store.ts
function serializeEntity(entity, observations, relations, media) {
  const frontmatterLines = [
    "---",
    `id: ${JSON.stringify(entity.id)}`,
    `name: ${JSON.stringify(entity.name)}`,
    `type: ${JSON.stringify(entity.entityType)}`,
    `domain: ${JSON.stringify(entity.domain)}`,
    `visibility: ${JSON.stringify(entity.visibility)}`,
    `allowed_agents: ${JSON.stringify(entity.allowedAgents)}`,
    `created: ${JSON.stringify(entity.createdAt)}`,
    `updated: ${JSON.stringify(entity.updatedAt)}`
  ];
  if (media) {
    frontmatterLines.push("media:");
    frontmatterLines.push(`  sha256: ${JSON.stringify(media.sha256)}`);
    frontmatterLines.push(`  mime_type: ${JSON.stringify(media.mimeType)}`);
    frontmatterLines.push(`  file_name: ${JSON.stringify(media.fileName)}`);
    frontmatterLines.push(`  file_size: ${media.fileSize}`);
    frontmatterLines.push(`  relative_path: ${JSON.stringify(media.relativePath)}`);
  }
  frontmatterLines.push("---");
  const frontmatter = frontmatterLines.join("\n");
  const obsLines = [];
  for (const obs of observations) {
    const isInactive = obs.status === "superseded" || obs.status === "invalidated" || obs.status === "decayed";
    const mainText = `**[${obs.authorityTier}]** ${obs.content}`;
    const formattedText = isInactive ? `~~${mainText}~~` : mainText;
    const metaParts = [
      `id: ${obs.id}`,
      `confidence: ${obs.confidence}`
    ];
    if (obs.derivedFrom && obs.derivedFrom.length > 0) {
      metaParts.push(`derived_from: [${obs.derivedFrom.join(", ")}]`);
    }
    metaParts.push(`status: ${obs.status}`);
    if (obs.supersedes) {
      metaParts.push(`superseded_by: ${obs.supersedes}`);
    }
    obsLines.push(`- ${formattedText}
  \`${metaParts.join(" | ")}\``);
  }
  const relLines = [];
  for (const rel of relations) {
    const target = rel.fromEntity === entity.id ? rel.toEntityName : rel.fromEntityName;
    const direction = rel.fromEntity === entity.id ? "->" : "<-";
    relLines.push(`- \`${rel.relationType}\` ${direction} ${target}`);
  }
  const sections = [frontmatter];
  if (media) {
    if (media.mimeType.startsWith("image/")) {
      sections.push(`
![${media.fileName}](../${media.relativePath})
`);
    } else {
      sections.push(`
[${media.fileName}](../${media.relativePath}) *(${media.mimeType}, ${media.fileSize} bytes)*
`);
    }
  }
  sections.push("## Observations\n");
  if (obsLines.length > 0) {
    sections.push(obsLines.join("\n\n"));
  } else {
    sections.push("_No observations recorded yet._");
  }
  sections.push("\n## Relations\n");
  if (relLines.length > 0) {
    sections.push(relLines.join("\n"));
  } else {
    sections.push("_No relations recorded yet._");
  }
  return sections.join("\n") + "\n";
}
function parseEntityMarkdown(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid markdown entity format: missing frontmatter");
  }
  const frontmatterStr = match[1];
  const bodyStr = match[2];
  const getFrontmatterValue = (key) => {
    const fieldMatch = frontmatterStr.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
    if (!fieldMatch) return null;
    let val = fieldMatch[1].trim();
    if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    }
    return val;
  };
  const id = getFrontmatterValue("id") || "";
  const name = getFrontmatterValue("name") || "";
  const entityType = getFrontmatterValue("type") || "concept";
  const domain = getFrontmatterValue("domain") || "personal";
  const visibility = getFrontmatterValue("visibility") || "public";
  const createdAt = getFrontmatterValue("created") || (/* @__PURE__ */ new Date()).toISOString();
  const updatedAt = getFrontmatterValue("updated") || (/* @__PURE__ */ new Date()).toISOString();
  let allowedAgents = [];
  const rawAgents = getFrontmatterValue("allowed_agents");
  if (rawAgents) {
    try {
      allowedAgents = JSON.parse(rawAgents);
    } catch {
      allowedAgents = [];
    }
  }
  let media;
  if (frontmatterStr.includes("media:")) {
    const getMediaField = (field) => {
      const m = frontmatterStr.match(new RegExp(`^[ \\t]+${field}:\\s*(.*)$`, "m"));
      if (!m) return null;
      let val = m[1].trim();
      if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
        val = val.slice(1, -1);
      }
      return val;
    };
    const sha256 = getMediaField("sha256");
    const mimeType = getMediaField("mime_type");
    const fileName = getMediaField("file_name");
    const fileSizeStr = getMediaField("file_size");
    const relativePath = getMediaField("relative_path");
    if (sha256 && relativePath) {
      media = {
        sha256,
        mimeType: mimeType || "application/octet-stream",
        fileName: fileName || path6.basename(relativePath),
        fileSize: fileSizeStr ? parseInt(fileSizeStr, 10) || 0 : 0,
        relativePath
      };
    }
  }
  const observations = [];
  const relations = [];
  const obsSectionMatch = bodyStr.match(/## Observations\r?\n([\s\S]*?)(?=\r?\n## Relations|$)/i);
  if (obsSectionMatch) {
    const obsBlock = obsSectionMatch[1];
    const items = obsBlock.split(/(?:^|\n)- /m).filter((item) => item.trim() && !item.includes("_No observations"));
    for (const item of items) {
      const lines = item.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;
      let contentLine = lines[0];
      const isStrikethrough = contentLine.startsWith("~~") && contentLine.endsWith("~~");
      if (isStrikethrough) {
        contentLine = contentLine.slice(2, -2);
      }
      let authorityTier = "contextual";
      const tierMatch = contentLine.match(/^\*\*\[(invariant|architectural|contextual|ephemeral)\]\*\*\s*(.*)$/);
      let factContent = contentLine;
      if (tierMatch) {
        authorityTier = tierMatch[1];
        factContent = tierMatch[2];
      }
      let obsId = "";
      let confidence = 1;
      let status = isStrikethrough ? "superseded" : "active";
      let derivedFrom = [];
      let supersedes = null;
      if (lines.length > 1 && lines[1].startsWith("`") && lines[1].endsWith("`")) {
        const metaStr = lines[1].slice(1, -1);
        const parts = metaStr.split("|").map((p) => p.trim());
        for (const part of parts) {
          const [k, ...vParts] = part.split(":").map((p) => p.trim());
          const v = vParts.join(":").trim();
          if (k === "id") obsId = v;
          else if (k === "confidence") confidence = parseFloat(v) || 1;
          else if (k === "status") status = v;
          else if (k === "superseded_by") supersedes = v;
          else if (k === "derived_from") {
            const arrMatch = v.match(/\[(.*)\]/);
            if (arrMatch && arrMatch[1]) {
              derivedFrom = arrMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
            }
          }
        }
      }
      if (factContent) {
        observations.push({
          id: obsId,
          content: factContent,
          authorityTier,
          derivedFrom,
          confidence,
          status,
          supersedes
        });
      }
    }
  }
  const relSectionMatch = bodyStr.match(/## Relations\r?\n([\s\S]*?)$/i);
  if (relSectionMatch) {
    const relBlock = relSectionMatch[1];
    const lines = relBlock.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- `"));
    for (const line of lines) {
      const relMatch = line.match(/^- `(.*?)`\s*(?:->|<-)\s*(.*)$/);
      if (relMatch) {
        relations.push({
          relationType: relMatch[1],
          targetName: relMatch[2].trim()
        });
      }
    }
  }
  return {
    id,
    name,
    entityType,
    domain,
    visibility,
    allowedAgents,
    createdAt,
    updatedAt,
    observations,
    relations,
    media
  };
}
function getEntityFilePath(knowledgeDir, domain, name) {
  const domainSlug = toSlug(domain);
  const nameSlug = toSlug(name);
  const resolvedBase = path6.resolve(knowledgeDir);
  const targetPath = path6.resolve(resolvedBase, domainSlug, `${nameSlug}.md`);
  if (!targetPath.startsWith(resolvedBase + path6.sep)) {
    throw new Error("Path traversal violation: entity file path escapes knowledge directory.");
  }
  return targetPath;
}
function saveEntityMarkdown(knowledgeDir, entity, observations, relations, media) {
  const filePath = getEntityFilePath(knowledgeDir, entity.domain, entity.name);
  const dir = path6.dirname(filePath);
  fs6.mkdirSync(dir, { recursive: true });
  const content = serializeEntity(entity, observations, relations, media);
  fs6.writeFileSync(filePath, content, "utf-8");
  return filePath;
}
function deleteEntityMarkdown(knowledgeDir, domain, name) {
  const filePath = getEntityFilePath(knowledgeDir, domain, name);
  if (fs6.existsSync(filePath)) {
    fs6.unlinkSync(filePath);
    return true;
  }
  return false;
}
function loadAllEntityMarkdowns(knowledgeDir) {
  if (!fs6.existsSync(knowledgeDir)) {
    return [];
  }
  const results = [];
  function scan(dir) {
    const entries = fs6.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path6.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "blobs" || entry.name.startsWith(".")) {
          continue;
        }
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const content = fs6.readFileSync(fullPath, "utf-8");
          const parsed = parseEntityMarkdown(content);
          results.push(parsed);
        } catch (e) {
          console.warn(`Failed to parse markdown entity at ${fullPath}:`, e);
        }
      }
    }
  }
  scan(knowledgeDir);
  return results;
}

// src/storage/reindex.ts
function reindexFromMarkdown(knowledgeDir, db) {
  const parsedEntities = loadAllEntityMarkdowns(knowledgeDir);
  let entityCount = 0;
  let observationCount = 0;
  let relationCount = 0;
  let mediaCount = 0;
  for (const item of parsedEntities) {
    let existing = db.getEntityByName(item.name);
    if (!existing) {
      existing = db.createEntity({
        name: item.name,
        entityType: item.entityType,
        domain: item.domain,
        visibility: item.visibility,
        allowedAgents: item.allowedAgents
      });
      entityCount++;
    }
    if (item.media) {
      const existingMedia = db.getMediaByEntity(existing.id);
      if (!existingMedia) {
        db.createMediaAsset({
          entityId: existing.id,
          sha256: item.media.sha256,
          mimeType: item.media.mimeType,
          fileName: item.media.fileName,
          fileSize: item.media.fileSize,
          relativePath: item.media.relativePath
        });
        mediaCount++;
      }
    }
  }
  for (const item of parsedEntities) {
    const entity = db.getEntityByName(item.name);
    if (!entity) continue;
    const existingObs = db.getObservationsByEntity(entity.id);
    const existingObsContents = new Set(existingObs.map((o) => o.content));
    const existingObsIds = new Set(existingObs.map((o) => o.id));
    for (const obs of item.observations) {
      if (obs.id && existingObsIds.has(obs.id)) {
        continue;
      }
      if (existingObsContents.has(obs.content)) {
        continue;
      }
      const created = db.addObservation(
        entity.id,
        obs.content,
        "reindex",
        "normal",
        obs.confidence,
        void 0,
        obs.authorityTier,
        obs.derivedFrom,
        obs.id,
        item.createdAt
      );
      if (obs.status && obs.status !== "active") {
        db.setObservationStatus(created.id, obs.status);
      }
      observationCount++;
    }
    for (const rel of item.relations) {
      const targetEntity = db.getEntityByName(rel.targetName);
      if (targetEntity) {
        db.createRelation(entity.id, targetEntity.id, rel.relationType);
        relationCount++;
      }
    }
  }
  return {
    entities: entityCount,
    observations: observationCount,
    relations: relationCount,
    mediaAssets: mediaCount
  };
}

// src/cloud/git-sync.ts
var execFileAsync = promisify(execFile);
async function git(cwd, args) {
  try {
    return await execFileAsync("git", args, { cwd });
  } catch (error) {
    const errorMsg = error.stderr || error.stdout || error.message;
    throw new Error(`Git error (${args[0]}): ${errorMsg.trim()}`);
  }
}
function validateBranchName(branch) {
  if (!branch || typeof branch !== "string" || branch.startsWith("-") || !/^[a-zA-Z0-9_\-\./]+$/.test(branch)) {
    throw new Error(`Invalid or unsafe branch name: ${branch}`);
  }
}
function getCloudConfigPath(knowledgeDir) {
  return path7.join(path7.dirname(knowledgeDir), "cloud.json");
}
function readCloudConfig(knowledgeDir) {
  const cfgPath = getCloudConfigPath(knowledgeDir);
  if (!fs7.existsSync(cfgPath)) return null;
  try {
    return JSON.parse(fs7.readFileSync(cfgPath, "utf-8"));
  } catch {
    return null;
  }
}
function saveCloudConfig(knowledgeDir, config) {
  const cfgPath = getCloudConfigPath(knowledgeDir);
  fs7.mkdirSync(path7.dirname(cfgPath), { recursive: true });
  fs7.writeFileSync(cfgPath, JSON.stringify(config, null, 2), "utf-8");
}
async function setupGitRemote(knowledgeDir, remoteUrl, branch = "main") {
  validateBranchName(branch);
  fs7.mkdirSync(knowledgeDir, { recursive: true });
  const gitDir = path7.join(knowledgeDir, ".git");
  if (!fs7.existsSync(gitDir)) {
    await git(knowledgeDir, ["init", "-b", branch]);
  }
  try {
    await git(knowledgeDir, ["config", "user.name"]);
  } catch {
    await git(knowledgeDir, ["config", "user.name", "Amneshia Agent"]);
    await git(knowledgeDir, ["config", "user.email", "amneshia@local"]);
  }
  const gitignorePath = path7.join(knowledgeDir, ".gitignore");
  if (!fs7.existsSync(gitignorePath)) {
    fs7.writeFileSync(gitignorePath, "*.db*\n*.log*\n.DS_Store\n", "utf-8");
  }
  let hasOrigin = false;
  try {
    const { stdout } = await git(knowledgeDir, ["remote"]);
    hasOrigin = stdout.split("\n").map((r) => r.trim()).includes("origin");
  } catch {
  }
  if (hasOrigin) {
    await git(knowledgeDir, ["remote", "set-url", "origin", remoteUrl]);
  } else {
    await git(knowledgeDir, ["remote", "add", "origin", remoteUrl]);
  }
  saveCloudConfig(knowledgeDir, {
    remoteUrl,
    branch,
    lastSyncAt: null
  });
  await setupMergeDriver(knowledgeDir);
  return { success: true, remoteUrl, branch };
}
async function setupMergeDriver(knowledgeDir, options) {
  if (options?.isGlobal) {
    await git(process.cwd(), ["config", "--global", "merge.amneshia.name", "Amneshia Markdown 3-Way Merge Driver"]);
    await git(process.cwd(), ["config", "--global", "merge.amneshia.driver", "amneshia cloud merge-driver %O %A %B %P"]);
    return true;
  }
  const gitDir = path7.join(knowledgeDir, ".git");
  if (!fs7.existsSync(gitDir)) return false;
  const gitattributesPath = path7.join(knowledgeDir, ".gitattributes");
  const attrLine = "*.md merge=amneshia";
  if (!fs7.existsSync(gitattributesPath)) {
    fs7.writeFileSync(gitattributesPath, `${attrLine}
`, "utf-8");
  } else {
    const content = fs7.readFileSync(gitattributesPath, "utf-8");
    if (!content.includes("merge=amneshia")) {
      fs7.appendFileSync(gitattributesPath, `
${attrLine}
`, "utf-8");
    }
  }
  await git(knowledgeDir, ["config", "merge.amneshia.name", "Amneshia Markdown 3-Way Merge Driver"]);
  await git(knowledgeDir, ["config", "merge.amneshia.driver", "amneshia cloud merge-driver %O %A %B %P"]);
  return true;
}
async function getCloudStatus(knowledgeDir) {
  const gitDir = path7.join(knowledgeDir, ".git");
  const initialized = fs7.existsSync(gitDir);
  const config = readCloudConfig(knowledgeDir);
  if (!initialized) {
    return {
      initialized: false,
      knowledgeDir,
      remoteUrl: config?.remoteUrl ?? null,
      branch: config?.branch ?? "main",
      clean: true,
      uncommittedFiles: [],
      lastSyncAt: config?.lastSyncAt ?? null
    };
  }
  let remoteUrl = config?.remoteUrl ?? null;
  try {
    const { stdout } = await git(knowledgeDir, ["remote", "get-url", "origin"]);
    remoteUrl = stdout.trim();
  } catch {
  }
  let branch = config?.branch ?? "main";
  try {
    const { stdout } = await git(knowledgeDir, ["branch", "--show-current"]);
    if (stdout.trim()) branch = stdout.trim();
  } catch {
  }
  const { stdout: statusOut } = await git(knowledgeDir, ["status", "--porcelain"]);
  const uncommittedFiles = statusOut.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  return {
    initialized: true,
    knowledgeDir,
    remoteUrl,
    branch,
    clean: uncommittedFiles.length === 0,
    uncommittedFiles,
    lastSyncAt: config?.lastSyncAt ?? null
  };
}
async function cloudPull(knowledgeDir, db, branch = "main") {
  const status = await getCloudStatus(knowledgeDir);
  if (!status.initialized || !status.remoteUrl) {
    throw new Error('Cloud sync not initialized. Run "amneshia cloud setup <remote-url>" first.');
  }
  const gitignorePath = path7.join(knowledgeDir, ".gitignore");
  let hadUntrackedGitignore = false;
  if (fs7.existsSync(gitignorePath)) {
    try {
      const { stdout } = await git(knowledgeDir, ["status", "--porcelain", ".gitignore"]);
      if (stdout.includes("??")) {
        fs7.unlinkSync(gitignorePath);
        hadUntrackedGitignore = true;
      }
    } catch {
    }
  }
  const gitattributesPath = path7.join(knowledgeDir, ".gitattributes");
  let hadUntrackedGitattributes = false;
  if (fs7.existsSync(gitattributesPath)) {
    try {
      const { stdout } = await git(knowledgeDir, ["status", "--porcelain", ".gitattributes"]);
      if (stdout.includes("??")) {
        fs7.unlinkSync(gitattributesPath);
        hadUntrackedGitattributes = true;
      }
    } catch {
    }
  }
  await git(knowledgeDir, ["config", "merge.amneshia.name", "Amneshia Markdown 3-Way Merge Driver"]);
  await git(knowledgeDir, ["config", "merge.amneshia.driver", "amneshia cloud merge-driver %O %A %B %P"]);
  let rawOutput = "";
  try {
    validateBranchName(branch);
    const res = await git(knowledgeDir, ["pull", "--no-rebase", "origin", "--", branch]);
    rawOutput = res.stdout + res.stderr;
  } catch (err) {
    if (err.message.includes("couldn't find remote ref") || err.message.includes("no such ref")) {
      rawOutput = "Remote branch does not exist yet; continuing with local state.";
    } else {
      if (hadUntrackedGitignore && !fs7.existsSync(gitignorePath)) {
        fs7.writeFileSync(gitignorePath, "*.db*\n*.log*\n.DS_Store\n", "utf-8");
      }
      if (hadUntrackedGitattributes && !fs7.existsSync(gitattributesPath)) {
        fs7.writeFileSync(gitattributesPath, "*.md merge=amneshia\n", "utf-8");
      }
      throw err;
    }
  }
  if (!fs7.existsSync(gitignorePath)) {
    fs7.writeFileSync(gitignorePath, "*.db*\n*.log*\n.DS_Store\n", "utf-8");
  }
  await setupMergeDriver(knowledgeDir);
  const reindex = reindexFromMarkdown(knowledgeDir, db);
  const cfg = readCloudConfig(knowledgeDir) ?? { remoteUrl: status.remoteUrl, branch, lastSyncAt: null };
  cfg.lastSyncAt = (/* @__PURE__ */ new Date()).toISOString();
  saveCloudConfig(knowledgeDir, cfg);
  return {
    pulled: true,
    rawOutput,
    reindex
  };
}
async function cloudPush(knowledgeDir, message, branch = "main") {
  const status = await getCloudStatus(knowledgeDir);
  if (!status.initialized || !status.remoteUrl) {
    throw new Error('Cloud sync not initialized. Run "amneshia cloud setup <remote-url>" first.');
  }
  await git(knowledgeDir, ["add", "-A"]);
  const { stdout: statusOut } = await git(knowledgeDir, ["status", "--porcelain"]);
  const hasChanges = statusOut.trim().length > 0;
  if (hasChanges) {
    const hostname = os3.hostname();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const commitMsg = message ?? `amneshia(sync): update knowledge graph from ${hostname} (${timestamp})`;
    await git(knowledgeDir, ["commit", "-m", commitMsg]);
  }
  let commitHash = "";
  try {
    const { stdout: revOut } = await git(knowledgeDir, ["rev-parse", "HEAD"]);
    commitHash = revOut.trim();
  } catch {
  }
  validateBranchName(branch);
  const pushRes = await git(knowledgeDir, ["push", "-u", "origin", "--", branch]);
  const cfg = readCloudConfig(knowledgeDir) ?? { remoteUrl: status.remoteUrl, branch, lastSyncAt: null };
  cfg.lastSyncAt = (/* @__PURE__ */ new Date()).toISOString();
  saveCloudConfig(knowledgeDir, cfg);
  return {
    pushed: true,
    commitHash,
    message: hasChanges ? "Committed and pushed latest changes" : "Pushed existing commits (no new local changes)"
  };
}
async function cloudSync(knowledgeDir, db, branch = "main") {
  const pull = await cloudPull(knowledgeDir, db, branch);
  const push = await cloudPush(knowledgeDir, void 0, branch);
  return {
    pull,
    push,
    syncedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/tools/core.ts
function textContent(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}
function estimateTokens(text) {
  return Math.ceil(text.length / 3.8);
}
function registerCoreTools(server, graph, db) {
  server.tool(
    "remember",
    'Store one or more factual observations under an entity in the knowledge graph. Automatically creates the entity if missing, evaluates pre-insertion contradiction detection against existing facts, assigns authority tiers, and records logical dependencies.\n\nWHEN TO USE:\n- Use "remember" to record new knowledge, user preferences, architectural decisions, or verified facts.\n- DO NOT use to invalidate or delete outdated facts \u2014 use "forget" instead.\n- DO NOT use to query memory \u2014 use "recall" or "context" instead.\n\nCONTRADICTION & RETURN BEHAVIOR:\n- Evaluates semantic opposition. If a contradiction is detected, a warning is returned and recorded in the audit log while persisting the fact.\n- Returns JSON containing { ok: true, entity, domain, tier, observationIds, contradictionWarnings }.',
    {
      entity: z.string().min(1).describe('Entity name (e.g. "React Architecture", "Sabil Murti")'),
      facts: z.array(z.string().min(1)).min(1).describe("List of facts/observations to remember"),
      type: z.string().optional().describe('Entity type (default: "concept")'),
      domain: z.string().optional().describe('Domain namespace (default: "personal")'),
      tier: z.enum(["invariant", "architectural", "contextual", "ephemeral"]).optional().describe(
        "Authority tier: invariant (never decays), architectural (365d), contextual (90d), ephemeral (7d)"
      ),
      derived_from: z.array(z.string()).optional().describe("Observation IDs that these facts logically depend on (for truth maintenance)")
    },
    async ({ entity, facts, type, domain, tier, derived_from }) => {
      try {
        let ent = db.getEntityByName(entity);
        if (!ent) {
          ent = db.createEntity({
            name: entity,
            entityType: type ?? "concept",
            domain: domain ?? "personal"
          });
        }
        const tierVal = tier ?? "contextual";
        const derivedArr = derived_from ?? [];
        const observationIds = [];
        const warnings = [];
        for (const fact of facts) {
          const conflict = await checkContradiction(fact, ent.id, db);
          if (conflict.hasContradiction) {
            warnings.push({
              fact,
              reason: conflict.reason || "Semantic clash with existing fact",
              conflictingId: conflict.conflictingObservation?.id
            });
          }
          const obs = db.addObservation(
            ent.id,
            fact,
            "agent",
            "normal",
            1,
            void 0,
            tierVal,
            derivedArr
          );
          observationIds.push(obs.id);
          if (conflict.hasContradiction && conflict.conflictingObservation) {
            db.recordContradiction(
              obs.id,
              conflict.conflictingObservation.id,
              ent.id,
              conflict.reason || "Polar opposition"
            );
          }
        }
        graph.triggerAutoExport(ent.name);
        return textContent({
          ok: true,
          entity: ent.name,
          domain: ent.domain,
          tier: tierVal,
          observationIds,
          contradictionWarnings: warnings.length > 0 ? warnings : void 0
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to remember facts"
        });
      }
    }
  );
  server.tool(
    "recall",
    'Search memory observations and facts matching keywords or concepts using SQLite FTS5 BM25. Enforces a strict token budget to prevent context window overflow.\n\nWHEN TO USE:\n- Use "recall" for focused keyword search, retrieving specific past facts, or when under a strict token budget.\n- DO NOT use for exploring structural, multi-hop entity relationships \u2014 use "context" instead.\n\nRETURNS:\n- JSON object containing matched entities, facts with authority tiers and statuses, estimated tokens used, and truncation flag.',
    {
      query: z.string().min(1).describe("Query text to search across facts and entities"),
      token_budget: z.number().int().positive().optional().describe("Maximum tokens to return (default: 2000)"),
      domain: z.string().optional().describe("Filter by domain"),
      depth: z.number().int().min(0).max(3).optional().describe("Graph expansion depth (0 = flat search, 1+ = multi-hop GraphRAG)")
    },
    async ({ query, token_budget = 2e3, domain, depth = 0 }) => {
      try {
        const rawResults = await db.searchHybrid(query, { limit: 20, domain });
        const filtered = domain ? rawResults.filter((r) => r.entity.domain === domain) : rawResults;
        const results = [];
        let currentTokens = 0;
        let truncated = false;
        for (const item of filtered) {
          db.recordAccess(item.entity.id);
          const facts = [];
          for (const obs of item.observations) {
            db.recordAccess(item.entity.id, obs.id);
            const factSummary = `${obs.content} (${obs.authorityTier})`;
            const est = estimateTokens(factSummary);
            if (currentTokens + est > token_budget) {
              truncated = true;
              break;
            }
            currentTokens += est;
            facts.push({
              id: obs.id,
              content: obs.content,
              tier: obs.authorityTier,
              status: obs.status
            });
          }
          if (facts.length > 0) {
            results.push({
              entity: item.entity.name,
              domain: item.entity.domain,
              type: item.entity.entityType,
              facts
            });
          }
          if (truncated) break;
        }
        let relationalContext;
        if (depth > 0 && currentTokens < token_budget) {
          const contextStr = graph.getContext(query, depth, 5, domain);
          const ctxTokens = estimateTokens(contextStr);
          if (currentTokens + ctxTokens <= token_budget) {
            relationalContext = contextStr;
            currentTokens += ctxTokens;
          }
        }
        return textContent({
          ok: true,
          query,
          tokensEstimated: currentTokens,
          tokenBudget: token_budget,
          truncated,
          results,
          relationalContext
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to recall memory"
        });
      }
    }
  );
  server.tool(
    "forget",
    'Invalidate or permanently remove an entity or a specific observation UUID. Supports soft invalidation, hard permanent deletion, and automatic cascading invalidation of dependent facts.\n\nWHEN TO USE:\n- Use "forget" when a fact is superseded, contradicted, or deprecated.\n- Prefers soft invalidation (hard=false) to preserve audit trails. Use hard=true only when permanently expunging sensitive data.\n- DO NOT use to update a fact with new info \u2014 use "remember" with updated content.\n\nPERMISSIONS & FAILURE BEHAVIOR:\n- Operates locally on SQLite storage. Returns an error if the target entity name or UUID is not found in the database.\n- Returns JSON containing { ok: true, type, targetId/entity, mode, cascadedStaleCount }.',
    {
      target: z.string().min(1).describe("Entity name OR observation UUID to forget"),
      hard: z.boolean().optional().describe("true = permanent delete from database; false = mark invalidated (default)"),
      cascade: z.boolean().optional().describe("true = also invalidate facts derived from this target (default: true)")
    },
    async ({ target, hard = false, cascade = true }) => {
      try {
        const obs = db.getObservationById(target);
        if (obs) {
          let staleCount = 0;
          if (cascade) {
            const cascadeRes = db.cascadeInvalidate(obs.id);
            staleCount = cascadeRes.staleIds.length;
          }
          if (hard) {
            db.deleteObservation(obs.id);
          } else {
            db.setObservationStatus(obs.id, "invalidated");
          }
          const obsEntity = db.getEntityById(obs.entityId);
          graph.triggerAutoExport(obsEntity?.name);
          return textContent({
            ok: true,
            type: "observation",
            targetId: obs.id,
            mode: hard ? "hard_delete" : "invalidated",
            cascadedStaleCount: staleCount
          });
        }
        const ent = db.getEntityByName(target);
        if (ent) {
          const obsList = db.getObservationsByEntity(ent.id);
          let staleCount = 0;
          for (const o of obsList) {
            if (cascade) {
              const cascadeRes = db.cascadeInvalidate(o.id);
              staleCount += cascadeRes.staleIds.length;
            }
            if (!hard) {
              db.setObservationStatus(o.id, "invalidated");
            }
          }
          if (hard) {
            graph.deleteEntities([ent.name]);
          } else {
            graph.triggerAutoExport(ent.name);
          }
          return textContent({
            ok: true,
            type: "entity",
            entity: ent.name,
            observationsAffected: obsList.length,
            mode: hard ? "hard_delete" : "invalidated",
            cascadedStaleCount: staleCount
          });
        }
        return textContent({
          ok: false,
          error: `Target not found: "${target}" is neither an existing entity name nor a known observation ID.`
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to forget target"
        });
      }
    }
  );
  server.tool(
    "context",
    'Traverse the knowledge graph starting from query seed entities outward up to N hops using GraphRAG relational discovery.\n\nWHEN TO USE:\n- Use "context" when you need holistic, multi-hop relational knowledge around an entity (e.g. architecture, connections, dependencies).\n- DO NOT use for simple keyword search or strict token-budget lookups \u2014 use "recall" instead.\n\nRETURNS:\n- Formatted relational Markdown document detailing seed entities, their attributes, active observations, and outward relation links.',
    {
      query: z.string().min(1).describe("Search query for starting seeds"),
      depth: z.number().int().min(0).max(4).optional().describe("Traversal depth (default: 1)"),
      limit: z.number().int().positive().max(20).optional().describe("Maximum seed entities (default: 5)"),
      domain: z.string().optional().describe("Optional domain filter")
    },
    async ({ query, depth = 1, limit = 5, domain }) => {
      try {
        const text = graph.getContext(query, depth, limit, domain);
        return textContent(text);
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to retrieve context"
        });
      }
    }
  );
  server.tool(
    "remember_media",
    'Ingest an immutable media asset (image, audio, video, PDF, document) into Content-Addressable Storage (CAS) with SHA-256 deduplication. Automatically creates an entity representing the media, records descriptive observations about what the media depicts or contains, evaluates pre-insertion contradiction detection, establishes semantic relations to other entities, and synchronizes to dual-write Markdown.\n\nWHEN TO USE:\n- Use "remember_media" when you have a local media file (screenshot, photo, voice note, document, diagram) and want to attach structured knowledge, descriptions, or relationships to it.\n- Amneshia handles storage, hashing, and relations deterministically with ZERO LLM overhead.\n- To query media facts later, use "recall" or "context".\n\nRETURNS:\n- JSON containing { ok: true, entity, media: { sha256, mimeType, fileName, fileSize, relativePath, deduplicated }, observationIds, relations, contradictionWarnings }.',
    {
      filePath: z.string().min(1).describe("Absolute or workspace-relative path to the source media file on disk"),
      entity: z.string().min(1).describe('Entity name representing this media item (e.g. "Sabil Murti Profile Picture", "Architecture Diagram v3")'),
      domain: z.string().optional().describe('Domain namespace (default: "personal")'),
      facts: z.array(z.string().min(1)).min(1).describe("Factual observations describing the media content, context, or visual elements"),
      tier: z.enum(["invariant", "architectural", "contextual", "ephemeral"]).optional().describe("Authority tier for attached observations: invariant, architectural, contextual, ephemeral"),
      relations: z.array(
        z.object({
          to: z.string().min(1).describe("Target entity name to relate to"),
          relationType: z.string().min(1).describe('Directed relationship type (e.g. "depicts", "belongs_to", "references")')
        })
      ).optional().describe("Semantic relationships linking this media entity to other entities")
    },
    async ({ filePath, entity, domain, facts, tier, relations }) => {
      try {
        const resolvedPath = path8.isAbsolute(filePath) ? filePath : path8.resolve(process.cwd(), filePath);
        const storageRoot = graph.getStorageRoot ? graph.getStorageRoot() : db.getDataDir();
        const stored = await storeMediaAsset(resolvedPath, storageRoot);
        let ent = db.getEntityByName(entity);
        if (!ent) {
          ent = db.createEntity({
            name: entity,
            entityType: "media",
            domain: domain ?? "personal"
          });
        }
        let mediaAsset = db.getMediaByEntity(ent.id);
        if (!mediaAsset) {
          mediaAsset = db.createMediaAsset({
            entityId: ent.id,
            sha256: stored.sha256,
            mimeType: stored.mimeType,
            fileName: stored.fileName,
            fileSize: stored.fileSize,
            relativePath: stored.relativePath
          });
        } else if (mediaAsset.sha256 !== stored.sha256) {
          db.deleteMediaByEntity(ent.id);
          mediaAsset = db.createMediaAsset({
            entityId: ent.id,
            sha256: stored.sha256,
            mimeType: stored.mimeType,
            fileName: stored.fileName,
            fileSize: stored.fileSize,
            relativePath: stored.relativePath
          });
        }
        const tierVal = tier ?? "contextual";
        const observationIds = [];
        const warnings = [];
        for (const fact of facts) {
          const conflict = await checkContradiction(fact, ent.id, db);
          if (conflict.hasContradiction) {
            warnings.push({
              fact,
              reason: conflict.reason || "Semantic clash with existing fact",
              conflictingId: conflict.conflictingObservation?.id
            });
          }
          const obs = db.addObservation(
            ent.id,
            fact,
            "media-ingest",
            "normal",
            1,
            void 0,
            tierVal
          );
          observationIds.push(obs.id);
          if (conflict.hasContradiction && conflict.conflictingObservation) {
            db.recordContradiction(
              obs.id,
              conflict.conflictingObservation.id,
              ent.id,
              conflict.reason || "Polar opposition"
            );
          }
        }
        const relationsCreated = [];
        if (relations && relations.length > 0) {
          for (const rel of relations) {
            const targetEnt = db.getEntityByName(rel.to);
            if (targetEnt) {
              db.createRelation(ent.id, targetEnt.id, rel.relationType);
              relationsCreated.push({ to: targetEnt.name, relationType: rel.relationType });
            }
          }
        }
        graph.triggerAutoExport(ent.name);
        return textContent({
          ok: true,
          entity: ent.name,
          domain: ent.domain,
          media: {
            id: mediaAsset.id,
            sha256: mediaAsset.sha256,
            mimeType: mediaAsset.mimeType,
            fileName: mediaAsset.fileName,
            fileSize: mediaAsset.fileSize,
            relativePath: mediaAsset.relativePath,
            deduplicated: stored.deduplicated
          },
          observationIds,
          relations: relationsCreated,
          contradictionWarnings: warnings.length > 0 ? warnings : void 0
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to remember media"
        });
      }
    }
  );
  server.tool(
    "status",
    'Get high-level summary statistics of the knowledge graph including entity counts, active observations, authority tiers, and open contradictions.\n\nWHEN TO USE:\n- Use "status" to verify memory health, inspect total nodes, or get an architectural overview.\n- Returns JSON with entity counts, observation breakdown by status and tier, and system metrics.',
    {},
    async () => {
      try {
        const stats = graph.getStats();
        const dualWrite = graph.getDualWriteSync();
        const cloud = dualWrite ? await getCloudStatus(dualWrite.getKnowledgeDir()) : null;
        return textContent({
          ok: true,
          stats,
          cloudStatus: cloud
        });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to retrieve graph status"
        });
      }
    }
  );
  server.tool(
    "reindex",
    'Rebuild the SQLite database, FTS5 full-text index, and relational links from the human-readable Markdown directory.\n\nWHEN TO USE:\n- Use "reindex" when Markdown knowledge files were modified externally, pulled from Git, or during disaster recovery.',
    {},
    async () => {
      try {
        const dualWrite = graph.getDualWriteSync();
        if (!dualWrite) {
          return textContent({ ok: false, error: "Dual-write markdown storage is not active in this session." });
        }
        const result = dualWrite.reindex();
        return textContent({ ok: true, result });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to reindex from markdown"
        });
      }
    }
  );
  server.tool(
    "sync",
    'Perform synchronization with Git remote cloud repository or force markdown dual-write export.\n\nWHEN TO USE:\n- Use "sync" to pull or push memories across devices via Git-native sync.\n- Options: "sync" (bidirectional), "pull", "push", or "status".',
    {
      action: z.enum(["status", "push", "pull", "sync"]).optional().describe('Sync operation: "sync" (bidirectional), "pull", "push", or "status" (default: "sync")'),
      message: z.string().optional().describe("Optional Git commit message when pushing")
    },
    async ({ action = "sync", message }) => {
      try {
        const dualWrite = graph.getDualWriteSync();
        if (!dualWrite) {
          return textContent({ ok: false, error: "Dual-write storage is not initialized." });
        }
        const knowledgeDir = dualWrite.getKnowledgeDir();
        if (action === "status") {
          const status = await getCloudStatus(knowledgeDir);
          return textContent({ ok: true, status });
        }
        if (action === "pull") {
          const pullRes = await cloudPull(knowledgeDir, db);
          return textContent({ ok: true, pull: pullRes });
        }
        if (action === "push") {
          const pushRes = await cloudPush(knowledgeDir, message);
          return textContent({ ok: true, push: pushRes });
        }
        const syncRes = await cloudSync(knowledgeDir, db, message);
        return textContent({ ok: true, sync: syncRes });
      } catch (error) {
        return textContent({
          ok: false,
          error: error instanceof Error ? error.message : "Sync operation failed"
        });
      }
    }
  );
}

// src/tools/entities.ts
import { z as z2 } from "zod";
var entitySchema = {
  entities: z2.array(
    z2.object({
      name: z2.string().min(1).describe("Unique human-readable entity name"),
      entityType: z2.string().min(1).describe("Entity type such as person, tool, project, preference, concept, or skill"),
      domain: z2.string().optional().describe("Domain scope such as personal or project:<name>"),
      visibility: z2.enum(["public", "restricted", "private"]).optional().describe("Access level for the entity"),
      allowedAgents: z2.array(z2.string().min(1)).optional().describe("Explicit agent whitelist; empty means all agents")
    })
  ).min(1).describe("Entities to create")
};
function textContent2(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerEntityTools(server, graph) {
  server.tool(
    "create_entities",
    "Create one or more entities in the knowledge graph. Use this when introducing a new person, tool, project, preference, concept, or skill that should have its own node and future observations/relations.",
    entitySchema,
    async ({ entities }) => {
      try {
        const created = graph.createEntities(entities);
        return textContent2({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent2({ ok: false, error: error instanceof Error ? error.message : "Failed to create entities" });
      }
    }
  );
  server.tool(
    "delete_entities",
    "Delete entities by name. This removes the entity node and cascades to its attached observations and relations. Use with care when a memory branch is obsolete or incorrect.",
    {
      names: z2.array(z2.string().min(1)).min(1).describe("Entity names to delete")
    },
    async ({ names }) => {
      try {
        const deleted = graph.deleteEntities(names);
        return textContent2({ ok: true, deleted, requested: names.length });
      } catch (error) {
        return textContent2({ ok: false, error: error instanceof Error ? error.message : "Failed to delete entities" });
      }
    }
  );
}

// src/tools/relations.ts
import { z as z3 } from "zod";
var relationSchema = {
  relations: z3.array(
    z3.object({
      from: z3.string().min(1).describe("Source entity name"),
      to: z3.string().min(1).describe("Target entity name"),
      relationType: z3.string().min(1).describe("Relation type such as uses, prefers, works_on, knows, or depends_on")
    })
  ).min(1).describe("Relations to create")
};
function textContent3(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerRelationTools(server, graph) {
  server.tool(
    "create_relations",
    "Create one or more typed edges between existing entities. Use this when you want the graph to capture how people, tools, projects, and concepts connect.",
    relationSchema,
    async ({ relations }) => {
      try {
        const created = graph.createRelations(relations);
        return textContent3({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent3({ ok: false, error: error instanceof Error ? error.message : "Failed to create relations" });
      }
    }
  );
  server.tool(
    "delete_relations",
    "Delete relations by relation ID. Use this to remove stale or incorrect edges without touching the connected entities.",
    {
      ids: z3.array(z3.string().min(1)).min(1).describe("Relation IDs to delete")
    },
    async ({ ids }) => {
      try {
        const deleted = graph.deleteRelations(ids);
        return textContent3({ ok: true, deleted, requested: ids.length });
      } catch (error) {
        return textContent3({ ok: false, error: error instanceof Error ? error.message : "Failed to delete relations" });
      }
    }
  );
}

// src/tools/observations.ts
import { z as z4 } from "zod";
var observationSchema = {
  observations: z4.array(
    z4.object({
      entityName: z4.string().min(1).describe("Entity name to attach the observations to"),
      contents: z4.array(z4.string().min(1)).min(1).describe("Observation texts to add"),
      source: z4.string().optional().describe("Agent or system that supplied the observation"),
      importance: z4.enum(["permanent", "normal", "ephemeral"]).optional().describe("Retention tier for the observation"),
      authorityTier: z4.enum(["invariant", "architectural", "contextual", "ephemeral"]).optional().describe("Authority tier: invariant, architectural, contextual, ephemeral"),
      derivedFrom: z4.array(z4.string()).optional().describe("IDs of observations this depends on"),
      expiresAt: z4.string().datetime({ offset: true }).optional().describe("ISO 8601 expiration timestamp for ephemeral facts")
    })
  ).min(1).describe("Observation batches to store")
};
function textContent4(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerObservationTools(server, graph) {
  server.tool(
    "add_observations",
    "Add one or more observations to existing entities with optional authority tier and provenance dependency tracking.",
    observationSchema,
    async ({ observations }) => {
      try {
        const created = await graph.addObservations(observations);
        return textContent4({ ok: true, created, count: created.length });
      } catch (error) {
        return textContent4({ ok: false, error: error instanceof Error ? error.message : "Failed to add observations" });
      }
    }
  );
  server.tool(
    "delete_observations",
    "Delete specific observations by ID.",
    {
      ids: z4.array(z4.string().min(1)).min(1).describe("Observation IDs to delete")
    },
    async ({ ids }) => {
      try {
        const deleted = graph.deleteObservations(ids);
        return textContent4({ ok: true, deleted, requested: ids.length });
      } catch (error) {
        return textContent4({ ok: false, error: error instanceof Error ? error.message : "Failed to delete observations" });
      }
    }
  );
  server.tool(
    "update_observation",
    "Update an existing observation while recording previous content in history, updating status, or triggering cascade invalidation.",
    {
      observationId: z4.string().min(1).describe("Observation ID to update"),
      newContent: z4.string().min(1).describe("Replacement content"),
      changedBy: z4.string().optional().describe("Optional agent or actor making the change"),
      authorityTier: z4.enum(["invariant", "architectural", "contextual", "ephemeral"]).optional(),
      status: z4.enum(["active", "stale", "invalidated", "superseded", "decayed"]).optional()
    },
    async ({ observationId, newContent, changedBy, authorityTier, status }) => {
      try {
        const updated = graph.updateObservation({
          observationId,
          newContent,
          changedBy,
          authorityTier,
          status
        });
        return textContent4({ ok: true, updated });
      } catch (error) {
        return textContent4({ ok: false, error: error instanceof Error ? error.message : "Failed to update observation" });
      }
    }
  );
}

// src/tools/search.ts
import { z as z5 } from "zod";
function textContent5(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerSearchTools(server, graph) {
  server.tool(
    "search_memory",
    "Search the memory graph using SQLite FTS5 with BM25 ranking. Use this when you know part of a name, fact, or observation text and want the most relevant entities and observations.",
    {
      query: z5.string().min(1).describe("Search text to match against entity names, types, and observation content"),
      limit: z5.number().int().positive().max(100).optional().describe("Maximum number of ranked results to return"),
      domain: z5.string().optional().describe("Optional domain filter such as personal or project:<name>")
    },
    async ({ query, limit, domain }) => {
      try {
        const result = graph.searchMemory(query, limit ?? 20, domain);
        return textContent5({ ok: true, ...result });
      } catch (error) {
        return textContent5({ ok: false, error: error instanceof Error ? error.message : "Failed to search memory" });
      }
    }
  );
  server.tool(
    "search_relevant_memory",
    "Search the memory graph with stop words (e.g. yang, di, ke, the, of, in) filtered out to optimize token efficiency and retrieval precision. Use this when querying user profiles or project preferences using a natural language prompt.",
    {
      query: z5.string().min(1).describe("Search text prompt to filter and match against memory"),
      limit: z5.number().int().positive().max(100).optional().describe("Maximum number of ranked results to return"),
      domain: z5.string().optional().describe("Optional domain filter such as personal or project:<name>")
    },
    async ({ query, limit, domain }) => {
      try {
        const result = graph.searchRelevantMemory(query, limit ?? 20, domain);
        return textContent5({ ok: true, ...result });
      } catch (error) {
        return textContent5({ ok: false, error: error instanceof Error ? error.message : "Failed to search memory" });
      }
    }
  );
  server.tool(
    "read_graph",
    "Read the complete knowledge graph or a filtered slice of it. Use this when you need structured entities, their observations, and their relations rather than a ranked search result.",
    {
      domain: z5.string().optional().describe("Optional domain filter such as personal or project:<name>"),
      entityType: z5.string().optional().describe("Optional entity type filter such as person, tool, or project")
    },
    async ({ domain, entityType }) => {
      try {
        const snapshot = graph.readGraph(domain, entityType);
        return textContent5({ ok: true, snapshot });
      } catch (error) {
        return textContent5({ ok: false, error: error instanceof Error ? error.message : "Failed to read graph" });
      }
    }
  );
  server.tool(
    "open_nodes",
    "Open a set of entity names and return each matching node with its full observations and relations. Use this when you already know the entities you want to inspect.",
    {
      names: z5.array(z5.string().min(1)).min(1).describe("Entity names to open")
    },
    async ({ names }) => {
      try {
        const snapshot = graph.openNodes(names);
        return textContent5({ ok: true, snapshot });
      } catch (error) {
        return textContent5({ ok: false, error: error instanceof Error ? error.message : "Failed to open nodes" });
      }
    }
  );
  server.tool(
    "get_context",
    "GraphRAG multi-hop context engine. Provide a query to find seeds via FTS5 BM25, then traverse the graph outwards (BFS) by N levels to collect full relational context into a compressed markdown string. Fast and eliminates round-trips.",
    {
      query: z5.string().min(1).describe("Search query for starting seeds"),
      depth: z5.number().int().min(0).max(5).optional().describe("Graph traversal depth (0 = seeds only, 1 = immediate neighbors)"),
      limit: z5.number().int().positive().max(50).optional().describe("Maximum number of starting seed entities to match"),
      domain: z5.string().optional().describe("Optional domain filter such as personal or project:<name>")
    },
    async ({ query, depth, limit, domain }) => {
      try {
        const context = graph.getContext(query, depth ?? 1, limit ?? 5, domain);
        return textContent5(context);
      } catch (error) {
        return textContent5({ ok: false, error: error instanceof Error ? error.message : "Failed to get context" });
      }
    }
  );
}

// src/tools/lifecycle.ts
import { z as z6 } from "zod";

// src/maintenance/dedup.ts
function getJaccardSimilarity(s1, s2) {
  const words1 = new Set(s1.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
  const words2 = new Set(s2.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = /* @__PURE__ */ new Set([...words1, ...words2]);
  return intersection.size / union.size;
}
function findDuplicates(observations, threshold) {
  const simThreshold = threshold ?? (process.env.AMNESHIA_DEDUP_THRESHOLD ? parseFloat(process.env.AMNESHIA_DEDUP_THRESHOLD) : 0.8);
  const duplicates = [];
  const supersededIds = /* @__PURE__ */ new Set();
  const byTier = /* @__PURE__ */ new Map();
  for (const obs of observations) {
    if (obs.status !== "active") continue;
    const tier = obs.authorityTier || "contextual";
    const list = byTier.get(tier) ?? [];
    list.push(obs);
    byTier.set(tier, list);
  }
  for (const [_tier, tierObs] of byTier.entries()) {
    for (let i = 0; i < tierObs.length; i++) {
      for (let j = i + 1; j < tierObs.length; j++) {
        const obs1 = tierObs[i];
        const obs2 = tierObs[j];
        if (supersededIds.has(obs1.id) || supersededIds.has(obs2.id)) {
          continue;
        }
        const isExact = obs1.content.toLowerCase().trim() === obs2.content.toLowerCase().trim();
        const sim = isExact ? 1 : getJaccardSimilarity(obs1.content, obs2.content);
        if (isExact || sim >= simThreshold) {
          const older = new Date(obs1.createdAt).getTime() <= new Date(obs2.createdAt).getTime() ? obs1 : obs2;
          const newer = older === obs1 ? obs2 : obs1;
          duplicates.push({
            older,
            newer,
            similarity: sim,
            reason: isExact ? "Exact match duplicate" : `Jaccard similarity ${(sim * 100).toFixed(0)}% >= ${(simThreshold * 100).toFixed(0)}%`
          });
          supersededIds.add(older.id);
        }
      }
    }
  }
  return duplicates;
}

// src/maintenance/decay.ts
var TIER_WEIGHTS = {
  invariant: 1,
  architectural: 0.8,
  contextual: 0.5,
  ephemeral: 0.2
};
var TIER_MAX_INACTIVE_DAYS = {
  invariant: Infinity,
  architectural: 365,
  contextual: 90,
  ephemeral: 7
};
function computeDecayScore(obs, nowMs = Date.now()) {
  if (obs.authorityTier === "invariant") {
    return 1;
  }
  if (obs.expiresAt && new Date(obs.expiresAt).getTime() <= nowMs) {
    return 0;
  }
  const tierWeight = TIER_WEIGHTS[obs.authorityTier] ?? 0.5;
  const maxDays = TIER_MAX_INACTIVE_DAYS[obs.authorityTier] ?? 90;
  const lastActivity = obs.lastAccessedAt ? new Date(obs.lastAccessedAt).getTime() : new Date(obs.createdAt).getTime();
  const daysInactive = Math.max(0, (nowMs - lastActivity) / (1e3 * 60 * 60 * 24));
  if (daysInactive >= maxDays) {
    return 0;
  }
  const recencyFactor = Math.max(0, 1 - daysInactive / maxDays);
  const frequencyFactor = 1 + Math.log10((obs.accessCount || 0) + 1);
  return tierWeight * frequencyFactor * recencyFactor;
}
function evaluateDecay(observations, threshold = 0.1, nowMs = Date.now()) {
  const decayed = [];
  const retained = [];
  for (const obs of observations) {
    if (obs.status !== "active") {
      continue;
    }
    if (obs.authorityTier === "invariant") {
      retained.push(obs);
      continue;
    }
    const score = computeDecayScore(obs, nowMs);
    if (score < threshold) {
      decayed.push(obs);
    } else {
      retained.push(obs);
    }
  }
  return { decayed, retained };
}
function applyDecay(db, threshold = 0.1, nowMs = Date.now()) {
  const snapshot = db.readGraph();
  const decayedIds = [];
  for (const entity of snapshot.entities) {
    const { decayed } = evaluateDecay(entity.observations, threshold, nowMs);
    for (const obs of decayed) {
      db.setObservationStatus(obs.id, "decayed");
      decayedIds.push(obs.id);
    }
  }
  return {
    decayedCount: decayedIds.length,
    decayedIds
  };
}

// src/maintenance/index.ts
function runMaintenance(graph, db, domain, dryRun = false) {
  const purgedCount = dryRun ? 0 : graph.cleanupExpired();
  const decayResult = dryRun ? { decayedCount: 0, decayedIds: [] } : applyDecay(db);
  const snapshot = graph.readGraph(domain);
  const entities = snapshot.entities;
  let supersededCount = 0;
  const supersededList = [];
  for (const entity of entities) {
    const activeObs = db.getObservationsByEntity(entity.id, true);
    if (activeObs.length < 2) continue;
    const duplicates = findDuplicates(activeObs);
    for (const dup of duplicates) {
      if (!dryRun) {
        db.setSupersedes(dup.older.id, dup.newer.id, "maintenance_dedup");
        db.cascadeInvalidate(dup.older.id);
      }
      supersededList.push({
        oldId: dup.older.id,
        newId: dup.newer.id,
        reason: dup.reason,
        oldContent: dup.older.content,
        newContent: dup.newer.content
      });
      supersededCount++;
    }
  }
  return {
    purgedCount,
    decayedCount: decayResult.decayedCount,
    supersededCount,
    details: {
      purged: [],
      decayed: decayResult.decayedIds,
      superseded: supersededList
    }
  };
}

// src/tools/lifecycle.ts
function textContent6(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerLifecycleTools(server, graph, db) {
  server.tool(
    "cleanup_expired",
    "Remove expired ephemeral observations from the database. Use this as a maintenance tool when you want to prune timed memories that have passed their expiry date.",
    {},
    async () => {
      try {
        const removed = graph.cleanupExpired();
        return textContent6({ ok: true, removed });
      } catch (error) {
        return textContent6({ ok: false, error: error instanceof Error ? error.message : "Failed to cleanup expired observations" });
      }
    }
  );
  server.tool(
    "get_stats",
    "Inspect the current memory store health and usage. Use this when you want counts by entity type and domain, recent activity, or to confirm the database is being populated as expected.",
    {},
    async () => {
      try {
        const stats = graph.getStats();
        return textContent6({ ok: true, stats });
      } catch (error) {
        return textContent6({ ok: false, error: error instanceof Error ? error.message : "Failed to get stats" });
      }
    }
  );
  server.tool(
    "consolidate_memory",
    "Execute deterministic memory maintenance: purges expired ephemeral items, recalculates authority-tier value decay, and deduplicates identical or near-duplicate facts.",
    {
      domain: z6.string().optional().describe("Filter maintenance to a specific domain (e.g. personal, work)")
    },
    async ({ domain }) => {
      try {
        const result = runMaintenance(graph, db, domain);
        return textContent6({ ok: true, result });
      } catch (error) {
        return textContent6({ ok: false, error: error instanceof Error ? error.message : "Failed to run memory maintenance" });
      }
    }
  );
}

// src/tools/utility.ts
import { z as z7 } from "zod";
function textContent7(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
function registerUtilityTools(server, graph) {
  server.tool(
    "export_memory",
    "Export the entire memory graph to markdown files for every configured export target. Use this to create human-readable snapshots or sync memory to an external file path.",
    {},
    async () => {
      try {
        const writes = exportToMarkdown(graph);
        return textContent7({ ok: true, exported: writes.length, writes });
      } catch (error) {
        return textContent7({ ok: false, error: error instanceof Error ? error.message : "Failed to export memory" });
      }
    }
  );
  server.tool(
    "manage_export_targets",
    "Manage export destinations for markdown snapshots. Use list to inspect targets, add to register a new destination, or remove to delete one by id.",
    {
      action: z7.enum(["list", "add", "remove"]).describe("Action to perform on export targets"),
      name: z7.string().optional().describe("Target name when adding a destination"),
      path: z7.string().optional().describe("Filesystem path when adding a destination"),
      format: z7.enum(["markdown", "json"]).optional().describe("Target format when adding a destination"),
      id: z7.string().optional().describe("Export target id when removing a destination")
    },
    async ({ action, name, path: path15, format, id }) => {
      try {
        const result = graph.manageExportTargets({ action, name, path: path15, format, id });
        return textContent7({ ok: true, result });
      } catch (error) {
        return textContent7({ ok: false, error: error instanceof Error ? error.message : "Failed to manage export targets" });
      }
    }
  );
}

// src/tools/index.ts
function registerTools(server, graph, db, profile = "full") {
  registerCoreTools(server, graph, db);
  if (profile === "full") {
    registerEntityTools(server, graph);
    registerRelationTools(server, graph);
    registerObservationTools(server, graph);
    registerSearchTools(server, graph);
    registerLifecycleTools(server, graph, db);
    registerUtilityTools(server, graph);
  }
}

// src/server.ts
import path11 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/storage/index.ts
import fs9 from "fs";
import os5 from "os";
import path10 from "path";

// src/storage/adopt.ts
import fs8 from "fs";
import path9 from "path";
import os4 from "os";
async function adoptMemory(options = {}) {
  const sourceDir = path9.resolve(options.sourceDataDir ?? path9.join(os4.homedir(), ".amneshia"));
  const targetDir = path9.resolve(options.targetDataDir ?? path9.join(process.cwd(), ".amneshia"));
  const dryRun = options.dryRun ?? false;
  const isMove = options.move ?? false;
  if (!fs8.existsSync(sourceDir)) {
    throw new Error(`Source Amneshia directory not found: ${sourceDir}`);
  }
  if (!dryRun) {
    fs8.mkdirSync(path9.join(targetDir, "knowledge"), { recursive: true });
  }
  const sourceDb = new DatabaseLayer(sourceDir);
  const targetDb = dryRun ? null : new DatabaseLayer(targetDir);
  const targetDualWrite = dryRun ? null : new DualWriteSync(path9.join(targetDir, "knowledge"), targetDb);
  try {
    const sourceSnapshot = sourceDb.readGraph(options.domain);
    const targetEntitiesFilter = options.entities?.map((e) => e.trim().toLowerCase());
    const result = {
      dryRun,
      sourceDir,
      targetDir,
      entitiesAdopted: [],
      observationsAdopted: 0,
      relationsAdopted: 0,
      skippedDuplicates: 0,
      contradictionWarnings: []
    };
    const candidates = sourceSnapshot.entities.filter((ent) => {
      if (options.all) return true;
      if (targetEntitiesFilter && targetEntitiesFilter.length > 0) {
        return targetEntitiesFilter.includes(ent.name.toLowerCase());
      }
      if (options.domain) {
        return ent.domain.toLowerCase() === options.domain.toLowerCase();
      }
      return false;
    });
    if (candidates.length === 0) {
      return result;
    }
    const adoptedEntityIds = /* @__PURE__ */ new Set();
    const entityIdMap = /* @__PURE__ */ new Map();
    for (const sourceEntity of candidates) {
      let targetEntity = null;
      if (!dryRun) {
        targetEntity = targetDb.getEntityByName(sourceEntity.name);
        if (!targetEntity) {
          targetEntity = targetDb.createEntity({
            name: sourceEntity.name,
            entityType: sourceEntity.entityType,
            domain: sourceEntity.domain,
            visibility: sourceEntity.visibility,
            allowedAgents: sourceEntity.allowedAgents
          });
        }
        entityIdMap.set(sourceEntity.id, targetEntity.id);
      } else {
        entityIdMap.set(sourceEntity.id, sourceEntity.id);
      }
      result.entitiesAdopted.push(sourceEntity.name);
      adoptedEntityIds.add(sourceEntity.id);
      const existingContents = /* @__PURE__ */ new Set();
      if (!dryRun && targetEntity) {
        const existingObs = targetDb.getObservationsByEntity(targetEntity.id);
        for (const obs of existingObs) {
          existingContents.add(obs.content.trim().toLowerCase());
        }
      }
      for (const obs of sourceEntity.observations) {
        const contentKey = obs.content.trim().toLowerCase();
        if (existingContents.has(contentKey)) {
          result.skippedDuplicates++;
          continue;
        }
        if (!dryRun && targetEntity) {
          const contradiction = await checkContradiction(obs.content, targetEntity.id, targetDb);
          if (contradiction.hasContradiction) {
            result.contradictionWarnings.push({
              entity: sourceEntity.name,
              fact: obs.content,
              reason: contradiction.reason ?? "Contradiction detected against existing fact"
            });
          }
          targetDb.addObservation(
            targetEntity.id,
            obs.content,
            obs.source ?? "adopted",
            obs.importance,
            obs.confidence,
            obs.expiresAt ?? void 0,
            obs.authorityTier,
            obs.derivedFrom ?? []
          );
        }
        result.observationsAdopted++;
      }
      if (!dryRun && targetEntity) {
        targetDualWrite.syncEntity(targetEntity);
      }
    }
    const processedRelationIds = /* @__PURE__ */ new Set();
    for (const sourceEntity of candidates) {
      for (const rel of sourceEntity.relations) {
        if (adoptedEntityIds.has(rel.fromEntity) && adoptedEntityIds.has(rel.toEntity)) {
          if (processedRelationIds.has(rel.id)) continue;
          processedRelationIds.add(rel.id);
          result.relationsAdopted++;
          if (!dryRun) {
            const targetFromId = entityIdMap.get(rel.fromEntity);
            const targetToId = entityIdMap.get(rel.toEntity);
            if (targetFromId && targetToId) {
              try {
                targetDb.createRelation(targetFromId, targetToId, rel.relationType);
              } catch {
              }
            }
          }
        }
      }
    }
    if (isMove && !dryRun) {
      const sourceDualWrite = new DualWriteSync(path9.join(sourceDir, "knowledge"), sourceDb);
      for (const sourceEntity of candidates) {
        sourceDb.deleteEntity(sourceEntity.id);
        sourceDualWrite.removeEntity(sourceEntity.domain, sourceEntity.name);
      }
    }
    return result;
  } finally {
    sourceDb.close();
    if (targetDb) {
      targetDb.close();
    }
  }
}

// src/storage/index.ts
function resolveStorageConfig(forceLocal = false) {
  const cwd = process.cwd();
  const localAmneshiaDir = path10.join(cwd, ".amneshia");
  if (forceLocal || fs9.existsSync(localAmneshiaDir)) {
    return {
      mode: "local",
      dataDir: localAmneshiaDir,
      knowledgeDir: path10.join(localAmneshiaDir, "knowledge")
    };
  }
  const globalDir = path10.join(os5.homedir(), ".amneshia");
  return {
    mode: "global",
    dataDir: globalDir,
    knowledgeDir: path10.join(globalDir, "knowledge")
  };
}
function initAmneshiaProject(targetDir = process.cwd()) {
  const dataDir = path10.join(targetDir, ".amneshia");
  const knowledgeDir = path10.join(dataDir, "knowledge");
  const configPath = path10.join(dataDir, "config.yaml");
  const gitignorePath = path10.join(dataDir, ".gitignore");
  fs9.mkdirSync(knowledgeDir, { recursive: true });
  if (!fs9.existsSync(configPath)) {
    const defaultConfig = `# Amneshia v3 Project Configuration
version: "3.2.0"
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
    fs9.writeFileSync(configPath, defaultConfig, "utf-8");
  }
  if (!fs9.existsSync(gitignorePath)) {
    const defaultGitignore = `# Amneshia ephemeral SQLite cache (rebuilt automatically from knowledge/)
*.db
*.db-wal
*.db-shm
*.log
`;
    fs9.writeFileSync(gitignorePath, defaultGitignore, "utf-8");
  }
  return { dataDir, knowledgeDir };
}
var DualWriteSync = class {
  constructor(knowledgeDir, database) {
    this.knowledgeDir = knowledgeDir;
    this.database = database;
    fs9.mkdirSync(this.knowledgeDir, { recursive: true });
  }
  knowledgeDir;
  database;
  getKnowledgeDir() {
    return this.knowledgeDir;
  }
  syncEntity(entity) {
    const observations = this.database.getObservationsByEntity(entity.id);
    const relations = this.database.getRelationsByEntity(entity.id);
    const media = this.database.getMediaByEntity(entity.id);
    return saveEntityMarkdown(this.knowledgeDir, entity, observations, relations, media);
  }
  syncAll() {
    const snapshot = this.database.readGraph();
    let count = 0;
    for (const entity of snapshot.entities) {
      const media = this.database.getMediaByEntity(entity.id);
      saveEntityMarkdown(this.knowledgeDir, entity, entity.observations, entity.relations, media);
      count++;
    }
    return count;
  }
  removeEntity(domain, name) {
    return deleteEntityMarkdown(this.knowledgeDir, domain, name);
  }
  reindex() {
    return reindexFromMarkdown(this.knowledgeDir, this.database);
  }
};

// src/server.ts
async function startServer(options = {}) {
  const storageConfig = resolveStorageConfig(options.local);
  const dataDir = options.dataDir ?? storageConfig.dataDir;
  const db = new DatabaseLayer(dataDir);
  const dualWrite = new DualWriteSync(storageConfig.knowledgeDir, db);
  const graph = new KnowledgeGraph(db, dualWrite);
  const server = new McpServer({ name: "Amneshia", version: "3.2.1" });
  registerTools(server, graph, db, options.toolProfile);
  const cleanup = async () => {
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  if (options.http) {
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json());
    app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("X-XSS-Protection", "1; mode=block");
      if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
        const origin = req.headers.origin;
        if (origin) {
          try {
            const originUrl = new URL(origin);
            if (originUrl.hostname !== "localhost" && originUrl.hostname !== "127.0.0.1") {
              res.status(403).json({ error: "Forbidden cross-origin request" });
              return;
            }
          } catch {
            res.status(403).json({ error: "Invalid request origin" });
            return;
          }
        }
      }
      next();
    });
    const sseTransports = /* @__PURE__ */ new Map();
    app.get("/sse", async (req, res) => {
      const sessionId = req.query.sessionId || crypto.randomUUID();
      const transport = new SSEServerTransport(`/messages?sessionId=${sessionId}`, res);
      sseTransports.set(sessionId, transport);
      res.on("close", () => {
        sseTransports.delete(sessionId);
      });
      await server.connect(transport);
    });
    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId;
      const transport = sessionId ? sseTransports.get(sessionId) : sseTransports.values().next().value;
      if (!transport) {
        res.status(404).json({ error: "SSE session not found or inactive" });
        return;
      }
      await transport.handlePostMessage(req, res);
    });
    app.get("/health", (_req, res) => {
      res.json({ status: "ok", name: "amneshia", version: "3.2.1" });
    });
    app.get("/api/graph", (req, res) => res.json(graph.readGraph(req.query.domain)));
    app.get("/api/search", (req, res) => res.json(graph.searchMemory(req.query.q)));
    app.get("/api/stats", (req, res) => res.json(graph.getStats()));
    app.post("/api/entities", (req, res) => res.json(graph.createEntities(req.body.entities)));
    app.delete("/api/entities", (req, res) => res.json(graph.deleteEntities(req.body.names)));
    app.post("/api/observations", async (req, res) => res.json(await graph.addObservations(req.body.observations)));
    app.delete("/api/observations", (req, res) => res.json(graph.deleteObservations(req.body.ids)));
    app.put("/api/observations", (req, res) => res.json(graph.updateObservation(req.body)));
    app.post("/api/relations", (req, res) => res.json(graph.createRelations(req.body.relations)));
    app.delete("/api/relations", (req, res) => res.json(graph.deleteRelations(req.body.ids)));
    app.get("/api/exports", (req, res) => res.json(db.getExportTargets()));
    app.post("/api/exports", (req, res) => {
      const autoExportVal = req.body.autoExport !== false ? 1 : 0;
      res.json(db.addExportTarget(req.body.name, req.body.path, req.body.format, autoExportVal));
    });
    app.delete("/api/exports/:id", (req, res) => res.json(db.removeExportTarget(req.params.id)));
    app.post("/api/exports/:id/toggle", (req, res) => {
      const targets = db.getExportTargets();
      const target = targets.find((t) => t.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: "Target not found" });
        return;
      }
      const newAutoExport = !target.autoExport;
      db.updateExportTarget(req.params.id, newAutoExport);
      res.json({ id: req.params.id, autoExport: newAutoExport });
    });
    app.post("/api/cleanup", (req, res) => res.json(graph.cleanupExpired()));
    app.post("/api/gc", (_req, res) => {
      const removed = db.gc();
      const mediaPrune = db.pruneOrphanMedia(storageConfig.knowledgeDir);
      res.json({ removed, mediaPrune });
    });
    app.post("/api/reindex", (_req, res) => res.json(dualWrite.reindex()));
    app.get("/api/contradictions", (req, res) => res.json(db.getContradictions(req.query.entityId)));
    app.post("/api/contradictions/:id/resolve", (req, res) => {
      const ok = db.resolveContradiction(req.params.id, req.body.resolution);
      res.json({ ok });
    });
    app.post("/api/maintenance", (req, res) => {
      const result = runMaintenance(graph, db, req.body?.domain, req.body?.dryRun === true);
      res.json({ ok: true, result });
    });
    app.get("/api/media", (_req, res) => res.json(db.getAllMediaAssets()));
    app.get("/api/media/by-entity/:entityId", (req, res) => res.json(db.getMediaByEntity(req.params.entityId)));
    app.get("/api/media/by-hash/:sha256", (req, res) => res.json(db.getMediaByHash(req.params.sha256)));
    app.post("/api/media/prune", (_req, res) => res.json(db.pruneOrphanMedia(storageConfig.knowledgeDir)));
    app.post("/api/media/remember", async (req, res) => {
      try {
        const result = await graph.rememberMedia(req.body);
        res.json(result);
      } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
      }
    });
    const mediaDir = path11.join(storageConfig.knowledgeDir, "media");
    app.use(
      "/media",
      express.static(mediaDir, {
        setHeaders: (res) => {
          res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
          res.setHeader("X-Content-Type-Options", "nosniff");
        }
      })
    );
    const uiPath = path11.join(path11.dirname(fileURLToPath2(import.meta.url)), "../dist-ui");
    app.use(express.static(uiPath));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/media") || req.path === "/sse" || req.path === "/messages") return next();
      res.sendFile(path11.join(uiPath, "index.html"));
    });
    const port = options.port || 3457;
    const httpListener = app.listen(port, "127.0.0.1", () => {
      console.error(`[Amneshia] HTTP Dashboard running on http://127.0.0.1:${port}`);
    });
    httpListener.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`[Amneshia] Port ${options.port || 3457} is already in use by another active instance.`);
      } else {
        console.error(`[Amneshia] Express server error: ${err.message}`);
      }
    });
  }
  if (options.stdio !== false && !process.argv.includes("--daemon")) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Amneshia] MCP Server running on stdio");
  }
}

// src/export/exporter.ts
import fs10 from "fs";
import path12 from "path";
import os6 from "os";
import Database2 from "better-sqlite3";
function filterMemoryGraph(db, filters) {
  const snapshot = db.readGraph(filters.domain);
  const targetEntities = filters.entities?.map((e) => e.trim().toLowerCase());
  const allowedTiers = filters.tiers ? new Set(filters.tiers) : null;
  const allowedStatuses = filters.statuses ? new Set(filters.statuses) : null;
  let matchingEntityIds = null;
  let matchingObsIds = null;
  if (filters.query && filters.query.trim().length > 0) {
    const ftsResults = db.searchFTSRelevant(filters.query, 1e3);
    matchingEntityIds = /* @__PURE__ */ new Set();
    matchingObsIds = /* @__PURE__ */ new Set();
    for (const res of ftsResults) {
      matchingEntityIds.add(res.entity.id);
      for (const obs of res.observations) {
        matchingObsIds.add(obs.id);
      }
    }
  }
  const result = [];
  for (const ent of snapshot.entities) {
    if (targetEntities && targetEntities.length > 0) {
      if (!targetEntities.includes(ent.name.toLowerCase())) {
        continue;
      }
    }
    if (matchingEntityIds && !matchingEntityIds.has(ent.id)) {
      continue;
    }
    const filteredObs = ent.observations.filter((obs) => {
      if (allowedTiers && !allowedTiers.has(obs.authorityTier)) {
        return false;
      }
      if (allowedStatuses && !allowedStatuses.has(obs.status)) {
        return false;
      }
      if (matchingObsIds && !matchingObsIds.has(obs.id)) {
        return false;
      }
      return true;
    });
    if (filters.query && filteredObs.length === 0 && (!matchingEntityIds || !matchingEntityIds.has(ent.id))) {
      continue;
    }
    const media = db.getMediaByEntity(ent.id);
    result.push({
      ...ent,
      observations: filteredObs,
      relations: ent.relations ?? [],
      media
    });
  }
  return result;
}
var MemoryExporter = class {
  constructor(db) {
    this.db = db;
  }
  db;
  /**
   * Export memory graph based on format and output destination.
   */
  async export(format, outputPath, filters = {}) {
    const resolvedPath = path12.resolve(outputPath);
    const filteredData = filterMemoryGraph(this.db, filters);
    let totalObs = 0;
    const uniqueRelIds = /* @__PURE__ */ new Set();
    for (const e of filteredData) {
      totalObs += e.observations.length;
      for (const r of e.relations) {
        uniqueRelIds.add(r.id);
      }
    }
    const totalRel = uniqueRelIds.size;
    switch (format) {
      case "json":
        this.exportToJson(resolvedPath, filteredData);
        break;
      case "markdown":
        this.exportToMarkdown(resolvedPath, filteredData);
        break;
      case "sqlite":
        this.exportToSqlite(resolvedPath, filteredData);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
    return {
      format,
      outputPath: resolvedPath,
      entitiesCount: filteredData.length,
      observationsCount: totalObs,
      relationsCount: totalRel
    };
  }
  exportToJson(outputPath, data) {
    const parentDir = path12.dirname(outputPath);
    fs10.mkdirSync(parentDir, { recursive: true });
    const payload = {
      formatVersion: "3.0.0",
      version: "3.2.0",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      entitiesCount: data.length,
      entities: data
    };
    fs10.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");
  }
  exportToMarkdown(outputDir, data) {
    fs10.mkdirSync(outputDir, { recursive: true });
    const possibleKnowledgeDirs = [
      path12.join(this.db.getDataDir(), "..", "knowledge"),
      path12.join(this.db.getDataDir(), "knowledge"),
      path12.join(process.cwd(), ".amneshia", "knowledge"),
      path12.join(os6.homedir(), ".amneshia", "knowledge")
    ];
    for (const ent of data) {
      saveEntityMarkdown(outputDir, ent, ent.observations, ent.relations, ent.media);
      if (ent.media) {
        const relPath = ent.media.relativePath;
        if (path12.isAbsolute(relPath) || relPath.includes("..")) {
          continue;
        }
        for (const kDir of possibleKnowledgeDirs) {
          const srcBlob = path12.join(kDir, relPath);
          const destBlob = path12.resolve(outputDir, relPath);
          if (!destBlob.startsWith(path12.resolve(outputDir) + path12.sep)) {
            continue;
          }
          if (fs10.existsSync(srcBlob) && !fs10.existsSync(destBlob)) {
            fs10.mkdirSync(path12.dirname(destBlob), { recursive: true });
            fs10.copyFileSync(srcBlob, destBlob);
            break;
          }
        }
      }
    }
    const indexLines = [
      "# Amneshia Knowledge Graph Export Catalog",
      "",
      `Exported at: ${(/* @__PURE__ */ new Date()).toISOString()}`,
      `Total Entities: ${data.length}`,
      "",
      "## Entities",
      ""
    ];
    for (const ent of data) {
      const domainSlug = toSlug(ent.domain);
      const nameSlug = toSlug(ent.name);
      indexLines.push(`- [${ent.name}](./${domainSlug}/${nameSlug}.md) (${ent.domain} / ${ent.entityType}) \u2014 ${ent.observations.length} observations`);
    }
    indexLines.push("");
    fs10.writeFileSync(path12.join(outputDir, "index.md"), indexLines.join("\n"), "utf-8");
  }
  exportToSqlite(outputPath, data) {
    const parentDir = path12.dirname(outputPath);
    fs10.mkdirSync(parentDir, { recursive: true });
    if (fs10.existsSync(outputPath)) {
      fs10.unlinkSync(outputPath);
    }
    const exportDb = new Database2(outputPath);
    try {
      exportDb.pragma("journal_mode = WAL");
      exportDb.pragma("synchronous = NORMAL");
      exportDb.pragma("foreign_keys = ON");
      exportDb.exec(SCHEMA_SQL);
      runMigrations(exportDb);
      const insertEntity = exportDb.prepare(`
        INSERT INTO entities (id, name, entity_type, domain, visibility, allowed_agents, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertObs = exportDb.prepare(`
        INSERT INTO observations (
          id, entity_id, content, source, importance, status,
          confidence, access_count, authority_tier, derived_from,
          created_at, updated_at, expires_at, last_accessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertRelation = exportDb.prepare(`
        INSERT INTO relations (id, from_entity, to_entity, relation_type, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const insertMedia = exportDb.prepare(`
        INSERT INTO media_assets (id, entity_id, sha256, mime_type, file_name, file_size, relative_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const populateTransaction = exportDb.transaction(() => {
        const entityIds = /* @__PURE__ */ new Set();
        for (const ent of data) {
          entityIds.add(ent.id);
          insertEntity.run(
            ent.id,
            ent.name,
            ent.entityType,
            ent.domain,
            ent.visibility,
            JSON.stringify(ent.allowedAgents ?? []),
            ent.createdAt,
            ent.updatedAt
          );
          if (ent.media) {
            insertMedia.run(
              ent.media.id,
              ent.media.entityId,
              ent.media.sha256,
              ent.media.mimeType,
              ent.media.fileName,
              ent.media.fileSize,
              ent.media.relativePath,
              ent.media.createdAt
            );
          }
          for (const obs of ent.observations) {
            insertObs.run(
              obs.id,
              obs.entityId,
              obs.content,
              obs.source ?? null,
              obs.importance,
              obs.status,
              obs.confidence,
              obs.accessCount ?? 0,
              obs.authorityTier,
              JSON.stringify(obs.derivedFrom ?? []),
              obs.createdAt,
              obs.updatedAt,
              obs.expiresAt ?? null,
              obs.lastAccessedAt ?? null
            );
          }
        }
        for (const ent of data) {
          for (const rel of ent.relations) {
            if (entityIds.has(rel.fromEntity) && entityIds.has(rel.toEntity)) {
              try {
                insertRelation.run(
                  rel.id,
                  rel.fromEntity,
                  rel.toEntity,
                  rel.relationType,
                  rel.createdAt
                );
              } catch {
              }
            }
          }
        }
      });
      populateTransaction();
    } finally {
      exportDb.close();
    }
  }
};

// src/cloud/merge-driver.ts
import fs11 from "fs";
function normalizeContent(content) {
  return content.trim().replace(/\s+/g, " ").toLowerCase();
}
function extractDirectionalRelations(markdown) {
  const relations = [];
  const relSectionMatch = markdown.match(/## Relations\r?\n([\s\S]*?)$/i);
  if (!relSectionMatch) return relations;
  const lines = relSectionMatch[1].split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- `"));
  for (const line of lines) {
    const relMatch = line.match(/^- `(.*?)`\s*(->|<-)\s*(.*)$/);
    if (relMatch) {
      relations.push({
        relationType: relMatch[1].trim(),
        direction: relMatch[2],
        targetName: relMatch[3].trim()
      });
    }
  }
  return relations;
}
function serializeParsedEntity(entity) {
  const frontmatter = [
    "---",
    `id: ${JSON.stringify(entity.id || "")}`,
    `name: ${JSON.stringify(entity.name || "")}`,
    `type: ${JSON.stringify(entity.entityType || "concept")}`,
    `domain: ${JSON.stringify(entity.domain || "personal")}`,
    `visibility: ${JSON.stringify(entity.visibility || "public")}`,
    `allowed_agents: ${JSON.stringify(entity.allowedAgents ?? [])}`,
    `created: ${JSON.stringify(entity.createdAt || (/* @__PURE__ */ new Date()).toISOString())}`,
    `updated: ${JSON.stringify(entity.updatedAt || (/* @__PURE__ */ new Date()).toISOString())}`,
    "---"
  ].join("\n");
  const obsLines = [];
  for (const obs of entity.observations) {
    const isInactive = obs.status === "superseded" || obs.status === "invalidated" || obs.status === "decayed";
    const mainText = `**[${obs.authorityTier}]** ${obs.content}`;
    const formattedText = isInactive ? `~~${mainText}~~` : mainText;
    const metaParts = [
      `id: ${obs.id}`,
      `confidence: ${obs.confidence}`
    ];
    if (obs.derivedFrom && obs.derivedFrom.length > 0) {
      metaParts.push(`derived_from: [${obs.derivedFrom.join(", ")}]`);
    }
    metaParts.push(`status: ${obs.status}`);
    if (obs.supersedes) {
      metaParts.push(`superseded_by: ${obs.supersedes}`);
    }
    obsLines.push(`- ${formattedText}
  \`${metaParts.join(" | ")}\``);
  }
  const relLines = [];
  for (const rel of entity.relations) {
    const dir = rel.direction || "->";
    relLines.push(`- \`${rel.relationType}\` ${dir} ${rel.targetName}`);
  }
  const sections = [frontmatter];
  sections.push("## Observations\n");
  if (obsLines.length > 0) {
    sections.push(obsLines.join("\n\n"));
  } else {
    sections.push("_No observations recorded yet._");
  }
  sections.push("\n## Relations\n");
  if (relLines.length > 0) {
    sections.push(relLines.join("\n"));
  } else {
    sections.push("_No relations recorded yet._");
  }
  return sections.join("\n") + "\n";
}
function tierRank(tier) {
  switch (tier) {
    case "invariant":
      return 4;
    case "architectural":
      return 3;
    case "contextual":
      return 2;
    case "ephemeral":
      return 1;
    default:
      return 0;
  }
}
function mergeParsedEntities(base, ours, theirs) {
  const id = ours.id || theirs.id || (base?.id ?? "");
  const name = ours.name || theirs.name || (base?.name ?? "");
  const entityType = theirs.entityType !== base?.entityType ? theirs.entityType : ours.entityType || "concept";
  const domain = theirs.domain !== base?.domain ? theirs.domain : ours.domain || "personal";
  const visibility = theirs.visibility !== base?.visibility ? theirs.visibility : ours.visibility || "public";
  const mergedAgents = Array.from(/* @__PURE__ */ new Set([...ours.allowedAgents ?? [], ...theirs.allowedAgents ?? []]));
  const createdAt = [ours.createdAt, theirs.createdAt, base?.createdAt].filter(Boolean).sort()[0] || (/* @__PURE__ */ new Date()).toISOString();
  const updatedAt = [ours.updatedAt, theirs.updatedAt].filter(Boolean).sort().reverse()[0] || (/* @__PURE__ */ new Date()).toISOString();
  const baseObsById = /* @__PURE__ */ new Map();
  const baseObsByContent = /* @__PURE__ */ new Map();
  if (base) {
    for (const obs of base.observations) {
      if (obs.id) baseObsById.set(obs.id, obs);
      baseObsByContent.set(normalizeContent(obs.content), obs);
    }
  }
  const oursObsById = /* @__PURE__ */ new Map();
  const oursObsByContent = /* @__PURE__ */ new Map();
  for (const obs of ours.observations) {
    if (obs.id) oursObsById.set(obs.id, obs);
    oursObsByContent.set(normalizeContent(obs.content), obs);
  }
  const theirsObsById = /* @__PURE__ */ new Map();
  const theirsObsByContent = /* @__PURE__ */ new Map();
  for (const obs of theirs.observations) {
    if (obs.id) theirsObsById.set(obs.id, obs);
    theirsObsByContent.set(normalizeContent(obs.content), obs);
  }
  const candidateObservations = [];
  const mergeTwoObs = (a, b) => {
    const higherTier = tierRank(a.authorityTier) >= tierRank(b.authorityTier) ? a.authorityTier : b.authorityTier;
    const combinedDerived = Array.from(/* @__PURE__ */ new Set([...a.derivedFrom ?? [], ...b.derivedFrom ?? []]));
    const bestStatus = a.status === "invalidated" || b.status === "invalidated" ? "invalidated" : a.status === "stale" || b.status === "stale" ? "stale" : "active";
    return {
      id: a.id || b.id,
      content: a.content.length >= b.content.length ? a.content : b.content,
      authorityTier: higherTier,
      derivedFrom: combinedDerived,
      confidence: Math.max(a.confidence ?? 1, b.confidence ?? 1),
      status: bestStatus,
      supersedes: a.supersedes || b.supersedes || null
    };
  };
  if (!base) {
    const seenContent = /* @__PURE__ */ new Set();
    const all = [...ours.observations, ...theirs.observations];
    for (const obs of all) {
      const norm = normalizeContent(obs.content);
      const counterpart = theirsObsByContent.get(norm) || oursObsByContent.get(norm);
      if (counterpart && counterpart !== obs) {
        if (!seenContent.has(norm)) {
          candidateObservations.push(mergeTwoObs(obs, counterpart));
          seenContent.add(norm);
        }
      } else if (!seenContent.has(norm)) {
        candidateObservations.push(obs);
        seenContent.add(norm);
      }
    }
  } else {
    const processedIds = /* @__PURE__ */ new Set();
    const processedContent = /* @__PURE__ */ new Set();
    for (const oObs of ours.observations) {
      const norm = normalizeContent(oObs.content);
      const bObs = (oObs.id ? baseObsById.get(oObs.id) : void 0) || baseObsByContent.get(norm);
      const tObs = (oObs.id ? theirsObsById.get(oObs.id) : void 0) || theirsObsByContent.get(norm);
      if (!bObs) {
        if (tObs) {
          candidateObservations.push(mergeTwoObs(oObs, tObs));
        } else {
          candidateObservations.push(oObs);
        }
      } else {
        if (!tObs) {
          const oursModified = JSON.stringify(oObs) !== JSON.stringify(bObs);
          if (oursModified) {
            candidateObservations.push(oObs);
          }
        } else {
          const oursChanged = JSON.stringify(oObs) !== JSON.stringify(bObs);
          const theirsChanged = JSON.stringify(tObs) !== JSON.stringify(bObs);
          if (!oursChanged && theirsChanged) {
            candidateObservations.push(tObs);
          } else if (oursChanged && !theirsChanged) {
            candidateObservations.push(oObs);
          } else if (oursChanged && theirsChanged) {
            candidateObservations.push(mergeTwoObs(oObs, tObs));
          } else {
            candidateObservations.push(oObs);
          }
        }
      }
      if (oObs.id) processedIds.add(oObs.id);
      processedContent.add(norm);
    }
    for (const tObs of theirs.observations) {
      const norm = normalizeContent(tObs.content);
      if (tObs.id && processedIds.has(tObs.id)) continue;
      if (processedContent.has(norm)) continue;
      const bObs = (tObs.id ? baseObsById.get(tObs.id) : void 0) || baseObsByContent.get(norm);
      if (!bObs) {
        candidateObservations.push(tObs);
      } else {
        const theirsModified = JSON.stringify(tObs) !== JSON.stringify(bObs);
        if (theirsModified) {
          candidateObservations.push(tObs);
        }
      }
      if (tObs.id) processedIds.add(tObs.id);
      processedContent.add(norm);
    }
  }
  const dedupedObservations = [];
  const contentMap = /* @__PURE__ */ new Map();
  for (const obs of candidateObservations) {
    const key = normalizeContent(obs.content);
    const existing = contentMap.get(key);
    if (!existing) {
      contentMap.set(key, obs);
      dedupedObservations.push(obs);
    } else {
      const merged = mergeTwoObs(existing, obs);
      const idx = dedupedObservations.indexOf(existing);
      if (idx !== -1) {
        dedupedObservations[idx] = merged;
        contentMap.set(key, merged);
      }
    }
  }
  const relKey = (r) => `${r.relationType}::${r.direction || "->"}::${r.targetName.trim().toLowerCase()}`;
  const baseRelKeys = new Set((base?.relations ?? []).map(relKey));
  const oursRelMap = new Map((ours.relations ?? []).map((r) => [relKey(r), r]));
  const theirsRelMap = new Map((theirs.relations ?? []).map((r) => [relKey(r), r]));
  const mergedRelations = [];
  const processedRelKeys = /* @__PURE__ */ new Set();
  for (const [key, rel] of oursRelMap) {
    if (processedRelKeys.has(key)) continue;
    if (!baseRelKeys.has(key)) {
      mergedRelations.push(rel);
    } else {
      if (theirsRelMap.has(key)) {
        mergedRelations.push(rel);
      }
    }
    processedRelKeys.add(key);
  }
  for (const [key, rel] of theirsRelMap) {
    if (processedRelKeys.has(key)) continue;
    if (!baseRelKeys.has(key)) {
      mergedRelations.push(rel);
    }
    processedRelKeys.add(key);
  }
  return {
    id,
    name,
    entityType,
    domain,
    visibility,
    allowedAgents: mergedAgents,
    createdAt,
    updatedAt,
    observations: dedupedObservations,
    relations: mergedRelations
  };
}
function mergeMarkdownFiles(basePath, oursPath, theirsPath, targetPath) {
  const destination = targetPath || oursPath;
  if (!fs11.existsSync(oursPath)) {
    throw new Error(`Ours file does not exist at: ${oursPath}`);
  }
  if (!fs11.existsSync(theirsPath)) {
    throw new Error(`Theirs file does not exist at: ${theirsPath}`);
  }
  const oursRaw = fs11.readFileSync(oursPath, "utf-8");
  const theirsRaw = fs11.readFileSync(theirsPath, "utf-8");
  let baseRaw = null;
  if (basePath && fs11.existsSync(basePath)) {
    baseRaw = fs11.readFileSync(basePath, "utf-8").trim();
    if (baseRaw.length === 0) baseRaw = null;
  }
  const oursParsed = parseEntityMarkdown(oursRaw);
  const theirsParsed = parseEntityMarkdown(theirsRaw);
  const baseParsed = baseRaw ? parseEntityMarkdown(baseRaw) : null;
  const oursEntity = {
    ...oursParsed,
    relations: extractDirectionalRelations(oursRaw)
  };
  const theirsEntity = {
    ...theirsParsed,
    relations: extractDirectionalRelations(theirsRaw)
  };
  const baseEntity = baseParsed ? {
    ...baseParsed,
    relations: extractDirectionalRelations(baseRaw)
  } : null;
  const merged = mergeParsedEntities(baseEntity, oursEntity, theirsEntity);
  const serialized = serializeParsedEntity(merged);
  fs11.writeFileSync(destination, serialized, "utf-8");
  return {
    success: true,
    outputPath: destination,
    entityName: merged.name,
    observationsCount: merged.observations.length,
    relationsCount: merged.relations.length
  };
}

// src/updater/index.ts
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";
import path13 from "path";
import fs12 from "fs";
var execFileAsync2 = promisify2(execFile2);
function compareSemver(v1, v2) {
  const parse = (v) => {
    const clean = v.replace(/^v/i, "").split("-")[0].trim();
    return clean.split(".").map((part) => {
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
async function fetchLatestRelease(repo = "SabilMurti/Amneshia", timeoutMs = 8e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        "User-Agent": "Amneshia-Updater/3.2.1",
        Accept: "application/vnd.github.v3+json"
      },
      signal: controller.signal
    });
    if (res.ok) {
      const data = await res.json();
      const tagName = data.tag_name || "";
      const version = tagName.replace(/^v/i, "");
      const tarballAsset = (data.assets || []).find(
        (a) => a.name === "amneshia-latest.tgz" || a.name.endsWith(".tgz")
      );
      clearTimeout(timer);
      return {
        version,
        tagName,
        releaseUrl: data.html_url || `https://github.com/${repo}/releases/latest`,
        tarballUrl: tarballAsset?.browser_download_url || `https://github.com/${repo}/releases/latest/download/amneshia-latest.tgz`,
        notes: data.body || "",
        publishedAt: data.published_at,
        source: "github"
      };
    }
  } catch {
  }
  try {
    const jsrRes = await fetch("https://jsr.io/api/scopes/sabilmurti/packages/amneshia", {
      headers: {
        "User-Agent": "Amneshia-Updater/3.2.1",
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (jsrRes.ok) {
      const data = await jsrRes.json();
      const latestVersion = data.latestVersion || "3.2.1";
      clearTimeout(timer);
      return {
        version: latestVersion,
        tagName: `v${latestVersion}`,
        releaseUrl: `https://jsr.io/@sabilmurti/amneshia`,
        tarballUrl: `https://github.com/${repo}/releases/latest/download/amneshia-latest.tgz`,
        source: "jsr"
      };
    }
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`Failed to check for Amneshia updates: Network error (${err.message})`);
  } finally {
    clearTimeout(timer);
  }
  throw new Error(`Could not retrieve latest release information from GitHub or JSR.`);
}
async function checkForUpdate(currentVersion, repo) {
  const releaseInfo = await fetchLatestRelease(repo);
  const cmp = compareSemver(releaseInfo.version, currentVersion);
  return {
    currentVersion,
    latestVersion: releaseInfo.version,
    hasUpdate: cmp > 0,
    releaseInfo
  };
}
function detectInstallEnvironment() {
  let isGitClone = false;
  let gitDir;
  try {
    const cwdGit = path13.join(process.cwd(), ".git");
    if (fs12.existsSync(cwdGit)) {
      const pkgPath = path13.join(process.cwd(), "package.json");
      if (fs12.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs12.readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "@sabilmurti/amneshia" || pkg.name === "amneshia") {
          isGitClone = true;
          gitDir = process.cwd();
        }
      }
    }
  } catch {
  }
  let pkgManager = "npm";
  if (process.env.BUN_INSTALL || process.versions.bun) {
    pkgManager = "bun";
  }
  return { isGitClone, gitDir, pkgManager };
}
async function performUpdate(options) {
  const { currentVersion, force = false, onProgress, repo = "SabilMurti/Amneshia" } = options;
  onProgress?.("Checking for the latest release on GitHub / JSR...");
  const check = await checkForUpdate(currentVersion, repo);
  if (!check.hasUpdate && !force) {
    return {
      success: true,
      fromVersion: currentVersion,
      toVersion: check.latestVersion,
      method: "none",
      message: `Amneshia is already on the latest version (v${currentVersion}).`
    };
  }
  const env = detectInstallEnvironment();
  if (env.isGitClone && env.gitDir) {
    onProgress?.(`Updating Amneshia from git repository (${env.gitDir})...`);
    try {
      onProgress?.("Fetching latest changes from origin/main...");
      await execFileAsync2("git", ["pull", "--rebase", "origin", "main"], { cwd: env.gitDir });
      onProgress?.("Installing updated dependencies...");
      await execFileAsync2(env.pkgManager, ["install"], { cwd: env.gitDir });
      onProgress?.("Rebuilding production bundles...");
      await execFileAsync2(env.pkgManager, ["run", "build"], { cwd: env.gitDir });
      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: check.latestVersion,
        method: "git",
        message: `Successfully updated Amneshia repository from v${currentVersion} to v${check.latestVersion}.`
      };
    } catch (err) {
      throw new Error(`Git update failed: ${err.message}`);
    }
  }
  onProgress?.(`Installing Amneshia v${check.latestVersion} globally via ${env.pkgManager}...`);
  const tarballUrl = check.releaseInfo.tarballUrl || `https://github.com/${repo}/releases/latest/download/amneshia-latest.tgz`;
  if (!tarballUrl.startsWith(`https://github.com/${repo}/releases/`)) {
    throw new Error(`Untrusted tarball source rejected: "${tarballUrl}"`);
  }
  let installSuccess = false;
  let method = "tarball";
  try {
    onProgress?.(`Downloading and installing release tarball: ${tarballUrl}`);
    if (env.pkgManager === "bun") {
      await execFileAsync2("bun", ["install", "-g", tarballUrl]);
    } else if (env.pkgManager === "pnpm") {
      await execFileAsync2("pnpm", ["add", "-g", tarballUrl]);
    } else {
      await execFileAsync2("npm", ["install", "-g", tarballUrl]);
    }
    installSuccess = true;
    method = "tarball";
  } catch (tarballErr) {
    onProgress?.(`Tarball installation failed (${tarballErr.message}). Falling back to package registry...`);
  }
  if (!installSuccess) {
    try {
      const pkgTarget = `@sabilmurti/amneshia@${check.latestVersion}`;
      onProgress?.(`Installing ${pkgTarget} via ${env.pkgManager}...`);
      if (env.pkgManager === "bun") {
        await execFileAsync2("bun", ["install", "-g", pkgTarget]);
      } else if (env.pkgManager === "pnpm") {
        await execFileAsync2("pnpm", ["add", "-g", pkgTarget]);
      } else {
        await execFileAsync2("npm", ["install", "-g", pkgTarget]);
      }
      installSuccess = true;
      method = "registry";
    } catch (regErr) {
      throw new Error(`Package registry installation failed: ${regErr.message}`);
    }
  }
  return {
    success: true,
    fromVersion: currentVersion,
    toVersion: check.latestVersion,
    method,
    message: `Amneshia successfully updated from v${currentVersion} to v${check.latestVersion}!`
  };
}

// src/index.ts
var program = new Command();
program.name("amneshia").description("\u{1F9E0} Amneshia v3 \u2014 Git-native knowledge graph for AI agents with truth maintenance").version("3.2.1").option("--data-dir <path>", "Custom data directory").option("-l, --local", "Use local repository directory (.amneshia) instead of global ~/.amneshia").option("--tool-profile <profile>", 'MCP tool profile: "core" (4 tools) or "full" (all tools)', "core").option("--http", "Enable HTTP/SSE server mode", true).option("--no-dashboard", "Disable HTTP Web Dashboard server").option("-p, --port <number>", "Dashboard port number", (val) => parseInt(val, 10), 3457).option("-b, --background", "Run server in background daemon mode", false).option("-d, --daemon", "Alias for --background", false).action(async () => {
  await runDefault();
});
program.command("init [dir]").description("Initialize a local .amneshia/ knowledge graph repository").option("-d, --adopt-domain <domain>", "Automatically adopt global entities belonging to this domain").option("-a, --adopt-all", "Automatically adopt all global memory entities into this project").action(async (dir, cmdOpts) => {
  const targetDir = dir ? path14.resolve(dir) : process.cwd();
  const { dataDir, knowledgeDir } = initAmneshiaProject(targetDir);
  console.log(`[Amneshia] Initialized local repository:`);
  console.log(`  - Data Directory:      ${dataDir}`);
  console.log(`  - Knowledge Markdown:  ${knowledgeDir}`);
  console.log(`  - Config File:         ${path14.join(dataDir, "config.yaml")}`);
  console.log(`  - Cache .gitignore:    ${path14.join(dataDir, ".gitignore")}`);
  if (cmdOpts.adoptDomain || cmdOpts.adoptAll) {
    console.log(`
[Amneshia] Adopting memories from global storage (~/.amneshia)...`);
    try {
      const adoptRes = await adoptMemory({
        targetDataDir: dataDir,
        domain: cmdOpts.adoptDomain,
        all: cmdOpts.adoptAll
      });
      console.log(`[Amneshia] Adoption complete:`);
      console.log(`  - Entities Adopted:     ${adoptRes.entitiesAdopted.length} [${adoptRes.entitiesAdopted.join(", ")}]`);
      console.log(`  - Observations Adopted: ${adoptRes.observationsAdopted}`);
      console.log(`  - Relations Adopted:    ${adoptRes.relationsAdopted}`);
      console.log(`  - Skipped Duplicates:   ${adoptRes.skippedDuplicates}`);
      if (adoptRes.contradictionWarnings.length > 0) {
        console.warn(`  - Contradiction Warnings: ${adoptRes.contradictionWarnings.length}`);
      }
    } catch (err) {
      console.warn(`[Amneshia] Adoption warning: ${err.message}`);
    }
  }
  console.log(`
Ready! Track your markdown files with git, and commit knowledge directly.`);
});
program.command("reindex").description("Rebuild SQLite FTS5 cache index from markdown files").option("-l, --local", "Reindex local repository in current working directory").action((cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
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
program.command("sync").description("Export all SQLite entities and observations to Markdown-as-Truth files").option("-l, --local", "Sync local repository").action((cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  console.log(`[Amneshia] Exporting all knowledge to Markdown at: ${config.knowledgeDir}`);
  const db = new DatabaseLayer(config.dataDir);
  const sync = new DualWriteSync(config.knowledgeDir, db);
  const count = sync.syncAll();
  console.log(`[Amneshia] Successfully synced ${count} entities to Markdown-as-Truth files!`);
  db.close();
});
program.command("gc").description("Garbage collect decayed, expired, and invalidated observations, and purge orphan CAS media blobs").option("-l, --local", "Run GC on local repository").action((cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
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
program.command("stats").description("Display knowledge graph statistics and health breakdown").option("-l, --local", "Display stats for local repository").action((cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  const db = new DatabaseLayer(config.dataDir);
  const stats = db.getStats();
  console.log(`
\u{1F9E0} Amneshia Knowledge Graph Stats (${config.mode.toUpperCase()} mode):`);
  console.log(`-----------------------------------------------`);
  console.log(`  Total Entities:       ${stats.totalEntities}`);
  console.log(`  Total Observations:   ${stats.totalObservations}`);
  console.log(`  Total Relations:      ${stats.totalRelations}`);
  console.log(`  Total Media Assets:   ${stats.totalMediaAssets ?? 0}`);
  console.log(`  Export Targets:       ${stats.totalExportTargets}`);
  console.log(`  Open Contradictions:  ${stats.totalContradictions ?? 0}`);
  if (stats.observationsByTier && Object.keys(stats.observationsByTier).length > 0) {
    console.log(`
  Observations by Authority Tier:`);
    for (const [tier, count] of Object.entries(stats.observationsByTier)) {
      console.log(`    - ${tier.padEnd(15)}: ${count}`);
    }
  }
  if (stats.observationsByStatus && Object.keys(stats.observationsByStatus).length > 0) {
    console.log(`
  Observations by Status:`);
    for (const [status, count] of Object.entries(stats.observationsByStatus)) {
      console.log(`    - ${status.padEnd(15)}: ${count}`);
    }
  }
  if (stats.entitiesByDomain && Object.keys(stats.entitiesByDomain).length > 0) {
    console.log(`
  Entities by Domain:`);
    for (const [domain, count] of Object.entries(stats.entitiesByDomain)) {
      console.log(`    - ${domain.padEnd(15)}: ${count}`);
    }
  }
  console.log("");
  db.close();
});
program.command("serve").description("Start the HTTP Web Dashboard server").option("-p, --port <number>", "Port number", (val) => parseInt(val, 10)).option("-l, --local", "Use local repository").action(async (cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local;
  const port = cmdOpts.port ?? program.opts().port ?? 3457;
  await startServer({ local: isLocal, http: true, port, stdio: false });
});
program.command("export <output>").description("Export memory knowledge graph to SQLite (.db), Markdown bundle, or JSON").option("-f, --format <format>", "Export format: sqlite, markdown, json", "sqlite").option("-d, --domain <domain>", "Filter by domain name").option("-e, --entity <entities...>", "Filter by specific entity names").option("-t, --tier <tier>", "Filter by minimum authority tier (agent, user, system)").option("-q, --query <query>", "Filter observations using FTS5 search query").option("-l, --local", "Export from local project repository (.amneshia) instead of global").action(async (output, cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  const db = new DatabaseLayer(config.dataDir);
  const validFormats = ["sqlite", "markdown", "json"];
  const format = (cmdOpts.format || "sqlite").toLowerCase();
  if (!validFormats.includes(format)) {
    console.error(`[Amneshia] Invalid export format: "${cmdOpts.format}". Allowed: ${validFormats.join(", ")}`);
    db.close();
    process.exit(1);
  }
  const tiers = cmdOpts.tier ? [cmdOpts.tier.toLowerCase()] : void 0;
  const exporter = new MemoryExporter(db);
  console.log(`[Amneshia] Exporting knowledge graph (${config.mode.toUpperCase()} mode) to ${output}...`);
  try {
    const result = await exporter.export(format, output, {
      domain: cmdOpts.domain,
      entities: cmdOpts.entity,
      tiers,
      query: cmdOpts.query
    });
    console.log(`
\u2705 Amneshia Export Complete:`);
    console.log(`  - Format:       ${result.format.toUpperCase()}`);
    console.log(`  - Destination:  ${result.outputPath}`);
    console.log(`  - Entities:     ${result.entitiesCount}`);
    console.log(`  - Observations: ${result.observationsCount}`);
    console.log(`  - Relations:    ${result.relationsCount}`);
  } catch (err) {
    console.error(`[Amneshia] Export failed: ${err.message}`);
    db.close();
    process.exit(1);
  }
  db.close();
});
program.command("adopt").description("Adopt accumulated memories from global storage (~/.amneshia) into current local project").option("-d, --domain <domain>", "Filter global entities by domain").option("-e, --entity <entities...>", "Filter global entities by names").option("-a, --all", "Adopt all entities from global storage").option("--dry-run", "Preview adoption without modifying local project").option("--move", "Remove adopted observations from source storage after copying").option("-s, --source <path>", "Custom source data directory (defaults to ~/.amneshia)").option("-t, --target <path>", "Custom target data directory (defaults to ./.amneshia)").action(async (cmdOpts) => {
  try {
    console.log(`[Amneshia] Starting memory adoption...`);
    const result = await adoptMemory({
      sourceDataDir: cmdOpts.source,
      targetDataDir: cmdOpts.target,
      domain: cmdOpts.domain,
      entities: cmdOpts.entity,
      all: cmdOpts.all,
      dryRun: cmdOpts.dryRun,
      move: cmdOpts.move
    });
    console.log(`
${result.dryRun ? "\u{1F50D} [DRY RUN] " : "\u2705 "}Amneshia Adoption Summary:`);
    console.log(`  - Source:               ${result.sourceDir}`);
    console.log(`  - Target:               ${result.targetDir}`);
    console.log(`  - Entities Adopted:     ${result.entitiesAdopted.length} ${result.entitiesAdopted.length > 0 ? `[${result.entitiesAdopted.join(", ")}]` : ""}`);
    console.log(`  - Observations Adopted: ${result.observationsAdopted}`);
    console.log(`  - Relations Adopted:    ${result.relationsAdopted}`);
    console.log(`  - Skipped Duplicates:   ${result.skippedDuplicates}`);
    if (result.contradictionWarnings.length > 0) {
      console.warn(`
\u26A0\uFE0F  Contradiction Warnings (${result.contradictionWarnings.length}):`);
      for (const warn of result.contradictionWarnings) {
        console.warn(`    - Entity "${warn.entity}": ${warn.fact} (${warn.reason})`);
      }
    }
  } catch (err) {
    console.error(`[Amneshia] Adoption failed: ${err.message}`);
    process.exit(1);
  }
});
program.command("embed").description("Compute local ONNX vector embeddings for all observations for hybrid semantic search").option("-l, --local", "Use local repository (.amneshia)").option("-f, --force", "Force re-embedding of all observations").action(async (cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  const db = new DatabaseLayer(config.dataDir);
  const embedder = new LocalOnnxEmbedder();
  try {
    console.log(`[Amneshia] Initializing local ONNX embedder (${embedder.getModelName()})...`);
    await embedder.init();
    const engineName = embedder.getBackend() === "native" ? "Native C++ (PC Hardware Accelerated)" : "WebAssembly SIMD (Universal / Termux)";
    console.log(`[Amneshia] Active Inference Engine: ${engineName}`);
    if (cmdOpts.force) {
      db.clearEmbeddings(embedder.getModelName());
    }
    const pending = db.getUnembeddedObservations(embedder.getModelName());
    console.log(`[Amneshia] Found ${pending.length} observations needing vector embeddings.`);
    if (pending.length === 0) {
      console.log(`\u2705 All observations are already embedded.`);
      db.close();
      return;
    }
    const start = Date.now();
    let completed = 0;
    const isMobile = process.platform === "android" || Boolean(process.env.TERMUX_VERSION);
    const chunkSize = isMobile ? 5 : 16;
    for (let i = 0; i < pending.length; i += chunkSize) {
      const chunk = pending.slice(i, i + chunkSize);
      const vectors = await Promise.all(chunk.map((item) => embedder.embed(item.content)));
      for (let j = 0; j < chunk.length; j++) {
        db.saveObservationEmbedding(chunk[j].id, vectors[j], embedder.getModelName());
      }
      completed += chunk.length;
      process.stdout.write(`\r  Embedding progress: ${completed}/${pending.length} (${Math.round(completed / pending.length * 100)}%)`);
    }
    const duration = ((Date.now() - start) / 1e3).toFixed(2);
    console.log(`

\u2705 Embedding complete: ${completed} observations embedded in ${duration}s.`);
  } catch (err) {
    console.error(`
[Amneshia] Embedding failed: ${err.message}`);
    db.close();
    process.exit(1);
  }
  db.close();
});
program.command("search <query>").description("Search knowledge graph using Hybrid Semantic (FTS5 + ONNX Vector RRF)").option("-d, --domain <domain>", "Filter by domain").option("-l, --local", "Use local repository").option("-n, --limit <number>", "Result limit", (val) => parseInt(val, 10), 10).action(async (query, cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  const db = new DatabaseLayer(config.dataDir);
  try {
    const results = await db.searchHybrid(query, {
      limit: cmdOpts.limit || 10,
      domain: cmdOpts.domain
    });
    console.log(`
\u{1F50D} Hybrid Search Results for "${query}" (${results.length} matches):`);
    console.log(`-------------------------------------------------------------`);
    if (results.length === 0) {
      console.log("  No matching memories found.");
    } else {
      for (const res of results) {
        console.log(`
\u{1F4CC} ${res.entity.name} [${res.entity.domain}] (RRF Score: ${res.rank.toFixed(5)})`);
        for (const obs of res.observations) {
          console.log(`   - [${obs.authorityTier}] ${obs.content}`);
        }
      }
    }
    console.log("");
  } catch (err) {
    console.error(`[Amneshia] Search error: ${err.message}`);
    db.close();
    process.exit(1);
  }
  db.close();
});
var mediaCmd = program.command("media").description("Manage Content-Addressable Storage (CAS) media memory assets");
mediaCmd.command("list").description("List all registered media assets across the knowledge graph").option("-l, --local", "Use local repository (.amneshia)").action((cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  const db = new DatabaseLayer(config.dataDir);
  const assets = db.getAllMediaAssets();
  console.log(`
\u{1F4F8} Amneshia Media Assets (${assets.length} stored in ${config.mode.toUpperCase()} mode):`);
  console.log(`--------------------------------------------------------------------------------`);
  if (assets.length === 0) {
    console.log("  No media assets found.");
  } else {
    for (const asset of assets) {
      const ent = db.getEntityById(asset.entityId);
      const entName = ent ? ent.name : asset.entityId;
      const sizeKb = (asset.fileSize / 1024).toFixed(1);
      console.log(`\u{1F4CC} Entity: "${entName}" | File: ${asset.fileName} (${asset.mimeType}, ${sizeKb} KB)`);
      console.log(`   SHA-256: ${asset.sha256}`);
      console.log(`   Path:    ${asset.relativePath}`);
      console.log(`   Created: ${asset.createdAt}
`);
    }
  }
  db.close();
});
mediaCmd.command("remember <filePath>").description("Ingest a local media asset with attached facts and relations into CAS").requiredOption("-e, --entity <name>", "Entity name representing this media asset").option("-d, --domain <domain>", "Domain namespace", "personal").option("-f, --fact <facts...>", "Factual observations describing the media").option("-t, --tier <tier>", "Authority tier (invariant, architectural, contextual, ephemeral)", "contextual").option("-r, --relation <relations...>", 'Relationship links in format "relationType:targetEntity"').option("-l, --local", "Use local repository (.amneshia)").action(async (filePath, cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  const db = new DatabaseLayer(config.dataDir);
  const sync = new DualWriteSync(config.knowledgeDir, db);
  const graph = new KnowledgeGraph(db, sync);
  const facts = cmdOpts.fact ?? [];
  if (facts.length === 0) {
    facts.push(`Media asset ${path14.basename(filePath)} ingested into Amneshia CAS.`);
  }
  const relations = [];
  if (cmdOpts.relation) {
    for (const relStr of cmdOpts.relation) {
      const colonIdx = relStr.indexOf(":");
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
    const resolvedPath = path14.resolve(filePath);
    console.log(`[Amneshia] Ingesting media: ${resolvedPath}...`);
    const result = await graph.rememberMedia({
      filePath: resolvedPath,
      entity: cmdOpts.entity,
      domain: cmdOpts.domain,
      facts,
      tier: cmdOpts.tier,
      relations
    });
    console.log(`
\u2705 Media Ingested Successfully:`);
    console.log(`  - Entity:       ${result.entity.name} [${result.entity.domain}]`);
    console.log(`  - Media File:   ${result.media.fileName} (${result.media.mimeType}, ${(result.media.fileSize / 1024).toFixed(1)} KB)`);
    console.log(`  - SHA-256:      ${result.media.sha256}`);
    console.log(`  - Sharded Path: ${result.media.relativePath}`);
    console.log(`  - Deduplicated: ${result.deduplicated ? "Yes (reused existing blob)" : "No (new blob stored)"}`);
    console.log(`  - Observations: ${result.observationIds.length}`);
    console.log(`  - Relations:    ${result.relations.length}`);
  } catch (err) {
    console.error(`[Amneshia] Media ingestion failed: ${err.message}`);
    db.close();
    process.exit(1);
  }
  db.close();
});
mediaCmd.command("prune").description("Purge unreferenced orphan media blobs from CAS storage").option("-l, --local", "Use local repository (.amneshia)").action((cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  const db = new DatabaseLayer(config.dataDir);
  console.log(`[Amneshia] Scanning CAS storage for orphan blobs in ${config.knowledgeDir}...`);
  const pruneRes = db.pruneOrphanMedia(config.knowledgeDir);
  console.log(`
\u2705 Media CAS Pruning Complete:`);
  console.log(`  - Blobs Removed:  ${pruneRes.prunedCount}`);
  console.log(`  - Reclaimed Disk: ${(pruneRes.reclaimedBytes / 1024).toFixed(1)} KB`);
  db.close();
});
var cloudCmd = program.command("cloud").description("Git-native cross-device synchronization for Amneshia knowledge");
cloudCmd.command("setup <remoteUrl>").description("Initialize or link a Git remote repository for cloud knowledge sync").option("-b, --branch <branch>", "Target git branch", "main").option("-l, --local", "Use local repository (.amneshia) instead of global").action(async (remoteUrl, cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  try {
    console.log(`[Amneshia] Setting up Git-native cloud sync at: ${config.knowledgeDir}`);
    const res = await setupGitRemote(config.knowledgeDir, remoteUrl, cmdOpts.branch);
    console.log(`
\u2705 Cloud Remote Configured:`);
    console.log(`  - Knowledge Dir: ${config.knowledgeDir}`);
    console.log(`  - Remote URL:    ${res.remoteUrl}`);
    console.log(`  - Branch:        ${res.branch}`);
    console.log(`
Next steps: Run "amneshia cloud push" or "amneshia cloud sync" to sync knowledge.`);
  } catch (err) {
    console.error(`[Amneshia] Cloud setup failed: ${err.message}`);
    process.exit(1);
  }
});
cloudCmd.command("status").description("Check cloud sync status, branch info, and uncommitted knowledge changes").option("-l, --local", "Use local repository").action(async (cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  try {
    const status = await getCloudStatus(config.knowledgeDir);
    console.log(`
\u{1F9E0} Amneshia Cloud Status (${config.mode.toUpperCase()} mode):`);
    console.log(`-----------------------------------------------`);
    console.log(`  Initialized:     ${status.initialized ? "Yes" : "No"}`);
    console.log(`  Knowledge Dir:   ${status.knowledgeDir}`);
    console.log(`  Remote URL:      ${status.remoteUrl ?? '(None - run "amneshia cloud setup <url>")'}`);
    console.log(`  Branch:          ${status.branch}`);
    console.log(`  Clean:           ${status.clean ? "Yes" : "Has uncommitted changes"}`);
    console.log(`  Last Synced At:  ${status.lastSyncAt ?? "Never"}`);
    if (status.uncommittedFiles.length > 0) {
      console.log(`
  Uncommitted Changes (${status.uncommittedFiles.length}):`);
      for (const file of status.uncommittedFiles) {
        console.log(`    - ${file}`);
      }
    }
    console.log("");
  } catch (err) {
    console.error(`[Amneshia] Cloud status check failed: ${err.message}`);
    process.exit(1);
  }
});
cloudCmd.command("pull").description("Pull latest knowledge updates from Git remote and rebuild SQLite FTS5 index").option("-b, --branch <branch>", "Branch to pull from", "main").option("-l, --local", "Use local repository").action(async (cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  const db = new DatabaseLayer(config.dataDir);
  try {
    console.log(`[Amneshia] Pulling from cloud remote into ${config.knowledgeDir}...`);
    const result = await cloudPull(config.knowledgeDir, db, cmdOpts.branch);
    console.log(`
\u2705 Knowledge Pulled & Reindexed:`);
    console.log(`  - Entities Reindexed:     ${result.reindex.entities}`);
    console.log(`  - Observations Reindexed: ${result.reindex.observations}`);
    console.log(`  - Relations Reindexed:    ${result.reindex.relations}`);
  } catch (err) {
    console.error(`[Amneshia] Cloud pull failed: ${err.message}`);
    db.close();
    process.exit(1);
  }
  db.close();
});
cloudCmd.command("push").description("Commit and push local knowledge markdown changes to Git remote").option("-m, --message <message>", "Custom commit message").option("-b, --branch <branch>", "Branch to push to", "main").option("-l, --local", "Use local repository").action(async (cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  try {
    console.log(`[Amneshia] Pushing knowledge to cloud remote...`);
    const result = await cloudPush(config.knowledgeDir, cmdOpts.message, cmdOpts.branch);
    console.log(`
\u2705 Cloud Push Complete:`);
    console.log(`  - Status:  ${result.message}`);
    if (result.commitHash) {
      console.log(`  - Commit:  ${result.commitHash}`);
    }
  } catch (err) {
    console.error(`[Amneshia] Cloud push failed: ${err.message}`);
    process.exit(1);
  }
});
cloudCmd.command("sync").description("Atomic bidirectional sync: pull remote changes, reindex, and push local changes").option("-b, --branch <branch>", "Target git branch", "main").option("-l, --local", "Use local repository").action(async (cmdOpts) => {
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  const db = new DatabaseLayer(config.dataDir);
  try {
    console.log(`[Amneshia] Running bidirectional cloud sync on ${config.knowledgeDir}...`);
    const result = await cloudSync(config.knowledgeDir, db, cmdOpts.branch);
    console.log(`
\u2705 Cloud Sync Successful (${result.syncedAt}):`);
    console.log(`  - Reindexed Entities:     ${result.pull.reindex.entities}`);
    console.log(`  - Reindexed Observations: ${result.pull.reindex.observations}`);
    console.log(`  - Push Status:            ${result.push.message}`);
    if (result.push.commitHash) {
      console.log(`  - Commit Hash:            ${result.push.commitHash}`);
    }
  } catch (err) {
    console.error(`[Amneshia] Cloud sync failed: ${err.message}`);
    db.close();
    process.exit(1);
  }
  db.close();
});
cloudCmd.command("merge-driver <base> <ours> <theirs> [targetPath]").description("Internal 3-way git merge driver for knowledge markdown entities").action((base, ours, theirs, targetPath) => {
  try {
    mergeMarkdownFiles(base, ours, theirs, targetPath);
    process.exit(0);
  } catch (err) {
    console.error(`[Amneshia Merge Driver] Conflict resolution failed: ${err.message}`);
    process.exit(1);
  }
});
cloudCmd.command("setup-driver").description("Configure and activate the 3-way git merge driver in knowledge directory or globally (~/.gitconfig)").option("-g, --global", "Configure globally across all Git repositories (~/.gitconfig)").option("-l, --local", "Use local repository").action(async (cmdOpts) => {
  const isGlobal = Boolean(cmdOpts.global);
  const isLocal = cmdOpts.local || program.opts().local || fs13.existsSync(path14.join(process.cwd(), ".amneshia"));
  const config = resolveStorageConfig(isLocal);
  try {
    const success = await setupMergeDriver(config.knowledgeDir, { isGlobal });
    if (success) {
      if (isGlobal) {
        console.log(`
\u2705 Amneshia 3-Way Git Merge Driver successfully activated globally in ~/.gitconfig!`);
        console.log(`   Any repository with "*.md merge=amneshia" will now use Amneshia automatically.`);
      } else {
        console.log(`
\u2705 Amneshia 3-Way Git Merge Driver successfully activated for ${config.knowledgeDir}`);
      }
    } else {
      console.error(`[Amneshia] Knowledge directory not initialized with Git. Run "amneshia cloud setup <url>" first.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[Amneshia] Setup merge driver failed: ${err.message}`);
    process.exit(1);
  }
});
program.command("update").description("Update Amneshia to the latest release (GitHub Releases / JSR)").option("-c, --check", "Check for available updates without installing").option("-f, --force", "Force re-installation even if already on the latest version").action(async (cmdOpts) => {
  const currentVersion = "3.2.1";
  try {
    if (cmdOpts.check) {
      console.log(`[Amneshia] Checking for updates (current version: v${currentVersion})...`);
      const check = await checkForUpdate(currentVersion);
      if (check.hasUpdate) {
        console.log(`
\u{1F389} New update available: v${currentVersion} -> \x1B[1;32mv${check.latestVersion}\x1B[0m`);
        console.log(`   Release page: ${check.releaseInfo.releaseUrl}`);
        console.log(`
Run \x1B[1;36mamneshia update\x1B[0m to install the update.`);
      } else {
        console.log(`
\u2728 You are already on the latest version of Amneshia (v${currentVersion}).`);
      }
      return;
    }
    console.log(`
\u{1F9E0} Amneshia Self-Updater (Current: v${currentVersion})`);
    console.log("--------------------------------------------------");
    const result = await performUpdate({
      currentVersion,
      force: Boolean(cmdOpts.force),
      onProgress: (msg) => console.log(`  \u2022 ${msg}`)
    });
    console.log(`
${result.message}`);
  } catch (err) {
    console.error(`
\u274C Update failed: ${err.message}`);
    process.exit(1);
  }
});
async function runDefault() {
  const options = program.opts();
  const isBackground = options.background || options.daemon;
  const isHttpEnabled = options.dashboard !== false && options.http !== false;
  const toolProfile = options.toolProfile === "full" ? "full" : "core";
  if (isBackground) {
    if (!isHttpEnabled) {
      console.error("[Amneshia] Error: Background mode requires dashboard to be enabled.");
      process.exit(1);
    }
    const logDir = path14.join(os7.homedir(), ".amneshia");
    fs13.mkdirSync(logDir, { recursive: true });
    const logFile = path14.join(logDir, "server.log");
    const out = fs13.openSync(logFile, "a");
    const err = fs13.openSync(logFile, "a");
    const args = process.argv.slice(2).filter((arg) => arg !== "--daemon" && arg !== "-d" && arg !== "--background" && arg !== "-b");
    const child = spawn(process.argv[0], [process.argv[1], ...args], {
      detached: true,
      stdio: ["ignore", out, err]
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
    port: options.port
  });
}
await program.parseAsync(process.argv).catch((err) => {
  console.error("[Amneshia] Fatal error:", err);
  process.exit(1);
});
