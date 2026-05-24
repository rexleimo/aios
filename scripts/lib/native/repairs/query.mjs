import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

import { MANIFEST_FILE, REPAIRS_ROOT_REL } from './constants.mjs';
import { toAbsolute } from './paths.mjs';
import { assertNativeRepairManifestKind, resolveRepairManifest } from './manifest.mjs';

function coerceSummary(raw) {
  const summary = raw && typeof raw === 'object' ? raw : {};
  return {
    totalChanged: Number(summary.totalChanged || 0),
    added: Number(summary.added || 0),
    updated: Number(summary.updated || 0),
    removed: Number(summary.removed || 0),
  };
}

function coerceRollbackHistory(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      rolledBackAt: String(item.rolledBackAt || ''),
      mode: String(item.mode || ''),
      summary: {
        total: Number(item.summary?.total || 0),
        restored: Number(item.summary?.restored || 0),
        removed: Number(item.summary?.removed || 0),
      },
    }));
}

function coerceChangedEntries(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ path: String(item.path || ''), change: String(item.change || '') }))
    .filter((item) => item.path.length > 0);
}

export function mapRepairDetail({ repairId, manifestRelPath, manifest }) {
  const rollbackHistory = coerceRollbackHistory(manifest.rollbackHistory);
  return {
    ok: true,
    repairId: String(repairId || ''),
    manifestRelPath: String(manifestRelPath || ''),
    kind: String(manifest.kind || ''),
    status: String(manifest.status || ''),
    reason: String(manifest.reason || ''),
    dryRun: Boolean(manifest.dryRun),
    createdAt: String(manifest.createdAt || ''),
    completedAt: String(manifest.completedAt || ''),
    clients: Array.isArray(manifest.clients) ? manifest.clients.map((item) => String(item || '')) : [],
    targets: Array.isArray(manifest.targets) ? manifest.targets : [],
    summary: coerceSummary(manifest.summary),
    changedEntries: coerceChangedEntries(manifest.changedEntries),
    rollbackHistory,
    rollbackCount: rollbackHistory.length,
    lastRolledBackAt: rollbackHistory.length > 0 ? rollbackHistory[rollbackHistory.length - 1].rolledBackAt : '',
  };
}

export async function getNativeRepair({ rootDir, repairId = 'latest' } = {}) {
  if (!rootDir) {
    throw new Error('getNativeRepair requires rootDir');
  }
  const resolved = await resolveRepairManifest(rootDir, repairId);
  const manifest = resolved.manifest || {};
  assertNativeRepairManifestKind(manifest);
  return mapRepairDetail({
    repairId: resolved.repairId,
    manifestRelPath: resolved.manifestRelPath,
    manifest,
  });
}

export async function listNativeRepairs({ rootDir, limit = 20 } = {}) {
  if (!rootDir) {
    throw new Error('listNativeRepairs requires rootDir');
  }
  const maxItems = Number.isFinite(limit) && Number(limit) > 0 ? Math.floor(Number(limit)) : 20;
  const repairsRootAbs = path.join(rootDir, REPAIRS_ROOT_REL);
  let entries = [];
  try {
    entries = await readdir(repairsRootAbs, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { ok: true, repairs: [] };
    }
    throw error;
  }

  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const repairs = [];

  for (const candidate of candidates) {
    const manifestRelPath = path.join(REPAIRS_ROOT_REL, candidate, MANIFEST_FILE).split(path.sep).join('/');
    const manifestAbsPath = toAbsolute(rootDir, manifestRelPath);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestAbsPath, 'utf8'));
    } catch {
      continue;
    }
    if (manifest.kind !== 'native-repair') {
      continue;
    }
    repairs.push(mapRepairDetail({ repairId: candidate, manifestRelPath, manifest }));
    if (repairs.length >= maxItems) {
      break;
    }
  }

  return { ok: true, repairs };
}
