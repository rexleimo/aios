import { promises as fs } from 'node:fs';
import os from 'node:os';
import {
  bumpLruCache,
  getCacheKeyPart,
  normalizeText,
  setLruCache,
} from './shared.mjs';
import { normalizeQualityGateEvent } from './quality-gate.mjs';

const DEFAULT_CHECKPOINT_TAIL_BYTES = 1_000_000;
const DEFAULT_EVENT_TAIL_BYTES = 400_000;
const CHECKPOINT_TAIL_CACHE_MAX_ENTRIES = 32;
const CHECKPOINT_TAIL_CACHE = new Map();
const EVENT_TAIL_CACHE_MAX_ENTRIES = 32;
const EVENT_TAIL_CACHE = new Map();
const JSON_READ_CACHE_MAX_ENTRIES = 64;
const JSON_READ_CACHE = new Map();

function getCheckpointTailCacheKey(filePath, maxBytes) {
  return `${getCacheKeyPart(filePath)}::${getCacheKeyPart(maxBytes)}`;
}

function getEventTailCacheKey(filePath, maxBytes) {
  return `${getCacheKeyPart(filePath)}::${getCacheKeyPart(maxBytes)}`;
}

function normalizeStatPart(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Number.isFinite(value)) return String(value);
  return '0';
}

async function statForSignature(filePath) {
  try {
    return await fs.stat(filePath, { bigint: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw error;
    }
    return await fs.stat(filePath);
  }
}

function buildFileSignature(stats = null) {
  if (!stats || typeof stats !== 'object') {
    return {
      mtime: '0',
      ctime: '0',
      size: '0',
    };
  }
  return {
    mtime: normalizeStatPart(stats.mtimeNs ?? stats.mtimeMs),
    ctime: normalizeStatPart(stats.ctimeNs ?? stats.ctimeMs),
    size: normalizeStatPart(stats.size),
  };
}

function sameFileSignature(left = null, right = null) {
  return Boolean(
    left
    && right
    && left.mtime === right.mtime
    && left.ctime === right.ctime
    && left.size === right.size
  );
}

export async function safeReadJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function safeReadJsonCached(filePath) {
  const cacheKey = normalizeText(filePath);
  if (!cacheKey) return null;

  let stats = null;
  try {
    stats = await statForSignature(filePath);
  } catch {
    JSON_READ_CACHE.delete(cacheKey);
    return null;
  }

  const signature = buildFileSignature(stats);
  const cached = JSON_READ_CACHE.get(cacheKey);
  if (cached && sameFileSignature(cached.signature, signature)) {
    const isStableMetadataFile = /(?:^|[/\\])meta\.json$/iu.test(cacheKey);
    // Windows 上同大小快速覆写可能保持相同 stat 签名；非 meta JSON 同一签名只复用一次，下一次强制刷新兜底。
    if (!isStableMetadataFile && (cached.signatureHitCount || 0) >= 1) {
      JSON_READ_CACHE.delete(cacheKey);
    } else {
      cached.signatureHitCount = (cached.signatureHitCount || 0) + 1;
      bumpLruCache(JSON_READ_CACHE, cacheKey);
      return cached.value;
    }
  }

  const value = await safeReadJson(filePath);

  setLruCache(
    JSON_READ_CACHE,
    cacheKey,
    {
      signature,
      value,
      signatureHitCount: 0,
    },
    JSON_READ_CACHE_MAX_ENTRIES
  );

  return value;
}

async function readTailText(filePath, maxBytes, stats = null) {
  try {
    const resolvedStats = stats && typeof stats === 'object' ? stats : await fs.stat(filePath);
    const size = Number(resolvedStats.size) || 0;
    if (size <= 0) return '';
    const readSize = Math.min(size, maxBytes);
    const start = size - readSize;

    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, start);
      let text = buffer.toString('utf8');
      if (start > 0) {
        const newline = text.indexOf(os.EOL) >= 0 ? text.indexOf(os.EOL) : text.indexOf('\n');
        text = newline >= 0 ? text.slice(newline + 1) : '';
      }
      return text;
    } finally {
      await handle.close();
    }
  } catch {
    return '';
  }
}

export async function readLastJsonLine(filePath, { maxBytes = DEFAULT_CHECKPOINT_TAIL_BYTES } = {}) {
  const resolvedMaxBytes = Number.isFinite(maxBytes) ? Math.max(1, Math.floor(maxBytes)) : DEFAULT_CHECKPOINT_TAIL_BYTES;
  const cacheKey = getCheckpointTailCacheKey(filePath, resolvedMaxBytes);

  let stats = null;
  try {
    stats = await statForSignature(filePath);
  } catch {
    CHECKPOINT_TAIL_CACHE.delete(cacheKey);
    return null;
  }

  const signature = buildFileSignature(stats);
  const cached = CHECKPOINT_TAIL_CACHE.get(cacheKey);
  if (cached && sameFileSignature(cached.signature, signature)) {
    bumpLruCache(CHECKPOINT_TAIL_CACHE, cacheKey);
    return cached.value;
  }

  const tail = await readTailText(filePath, resolvedMaxBytes, stats);
  let value = null;

  if (tail.trim()) {
    const lines = tail
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        value = JSON.parse(lines[index]);
        break;
      } catch {
        // 忽略尾部损坏的 JSONL 行，HUD 只展示最近一条可解析记录。
      }
    }
  }

  setLruCache(
    CHECKPOINT_TAIL_CACHE,
    cacheKey,
    {
      signature,
      value,
    },
    CHECKPOINT_TAIL_CACHE_MAX_ENTRIES
  );

  return value;
}

export async function readLatestQualityGateEvent(filePath, { maxBytes = DEFAULT_EVENT_TAIL_BYTES } = {}) {
  const resolvedMaxBytes = Number.isFinite(maxBytes) ? Math.max(1, Math.floor(maxBytes)) : DEFAULT_EVENT_TAIL_BYTES;
  const cacheKey = getEventTailCacheKey(filePath, resolvedMaxBytes);

  let stats = null;
  try {
    stats = await statForSignature(filePath);
  } catch {
    EVENT_TAIL_CACHE.delete(cacheKey);
    return null;
  }

  const signature = buildFileSignature(stats);
  const cached = EVENT_TAIL_CACHE.get(cacheKey);
  if (cached && sameFileSignature(cached.signature, signature)) {
    bumpLruCache(EVENT_TAIL_CACHE, cacheKey);
    return cached.value;
  }

  let value = null;
  const tail = await readTailText(filePath, resolvedMaxBytes, stats);
  if (tail.trim()) {
    const lines = tail
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const parsed = JSON.parse(lines[index]);
        const event = normalizeQualityGateEvent(parsed);
        if (event) {
          value = event;
          break;
        }
      } catch {
        // 忽略尾部损坏的 JSONL 行，继续向前寻找最近的质量门事件。
      }
    }
  }

  setLruCache(
    EVENT_TAIL_CACHE,
    cacheKey,
    {
      signature,
      value,
    },
    EVENT_TAIL_CACHE_MAX_ENTRIES
  );

  return value;
}

export async function readDirMtimeMs(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    const mtimeMs = Number.isFinite(stats.mtimeMs) ? Math.floor(stats.mtimeMs) : 0;
    return mtimeMs > 0 ? mtimeMs : 0;
  } catch {
    return 0;
  }
}
