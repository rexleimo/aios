import fs from 'node:fs';
import path from 'node:path';

export function findRepoRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, 'package.json');
    if (fs.existsSync(candidate)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

export function formatRunTimestamp(date) {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function slugify(value, { maxLength = 48 } = {}) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
  const fallback = normalized || 'run';
  return fallback.length <= maxLength ? fallback : fallback.slice(0, maxLength);
}

export function resolveRunRoot({ repoRoot, config }) {
  const rootName = String(config?.runRootDir || '.harness').trim() || '.harness';
  const runsName = String(config?.runsDir || 'runs').trim() || 'runs';
  return path.join(repoRoot, rootName, runsName);
}

