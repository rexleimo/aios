import crypto from 'node:crypto';
import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';

import { normalizeRelativePath, toAbsolute } from './paths.mjs';

export function formatRepairId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const random = crypto.randomBytes(3).toString('hex');
  return `${stamp}-${random}`;
}

function hashBuffer(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

async function snapshotPath(rootDir, relativePath, output) {
  const normalized = normalizeRelativePath(relativePath);
  const absPath = toAbsolute(rootDir, normalized);

  let details;
  try {
    details = await stat(absPath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  if (details.isDirectory()) {
    output.set(normalized, { type: 'dir' });
    const entries = await readdir(absPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      await snapshotPath(rootDir, path.join(normalized, entry.name), output);
    }
    return;
  }

  const buffer = await readFile(absPath);
  output.set(normalized, {
    type: 'file',
    hash: hashBuffer(buffer),
    sizeBytes: buffer.length,
  });
}

export async function snapshotTargets(rootDir, targets = []) {
  const snapshot = new Map();
  for (const target of targets) {
    await snapshotPath(rootDir, target, snapshot);
  }
  return snapshot;
}

export function diffSnapshots(before, after) {
  const allKeys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const entries = [];

  for (const key of allKeys) {
    const previous = before.get(key);
    const next = after.get(key);
    if (!previous && next) {
      entries.push({ path: key, change: 'added' });
      continue;
    }
    if (previous && !next) {
      entries.push({ path: key, change: 'removed' });
      continue;
    }
    if (!previous || !next) {
      continue;
    }
    if (previous.type !== next.type) {
      entries.push({ path: key, change: 'updated' });
      continue;
    }
    if (previous.type === 'file' && previous.hash !== next.hash) {
      entries.push({ path: key, change: 'updated' });
    }
  }

  return {
    entries,
    summary: {
      totalChanged: entries.length,
      added: entries.filter((item) => item.change === 'added').length,
      updated: entries.filter((item) => item.change === 'updated').length,
      removed: entries.filter((item) => item.change === 'removed').length,
    },
  };
}
