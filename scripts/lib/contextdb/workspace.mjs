import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class OptimisticLockError extends Error {
  constructor(expected, actual) {
    super(`Optimistic lock failed: expected version ${expected}, actual ${actual}`);
    this.name = 'OptimisticLockError';
    this.code = 'OPTIMISTIC_LOCK_FAILED';
    this.expected = expected;
    this.actual = actual;
  }
}

export function workspaceDir(workspaceRoot) {
  return path.join(
    path.resolve(workspaceRoot || process.cwd()),
    'memory',
    'workspace'
  );
}

async function writeAtomicFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp.${process.pid}.${crypto.randomUUID().slice(0, 8)}`
  );
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function createDefaultMeta() {
  return {
    schemaVersion: 1,
    workspaceVersion: 1,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: '',
    projectName: 'aios'
  };
}

export async function initWorkspace(workspaceRoot) {
  const dir = workspaceDir(workspaceRoot);
  const metaPath = path.join(dir, 'meta.json');

  try {
    const existing = await fs.readFile(metaPath, 'utf8');
    return {
      created: false,
      meta: JSON.parse(existing)
    };
  } catch {
    const meta = createDefaultMeta();
    await writeAtomicFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    return {
      created: true,
      meta
    };
  }
}

export async function readWorkspaceMeta(workspaceRoot) {
  const metaPath = path.join(workspaceDir(workspaceRoot), 'meta.json');
  const content = await fs.readFile(metaPath, 'utf8');
  return JSON.parse(content);
}

export async function writeWorkspaceMeta(workspaceRoot, updates = {}) {
  const metaPath = path.join(workspaceDir(workspaceRoot), 'meta.json');

  const current = await readWorkspaceMeta(workspaceRoot);

  if (updates.expectedVersion !== undefined && updates.expectedVersion !== current.workspaceVersion) {
    throw new OptimisticLockError(updates.expectedVersion, current.workspaceVersion);
  }

  const updated = {
    ...current,
    ...updates,
    workspaceVersion: current.workspaceVersion + 1,
    lastUpdatedAt: new Date().toISOString()
  };

  delete updated.expectedVersion;

  await writeAtomicFile(metaPath, `${JSON.stringify(updated, null, 2)}\n`);
  return updated;
}
