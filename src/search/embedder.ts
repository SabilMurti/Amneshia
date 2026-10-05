/**
 * @module
 * Local ONNX Embedding Engine for Amneshia.
 * Uses onnxruntime-web via WebAssembly for zero-native-dependency sub-millisecond embeddings.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as ortWeb from 'onnxruntime-web';
import { WordPieceTokenizer } from './tokenizer.js';

export interface EmbedderConfig {
  modelName?: string;
  modelDir?: string;
  maxSeqLength?: number;
}

export type OnnxBackend = 'native' | 'wasm';

export class LocalOnnxEmbedder {
  public static readonly DEFAULT_MODEL = 'all-MiniLM-L6-v2';
  public static readonly DIMENSIONS = 384;

  private session: any = null;
  private tokenizer: WordPieceTokenizer | null = null;
  private isInitializing: Promise<void> | null = null;
  private backend: OnnxBackend = 'wasm';
  private ort: any = ortWeb;

  private readonly modelName: string;
  private readonly modelDir: string;
  private readonly maxSeqLength: number;

  constructor(config?: EmbedderConfig) {
    this.modelName = config?.modelName || LocalOnnxEmbedder.DEFAULT_MODEL;
    this.maxSeqLength = config?.maxSeqLength || 128;
    this.modelDir = config?.modelDir || path.join(os.homedir(), '.amneshia', 'models', this.modelName);
  }

  public getModelName(): string {
    return this.modelName;
  }

  public getDimensions(): number {
    return LocalOnnxEmbedder.DIMENSIONS;
  }

  public getModelDir(): string {
    return this.modelDir;
  }

  public getBackend(): OnnxBackend {
    return this.backend;
  }

  /**
   * Ensure model and tokenizer files exist locally, or download them from HuggingFace.
   */
  public async ensureModelFiles(): Promise<{ modelPath: string; tokenizerPath: string }> {
    fs.mkdirSync(this.modelDir, { recursive: true });

    // Look for model file
    let modelPath = path.join(this.modelDir, 'onnx', 'model_quantized.onnx');
    if (!fs.existsSync(modelPath)) {
      modelPath = path.join(this.modelDir, 'model_quantized.onnx');
    }
    if (!fs.existsSync(modelPath)) {
      modelPath = path.join(this.modelDir, 'model.onnx');
    }

    const tokenizerPath = path.join(this.modelDir, 'tokenizer.json');

    const hasModel = fs.existsSync(modelPath);
    const hasTokenizer = fs.existsSync(tokenizerPath);

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
      fs.writeFileSync(tokenizerPath, buf);
    }

    if (!hasModel) {
      const targetModelPath = path.join(this.modelDir, 'model_quantized.onnx');
      const modelUrl = `https://huggingface.co/Xenova/${this.modelName}/resolve/main/onnx/model_quantized.onnx`;
      console.log(`[Amneshia Embedder] Fetching model_quantized.onnx (~23MB)...`);
      const resp = await fetch(modelUrl);
      if (!resp.ok) throw new Error(`Failed to download model_quantized.onnx: ${resp.statusText}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(targetModelPath, buf);
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
  public async init(): Promise<void> {
    if (this.session && this.tokenizer) return;
    if (this.isInitializing) return this.isInitializing;

    this.isInitializing = (async () => {
      const { modelPath, tokenizerPath } = await this.ensureModelFiles();

      const isAndroid = process.platform === 'android' || Boolean(process.env.TERMUX_VERSION);
      let loadedOrt: any = null;
      let selectedBackend: OnnxBackend = 'wasm';

      // 1. Attempt native ONNX runtime on PC (Linux/macOS/Windows)
      if (!isAndroid) {
        try {
          const nodeOrt = await import('onnxruntime-node');
          loadedOrt = nodeOrt.default || nodeOrt;
          selectedBackend = 'native';
        } catch {
          // onnxruntime-node not installed; fall through to WASM
        }
      }

      // 2. WebAssembly fallback (Termux / portable)
      if (!loadedOrt) {
        loadedOrt = ortWeb;
        selectedBackend = 'wasm';

        try {
          const req = createRequire(import.meta.url);
          const ortEntry = req.resolve('onnxruntime-web');
          loadedOrt.env.wasm.wasmPaths = path.dirname(ortEntry) + '/';
        } catch {
          try {
            const currentDir = path.dirname(fileURLToPath(import.meta.url));
            const candidate = path.join(currentDir, '..', 'node_modules', 'onnxruntime-web', 'dist') + '/';
            if (fs.existsSync(candidate)) {
              loadedOrt.env.wasm.wasmPaths = candidate;
            } else {
              loadedOrt.env.wasm.wasmPaths = path.join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist') + '/';
            }
          } catch {
            loadedOrt.env.wasm.wasmPaths = path.join(process.cwd(), 'node_modules', 'onnxruntime-web', 'dist') + '/';
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
  public async embed(text: string): Promise<Float32Array> {
    await this.init();

    if (!this.session || !this.tokenizer) {
      throw new Error('Embedder session not initialized.');
    }

    const { inputIds, attentionMask, tokenTypeIds } = this.tokenizer.tokenize(text);
    const seqLen = inputIds.length;

    const feeds: Record<string, any> = {
      input_ids: new this.ort.Tensor('int64', inputIds, [1, seqLen]),
      attention_mask: new this.ort.Tensor('int64', attentionMask, [1, seqLen]),
      token_type_ids: new this.ort.Tensor('int64', tokenTypeIds, [1, seqLen]),
    };

    const results = await this.session.run(feeds);
    const lastHidden = results.last_hidden_state;
    const rawData = (lastHidden.cpuData || lastHidden.data) as Float32Array;

    // Mean pooling weighted by attention mask
    const dim = LocalOnnxEmbedder.DIMENSIONS;
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

    // L2 normalization for instant cosine similarity via dot product
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
  public async embedBatch(texts: string[], concurrency = 8): Promise<Float32Array[]> {
    await this.init();
    const results: Float32Array[] = new Array(texts.length);

    const isMobile = process.platform === 'android' || Boolean(process.env.TERMUX_VERSION);
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
  public static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }
}
