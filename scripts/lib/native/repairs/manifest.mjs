import path from 'node:path';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

import { MANIFEST_FILE, REPAIRS_ROOT_REL, REPAIR_KIND } from './constants.mjs';
import { toAbsolute } from './paths.mjs';

export async function writeRepairManifest(manifestAbsPath, payload) {
  await mkdir(path.dirname(manifestAbsPath), { recursive: true });
  await writeFile(manifestAbsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function readRepairManifest(manifestAbsPath) {
  return JSON.parse(await readFile(manifestAbsPath, 'utf8'));
}

export async function resolveRepairManifest(rootDir, repairId = 'latest') {
  const requested = String(repairId || 'latest').trim() || 'latest';
  const repairsRootAbs = path.join(rootDir, REPAIRS_ROOT_REL);

  if (requested !== 'latest') {
    const manifestRelPath = path.join(REPAIRS_ROOT_REL, requested, MANIFEST_FILE).split(path.sep).join('/');
    const manifestAbsPath = toAbsolute(rootDir, manifestRelPath);
    const payload = await readRepairManifest(manifestAbsPath);
    return {
      repairId: requested,
      manifestAbsPath,
      manifestRelPath,
      manifest: payload,
    };
  }

  let entries = [];
  try {
    entries = await readdir(repairsRootAbs, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error('[repair] no repair history found');
    }
    throw error;
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (candidates.length === 0) {
    throw new Error('[repair] no repair history found');
  }

  for (const candidate of candidates) {
    const manifestRelPath = path.join(REPAIRS_ROOT_REL, candidate, MANIFEST_FILE).split(path.sep).join('/');
    const manifestAbsPath = toAbsolute(rootDir, manifestRelPath);
    try {
      const payload = await readRepairManifest(manifestAbsPath);
      return {
        repairId: candidate,
        manifestAbsPath,
        manifestRelPath,
        manifest: payload,
      };
    } catch {
      // 中文注释：latest 允许跳过损坏清单，继续查找更早的可恢复记录。
    }
  }

  throw new Error('[repair] no valid repair manifest found');
}

export function assertNativeRepairManifestKind(manifest) {
  if ((manifest || {}).kind !== REPAIR_KIND) {
    throw new Error(`[repair] unsupported manifest kind: ${String((manifest || {}).kind || '(missing)')}`);
  }
}
