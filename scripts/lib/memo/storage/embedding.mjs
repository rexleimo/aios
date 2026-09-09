import { createHash } from 'node:crypto';

import { tokenizeForMatch } from './query.mjs';

/* A4 optional local embedding stage. The default embedder is a deterministic
 * hashed bag-of-tokens projection ("hash-lexical"): it approximates lexical
 * similarity, runs fully in-process with zero dependencies, and never phones
 * home. It is a coarse prefilter — the token/BM25 re-rank stays the judge.
 * The interface (name + async embedText -> Float32Array, L2-normalized) is
 * the seam for a real local model later; anything satisfying it can be
 * injected through searchMemoEvents({ embedder }). */

export const EMBEDDER_ENV_VAR = 'AIOS_MEMO_EMBEDDER';
export const HASH_LEXICAL_EMBEDDER = 'hash-lexical';

export function createHashLexicalEmbedder({ dims = 256 } = {}) {
  const buckets = Math.min(4096, Math.max(16, Math.floor(Number(dims) || 256)));
  return {
    name: HASH_LEXICAL_EMBEDDER,
    dims: buckets,
    async embedText(text) {
      const vector = new Float32Array(buckets);
      for (const token of tokenizeForMatch(String(text || ''))) {
        const digest = createHash('sha256').update(token, 'utf8').digest();
        const bucket = digest.readUInt32BE(0) % buckets;
        const sign = (digest[4] & 1) === 0 ? 1 : -1;
        vector[bucket] += sign;
      }
      let norm = 0;
      for (const value of vector) norm += value * value;
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let index = 0; index < buckets; index += 1) vector[index] /= norm;
      }
      return vector;
    },
  };
}

export function resolveEmbedderFromEnv(env = process.env) {
  const raw = String(env[EMBEDDER_ENV_VAR] || '').trim().toLowerCase();
  if (!raw || raw === 'off' || raw === 'none') return null;
  if (raw === HASH_LEXICAL_EMBEDDER) return createHashLexicalEmbedder();
  throw new Error(`${EMBEDDER_ENV_VAR} must be "${HASH_LEXICAL_EMBEDDER}" or unset (got "${raw}")`);
}

/* Inputs are L2-normalized, so the dot product is the cosine similarity. */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += a[index] * b[index];
  return dot;
}
