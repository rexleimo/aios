import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveMemoRoot } from '../../aios/state-root.mjs';
import {
  atomicWriteText,
  collectRecursiveFiles,
  hashParts,
  readTextIfExists,
} from '../../memo/storage/fs-io.mjs';
import { withMemoRootLock } from '../../memo/storage/lock.mjs';

const ARCHIVE_INDEX_SCHEMA_VERSION = 1;
const ARCHIVE_INDEX_KIND = 'memo.dream-archive-index';

function dreamRoot(rootDir, env) {
  return path.join(resolveMemoRoot(rootDir, { env }), 'dream');
}

function sourcePaths(rootDir, env) {
  const root = dreamRoot(rootDir, env);
  return {
    governancePath: path.join(root, 'governance', 'events.jsonl'),
    proposalsPath: path.join(root, 'proposals'),
  };
}

function normalizeIds(values) {
  return [...new Set((values instanceof Set ? [...values] : values || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

async function sourceSignature(filePath, { includeContent = true } = {}) {
  try {
    const stats = await fs.stat(filePath);
    return {
      exists: true,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
      contentDigest: includeContent
        ? hashParts([{ relativePath: path.basename(filePath), content: await fs.readFile(filePath, 'utf8') }])
        : '',
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { exists: false, size: 0, mtimeMs: 0, ctimeMs: 0, contentDigest: hashParts([]) };
    }
    throw error;
  }
}

async function proposalsSignature(proposalsPath, { includeContent = true } = {}) {
  try {
    const stats = await fs.stat(proposalsPath);
    if (!stats.isDirectory()) {
      return {
        exists: true,
        fileCount: 0,
        contentDigest: '',
        invalidType: true,
      };
    }
    const filePaths = await collectRecursiveFiles(proposalsPath, (filePath) => filePath.endsWith('.json'));
    const files = await Promise.all(filePaths.map(async (filePath) => {
      const stats = await fs.stat(filePath);
      const relativePath = path.relative(proposalsPath, filePath).split(path.sep).join('/');
      return {
        relativePath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        ctimeMs: stats.ctimeMs,
        ...(includeContent ? { content: await fs.readFile(filePath, 'utf8') } : {}),
      };
    }));
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const metadata = files.map(({ content, ...file }) => file);
    return {
      exists: true,
      fileCount: files.length,
      files: metadata,
      contentDigest: includeContent ? hashParts(files) : '',
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        exists: false,
        fileCount: 0,
        files: [],
        contentDigest: hashParts([]),
      };
    }
    throw error;
  }
}

function sourceTokensMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sourceTokenMetadata(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    schemaVersion: value.schemaVersion,
    governance: value.governance
      ? (({ contentDigest, ...metadata }) => metadata)(value.governance)
      : null,
    proposals: value.proposals
      ? (({ contentDigest, ...metadata }) => metadata)(value.proposals)
      : null,
  };
}

function sourceTokenMetadataMatches(left, right) {
  return JSON.stringify(sourceTokenMetadata(left)) === JSON.stringify(sourceTokenMetadata(right));
}

function normalizeIndex(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== ARCHIVE_INDEX_SCHEMA_VERSION || value.kind !== ARCHIVE_INDEX_KIND) return null;
  if (!value.sourceToken || typeof value.sourceToken !== 'object' || Array.isArray(value.sourceToken)) return null;
  if (!Array.isArray(value.archivedEventIds)) return null;
  return {
    schemaVersion: ARCHIVE_INDEX_SCHEMA_VERSION,
    kind: ARCHIVE_INDEX_KIND,
    builtAt: String(value.builtAt || ''),
    sourceToken: value.sourceToken,
    archivedEventIds: normalizeIds(value.archivedEventIds),
  };
}

export function resolveDreamArchiveIndexPath(rootDir, { env = process.env } = {}) {
  return path.join(dreamRoot(rootDir, env), 'derived', 'archive-index.json');
}

export async function readDreamArchiveSourceToken(rootDir, { env = process.env, includeContent = true } = {}) {
  const paths = sourcePaths(rootDir, env);
  return {
    schemaVersion: 2,
    governance: await sourceSignature(paths.governancePath, { includeContent }),
    proposals: await proposalsSignature(paths.proposalsPath, { includeContent }),
  };
}

async function readIndex(indexPath) {
  const raw = await readTextIfExists(indexPath);
  if (!raw.trim()) return null;
  try {
    return normalizeIndex(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function readCurrentIndex(rootDir, env, indexPath) {
  const index = await readIndex(indexPath);
  const metadataToken = await readDreamArchiveSourceToken(rootDir, { env, includeContent: false });
  if (index && sourceTokenMetadataMatches(index.sourceToken, metadataToken)) {
    return { sourceToken: index.sourceToken, index };
  }
  const sourceToken = await readDreamArchiveSourceToken(rootDir, { env, includeContent: true });
  return { sourceToken, index };
}

export async function readOrRebuildDreamArchiveIndex({
  rootDir,
  env = process.env,
  deriveArchivedEventIds,
  maxAttempts = 2,
} = {}) {
  if (!rootDir) throw new Error('readOrRebuildDreamArchiveIndex requires rootDir');
  if (typeof deriveArchivedEventIds !== 'function') {
    throw new Error('readOrRebuildDreamArchiveIndex requires deriveArchivedEventIds');
  }

  const indexPath = resolveDreamArchiveIndexPath(rootDir, { env });
  const current = await readCurrentIndex(rootDir, env, indexPath);
  if (current.index && sourceTokensMatch(current.index.sourceToken, current.sourceToken)) {
    return new Set(current.index.archivedEventIds);
  }

  return await withMemoRootLock({
    workspaceRoot: rootDir,
    lockName: 'dream-archive-index',
    env,
  }, async () => {
    const locked = await readCurrentIndex(rootDir, env, indexPath);
    if (locked.index && sourceTokensMatch(locked.index.sourceToken, locked.sourceToken)) {
      return new Set(locked.index.archivedEventIds);
    }

    const attempts = Math.max(1, Number.isFinite(Number(maxAttempts)) ? Math.floor(Number(maxAttempts)) : 2);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const before = await readDreamArchiveSourceToken(rootDir, { env });
      const archivedEventIds = normalizeIds(await deriveArchivedEventIds());
      const after = await readDreamArchiveSourceToken(rootDir, { env });
      if (!sourceTokensMatch(before, after)) continue;

      const next = {
        schemaVersion: ARCHIVE_INDEX_SCHEMA_VERSION,
        kind: ARCHIVE_INDEX_KIND,
        builtAt: new Date().toISOString(),
        sourceToken: after,
        archivedEventIds,
      };
      await atomicWriteText(indexPath, `${JSON.stringify(next, null, 2)}\n`);
      return new Set(archivedEventIds);
    }

    throw new Error('Dream archive source changed during index rebuild');
  });
}
