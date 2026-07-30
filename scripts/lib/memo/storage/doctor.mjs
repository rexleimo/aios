import { getActiveMemoStorage, readConfig } from './config.mjs';
import {
  derivedDocsPath,
  fileEventsPath,
} from './paths.mjs';
import { readDerivedManifest, sourceDigest } from './derived.mjs';
import { readJsonlEvents, readSplitEvents } from './events-read.mjs';
import { pathExists } from './fs-io.mjs';
import { inspectMemoRootLocks, recoverStaleMemoRootLocks } from './lock.mjs';
import {
  normalizeEventRows,
  normalizeMemoStorageName,
} from './normalizers.mjs';

function check(id, status, detail = '') {
  return { id, status, ...(detail ? { detail } : {}) };
}

export async function runMemoStorageDoctor(workspaceRoot, {
  storage,
  repairStaleLocks = false,
  env = process.env,
} = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const checks = [];
  const config = await readConfig(workspaceRoot).catch((error) => ({ error }));
  if (config.error) {
    checks.push(check('config', 'error', config.error.message));
  } else {
    checks.push(check('config', 'ok'));
  }

  let eventCount = 0;
  if (resolvedStorage === 'file') {
    const result = await readJsonlEvents(fileEventsPath(workspaceRoot), { tolerateMalformed: true });
    eventCount = normalizeEventRows(result.events, { fallbackStorage: resolvedStorage }).length;
    checks.push(result.malformed.length > 0
      ? check('file-jsonl', 'error', `${result.malformed.length} malformed record(s)`)
      : check('file-jsonl', 'ok'));
  } else {
    const result = await readSplitEvents(workspaceRoot, { tolerateMalformed: true });
    eventCount = normalizeEventRows(result.events, { fallbackStorage: resolvedStorage }).length;
    checks.push(result.malformed.length > 0
      ? check('split-json', 'error', `${result.malformed.length} malformed record(s)`)
      : check('split-json', 'ok'));
  }

  try {
    const manifest = await readDerivedManifest(workspaceRoot, resolvedStorage);
    const docsExists = await pathExists(derivedDocsPath(workspaceRoot, resolvedStorage));
    if (!manifest) {
      checks.push(check('derived-manifest', 'warning', 'derived docs have not been built'));
    } else if (!docsExists) {
      checks.push(check('derived-manifest', 'error', 'derived docs file is missing'));
    } else {
      const currentSource = await sourceDigest(workspaceRoot, resolvedStorage);
      if (manifest?.source?.digest !== currentSource.digest) {
        checks.push(check('derived-manifest', 'error', 'derived docs are stale'));
      } else if (manifest?.records !== eventCount) {
        checks.push(check('derived-manifest', 'error', 'derived record count does not match canonical records'));
      } else {
        checks.push(check('derived-manifest', 'ok'));
      }
    }
  } catch (error) {
    checks.push(check('derived-manifest', 'error', error.message));
  }

  let lockRecovery = [];
  try {
    if (repairStaleLocks) {
      const recovery = await recoverStaleMemoRootLocks(workspaceRoot, { env });
      lockRecovery = recovery.results;
      const recovered = lockRecovery.filter((result) => result.status === 'recovered');
      const failed = lockRecovery.filter((result) => result.status === 'error');
      const skipped = lockRecovery.filter((result) => result.status === 'skipped');
      if (failed.length > 0) {
        checks.push(check('storage-lock-repair', 'error', failed.map((result) => `${result.name}: ${result.reason}`).join('; ')));
      } else if (recovered.length > 0) {
        checks.push(check('storage-lock-repair', 'ok', `quarantined stale lock(s): ${recovered.map((result) => result.name).join(', ')}`));
      } else if (skipped.length > 0) {
        checks.push(check('storage-lock-repair', 'warning', skipped.map((result) => `${result.name}: ${result.reason}`).join('; ')));
      }
    }

    const lockReport = await inspectMemoRootLocks(workspaceRoot, { env });
    const stale = lockReport.locks.filter((lock) => lock.stale);
    const malformed = lockReport.locks.filter((lock) => lock.malformed);
    if (stale.length > 0) {
      checks.push(check(
        'storage-locks',
        'warning',
        `stale lock(s) found; verify owner PIDs are gone before removing: ${stale.map((lock) => lock.path).join(', ')}`,
      ));
    } else if (malformed.length > 0) {
      checks.push(check(
        'storage-locks',
        'warning',
        `lock metadata is unreadable; inspect manually before removing: ${malformed.map((lock) => lock.path).join(', ')}`,
      ));
    } else {
      checks.push(check('storage-locks', 'ok'));
    }
  } catch (error) {
    checks.push(check('storage-locks', 'error', error.message));
  }

  return {
    ok: checks.every((item) => item.status !== 'error'),
    storage: resolvedStorage,
    checks,
    lockRecovery,
  };
}
