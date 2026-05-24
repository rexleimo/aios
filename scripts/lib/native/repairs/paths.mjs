import path from 'node:path';

export function normalizeRelativePath(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('repair path cannot be empty');
  }
  if (path.isAbsolute(raw)) {
    throw new Error(`repair path must be relative: ${raw}`);
  }
  const normalized = raw.split(path.sep).join('/');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`repair path escapes workspace: ${raw}`);
  }
  return normalized;
}

export function toAbsolute(rootDir, relativePath) {
  return path.join(rootDir, relativePath);
}
