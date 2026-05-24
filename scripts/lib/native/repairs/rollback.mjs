import path from 'node:path';
import { cp, copyFile, mkdir, rm } from 'node:fs/promises';

import { REPAIRS_ROOT_REL } from './constants.mjs';
import { normalizeRelativePath, toAbsolute } from './paths.mjs';
import { assertNativeRepairManifestKind, resolveRepairManifest, writeRepairManifest } from './manifest.mjs';

async function restoreTarget({ rootDir, repairId, target, dryRun = false }) {
  const normalizedPath = normalizeRelativePath(target.path);
  const destinationAbsPath = toAbsolute(rootDir, normalizedPath);
  const backupAbsPath = path.join(rootDir, REPAIRS_ROOT_REL, repairId, 'backup', normalizedPath);

  if (dryRun) {
    return {
      path: normalizedPath,
      action: target.existed ? 'restore' : 'remove',
    };
  }

  await rm(destinationAbsPath, { recursive: true, force: true });
  if (target.existed) {
    if (target.type === 'dir') {
      await cp(backupAbsPath, destinationAbsPath, { recursive: true, force: true, errorOnExist: false });
    } else {
      await mkdir(path.dirname(destinationAbsPath), { recursive: true });
      await copyFile(backupAbsPath, destinationAbsPath);
    }
  }

  return {
    path: normalizedPath,
    action: target.existed ? 'restored' : 'removed',
  };
}

function summarizeRollback(results) {
  return {
    total: results.length,
    restored: results.filter((item) => item.action === 'restored' || item.action === 'restore').length,
    removed: results.filter((item) => item.action === 'removed' || item.action === 'remove').length,
  };
}

export async function rollbackNativeRepair({ rootDir, repairId = 'latest', dryRun = false } = {}) {
  if (!rootDir) {
    throw new Error('rollbackNativeRepair requires rootDir');
  }

  const resolved = await resolveRepairManifest(rootDir, repairId);
  const manifest = resolved.manifest || {};
  assertNativeRepairManifestKind(manifest);
  if (manifest.dryRun) {
    throw new Error(`[repair] ${resolved.repairId} was dry-run only and has no rollback snapshot`);
  }

  const targets = Array.isArray(manifest.targets) ? [...manifest.targets] : [];
  const results = [];
  for (const target of targets) {
    results.push(await restoreTarget({
      rootDir,
      repairId: resolved.repairId,
      target,
      dryRun: Boolean(dryRun),
    }));
  }

  const summary = summarizeRollback(results);
  if (!dryRun) {
    await writeRepairManifest(resolved.manifestAbsPath, {
      ...manifest,
      rollbackHistory: [
        ...(Array.isArray(manifest.rollbackHistory) ? manifest.rollbackHistory : []),
        {
          rolledBackAt: new Date().toISOString(),
          mode: 'apply',
          summary,
        },
      ],
    });
  }

  return {
    ok: true,
    repairId: resolved.repairId,
    manifestRelPath: resolved.manifestRelPath,
    dryRun: Boolean(dryRun),
    summary,
    entries: results,
  };
}
