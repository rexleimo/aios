import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { contextDbRelativePath, resolveContextDbRoot } from '../aios/state-root.mjs';
import { generateFacadeFromSession, loadFacade } from './facade.mjs';

const BOOTSTRAP_LOCK_FILE = '.async-bootstrap.lock';
const BOOTSTRAP_LOCK_TTL_MS = 60_000;

function normalizeStoredPath(value = '') {
  return String(value || '').replace(/\\/g, '/');
}

function expectedContextPacketPath(workspaceRoot, agent) {
  return normalizeStoredPath(contextDbRelativePath(workspaceRoot, 'exports', `latest-${agent}-context.md`));
}

async function shouldSkipAsyncBootstrap(workspaceRoot, agent) {
  const facadeResult = await loadFacade(workspaceRoot);
  if (!facadeResult.ok || !facadeResult.facade) {
    return false;
  }
  const facade = facadeResult.facade;
  if (facade.hasStalePack === true) {
    return false;
  }
  return normalizeStoredPath(facade.contextPacketPath) === expectedContextPacketPath(workspaceRoot, agent);
}

function lockFilePath(workspaceRoot) {
  return path.join(resolveContextDbRoot(workspaceRoot), BOOTSTRAP_LOCK_FILE);
}

async function readLockState(lockPath) {
  try {
    const text = await readFile(lockPath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

async function acquireBootstrapLock(workspaceRoot, { agent, project }) {
  const lockPath = lockFilePath(workspaceRoot);
  await mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        await handle.writeFile(`${JSON.stringify({
          schemaVersion: 1,
          agent,
          project,
          pid: process.pid,
          startedAt: new Date().toISOString(),
        }, null, 2)}\n`, 'utf8');
      } finally {
        await handle.close();
      }
      return { acquired: true, lockPath };
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') {
        throw error;
      }

      const current = await readLockState(lockPath);
      const startedAt = Date.parse(String(current?.startedAt || ''));
      const isStale = !Number.isFinite(startedAt) || (Date.now() - startedAt) > BOOTSTRAP_LOCK_TTL_MS;
      if (!isStale) {
        return { acquired: false, reason: 'busy', lockPath };
      }
      await rm(lockPath, { force: true });
    }
  }

  return { acquired: false, reason: 'busy', lockPath };
}

export async function runAsyncBootstrap(
  workspaceRoot,
  { agent, project, safeContextPack }
) {
  try {
    if (await shouldSkipAsyncBootstrap(workspaceRoot, agent)) {
      return { ok: true, skipped: true, reason: 'fresh-facade' };
    }

    const lock = await acquireBootstrapLock(workspaceRoot, { agent, project });
    if (!lock.acquired) {
      return { ok: true, skipped: true, reason: lock.reason || 'busy' };
    }

    try {
      // Re-check after locking in case another runner refreshed the facade just before us.
      if (await shouldSkipAsyncBootstrap(workspaceRoot, agent)) {
        return { ok: true, skipped: true, reason: 'fresh-facade' };
      }

      const packPath = contextDbRelativePath(workspaceRoot, 'exports', `latest-${agent}-context.md`);
      const packResult = await safeContextPack(workspaceRoot, {
        sessionId: '', // safeContextPack resolves session internally when empty
        eventLimit: 30,
        packPath,
      });

      const facade = await generateFacadeFromSession(workspaceRoot, agent, project);
      facade.hasStalePack = packResult.mode !== 'fresh';
      facade.contextPacketPath = packPath;

      const facadePath = path.join(resolveContextDbRoot(workspaceRoot), '.facade.json');
      await writeFile(facadePath, JSON.stringify(facade, null, 2) + '\n', 'utf8');
      return { ok: true, skipped: false, reason: '', facadePath };
    } finally {
      await rm(lock.lockPath, { force: true });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] async bootstrap failed: ${reason}`);
    return { ok: false, skipped: false, reason };
  }
}
