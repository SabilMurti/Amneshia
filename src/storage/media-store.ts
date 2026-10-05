/**
 * @module
 * Content-Addressable Storage (CAS) engine for immutable media assets in Amneshia.
 * Purely deterministic, zero-LLM, sub-millisecond execution.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Common deterministic MIME type mapping based on file extension.
 * Eliminates external npm dependencies while providing 100% coverage for common media types.
 */
const MIME_EXTENSIONS: Record<string, string> = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  // Audio
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  // Documents & Text
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
};

/**
 * Resolves standard MIME type deterministically from file extension.
 */
export function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_EXTENSIONS[ext] || 'application/octet-stream';
}

/**
 * Computes streaming cryptographic SHA-256 digest of a file on disk.
 * Uses streaming to prevent high memory consumption on large media.
 */
export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Result of ingesting a media asset into the Content-Addressable Storage (CAS).
 */
export interface StoredMediaResult {
  sha256: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  relativePath: string;
  absolutePath: string;
  deduplicated: boolean;
}

/**
 * Shards a SHA-256 hash into a 2-tier subdirectory path (Git-object style).
 * Example: sha = "a3f89e..." -> "media/blobs/a3/f8/a3f89e...jpg"
 */
export function getShardedRelativePath(sha256: string, extension: string): string {
  const tier1 = sha256.slice(0, 2);
  const tier2 = sha256.slice(2, 4);
  const safeExt = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return path.posix.join('media', 'blobs', tier1, tier2, `${sha256}${safeExt}`);
}

/**
 * Ingests a local file into the Amneshia Content-Addressable Blob Storage.
 * - Enforces path security & file verification
 * - Computes SHA-256 cryptographic hash
 * - Copies file to sharded 2-tier blob directory
 * - Deduplicates byte-for-byte identical files
 */
export async function storeMediaAsset(
  sourceFilePath: string,
  storageRoot: string
): Promise<StoredMediaResult> {
  const resolvedSource = path.resolve(sourceFilePath);

  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Media file not found: "${sourceFilePath}"`);
  }

  const stat = fs.statSync(resolvedSource);
  if (!stat.isFile()) {
    throw new Error(`Path is not a regular file: "${sourceFilePath}"`);
  }

  const fileName = path.basename(resolvedSource);
  const ext = path.extname(resolvedSource).toLowerCase();
  const mimeType = detectMimeType(resolvedSource);
  const sha256 = await computeFileSha256(resolvedSource);

  const relativePath = getShardedRelativePath(sha256, ext);
  const absoluteDestPath = path.resolve(storageRoot, relativePath);
  const destDir = path.dirname(absoluteDestPath);

  // Security: Containment check ensuring destination cannot escape storageRoot
  const relCheck = path.relative(storageRoot, absoluteDestPath);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
    throw new Error(`Path traversal violation detected: destination escapes storage root.`);
  }

  // Ensure blob directory exists
  fs.mkdirSync(destDir, { recursive: true });

  let deduplicated = false;
  if (fs.existsSync(absoluteDestPath)) {
    deduplicated = true;
  } else {
    fs.copyFileSync(resolvedSource, absoluteDestPath);
  }

  return {
    sha256,
    mimeType,
    fileName,
    fileSize: stat.size,
    relativePath,
    absolutePath: absoluteDestPath,
    deduplicated,
  };
}
