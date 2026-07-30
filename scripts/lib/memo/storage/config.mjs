import {
  DEFAULT_MEMO_STORAGE,
} from './constants.mjs';
import {
  atomicWriteText,
  readTextIfExists,
} from './fs-io.mjs';
import { normalizeMemoStorageName } from './normalizers.mjs';
import { configPath } from './paths.mjs';

export async function readConfig(workspaceRoot, { env = process.env } = {}) {
  const filePath = configPath(workspaceRoot, { env });
  const raw = await readTextIfExists(filePath);
  if (!raw.trim()) return { exists: false, active: DEFAULT_MEMO_STORAGE, path: filePath };
  try {
    const parsed = JSON.parse(raw);
    const active = normalizeMemoStorageName(parsed?.active || parsed?.storage || '');
    return { exists: true, active, path: filePath, parsed };
  } catch (error) {
    error.message = `Invalid memo storage config at ${filePath}: ${error.message}`;
    throw error;
  }
}

export async function getActiveMemoStorage(workspaceRoot, { env = process.env } = {}) {
  const config = await readConfig(workspaceRoot, { env });
  return config.active || DEFAULT_MEMO_STORAGE;
}

export async function setActiveMemoStorage(workspaceRoot, storage, { env = process.env } = {}) {
  const active = normalizeMemoStorageName(storage);
  await atomicWriteText(
    configPath(workspaceRoot, { env }),
    `${JSON.stringify({
      schemaVersion: 1,
      active,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  );
  return active;
}
