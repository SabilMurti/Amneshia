/**
 * @module
 * Pure TypeScript WordPiece Tokenizer for BERT / all-MiniLM-L6-v2.
 * Zero-dependency, ultra-fast tokenization for local ONNX embeddings.
 */

import fs from 'node:fs';

export interface TokenizerVocab {
  [token: string]: number;
}

export interface EncodedTokens {
  inputIds: BigInt64Array;
  attentionMask: BigInt64Array;
  tokenTypeIds: BigInt64Array;
  tokens: string[];
}

export class WordPieceTokenizer {
  private vocab: TokenizerVocab = {};
  private unkId: number = 100;
  private clsId: number = 101;
  private sepId: number = 102;
  private padId: number = 0;
  private maxSeqLength: number = 128;

  constructor(vocabOrJsonPath?: string | TokenizerVocab, maxSeqLength = 128) {
    this.maxSeqLength = maxSeqLength;
    if (typeof vocabOrJsonPath === 'string') {
      this.loadFromJsonFile(vocabOrJsonPath);
    } else if (vocabOrJsonPath) {
      this.vocab = vocabOrJsonPath;
      this.initSpecialTokens();
    }
  }

  public loadFromJsonFile(filePath: string): void {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.model && parsed.model.vocab) {
        this.vocab = parsed.model.vocab;
      } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.vocab = parsed;
      } else {
        throw new Error('Invalid tokenizer JSON structure');
      }
      this.initSpecialTokens();
    } catch (err) {
      throw new Error(`Failed to load tokenizer vocab from ${filePath}: ${(err as Error).message}`);
    }
  }

  private initSpecialTokens(): void {
    if (this.vocab['[UNK]'] !== undefined) this.unkId = this.vocab['[UNK]'];
    if (this.vocab['[CLS]'] !== undefined) this.clsId = this.vocab['[CLS]'];
    if (this.vocab['[SEP]'] !== undefined) this.sepId = this.vocab['[SEP]'];
    if (this.vocab['[PAD]'] !== undefined) this.padId = this.vocab['[PAD]'];
  }

  public getPadId(): number {
    return this.padId;
  }

  /**
   * Normalize text by lowercasing and normalizing whitespace.
   */
  public normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accent diacritics
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Tokenize an input string into WordPiece token IDs.
   */
  public tokenize(text: string): EncodedTokens {
    const normalized = this.normalize(text);
    // Split into words and punctuation
    const words = normalized.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];

    const tokenIds: number[] = [this.clsId];
    const tokens: string[] = ['[CLS]'];

    for (const word of words) {
      if (tokenIds.length >= this.maxSeqLength - 1) {
        break;
      }

      let start = 0;
      const wordTokenIds: number[] = [];
      const wordTokens: string[] = [];
      let isBad = false;

      while (start < word.length) {
        let end = word.length;
        let matched = false;

        while (start < end) {
          const substr = word.slice(start, end);
          const piece = start === 0 ? substr : `##${substr}`;

          if (Object.prototype.hasOwnProperty.call(this.vocab, piece) && typeof this.vocab[piece] === 'number') {
            wordTokenIds.push(this.vocab[piece]);
            wordTokens.push(piece);
            start = end;
            matched = true;
            break;
          }
          end--;
        }

        if (!matched) {
          isBad = true;
          break;
        }

        if (tokenIds.length + wordTokenIds.length >= this.maxSeqLength - 1) {
          break;
        }
      }

      if (isBad) {
        tokenIds.push(this.unkId);
        tokens.push('[UNK]');
      } else {
        tokenIds.push(...wordTokenIds);
        tokens.push(...wordTokens);
      }
    }

    tokenIds.push(this.sepId);
    tokens.push('[SEP]');

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
      tokens,
    };
  }
}
