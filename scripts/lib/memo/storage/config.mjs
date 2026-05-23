import {
  DEFAULT_MEMO_STORAGE,
} from './constants.mjs';
import {
  atomicWriteText,
  readTextIfExists,
} from './fs-io.mjs';
import { normalizeMemoStorageName } from './normalizers.mjs';
import { configPath } from './paths.mjs';

export async function readConfig(workspaceRoot) {
  const filePath = configPath(workspaceRoot);
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

export async function getActiveMemoStorage(workspaceRoot) {
  const config = await readConfig(workspaceRoot);
  return config.active || DEFAULT_MEMO_STORAGE;
}

export async function setActiveMemoStorage(workspaceRoot, storage) {
  const active = normalizeMemoStorageName(storage);
  await atomicWriteText(
    configPath(workspaceRoot),
    `${JSON.stringify({
      schemaVersion: 1,
      active,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  );
  return active;
}
