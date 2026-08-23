/**
 * Session owner and heartbeat records for crash reconciliation.
 *
 * The owner record lets recovery distinguish a live long-running session
 * from a dead process whose summary merely looks stale. The heartbeat is
 * best-effort and intentionally unref'ed so it never keeps Node alive.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteText } from '../../memo/storage/fs-io.mjs';
import { getSoloHarnessPaths } from '../../harness/solo-journal/paths.mjs';

const OWNER_FILE = 'owner.json';
const DEFAULT_HEARTBEAT_MS = 30_000;

function ownerPath(rootDir, sessionId) {
  return path.join(getSoloHarnessPaths({ rootDir, sessionId }).dir, OWNER_FILE);
}

async function writeOwner(rootDir, sessionId, owner) {
  const target = ownerPath(rootDir, sessionId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await atomicWriteText(target, `${JSON.stringify(owner, null, 2)}\n`);
  return owner;
}

export async function readSessionOwner(rootDir, sessionId) {
  try {
    return JSON.parse(await fs.readFile(ownerPath(rootDir, sessionId), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    return null;
  }
}

export function isProcessAlive(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}

export async function claimSessionOwner({
  rootDir,
  sessionId,
  pid = process.pid,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
} = {}) {
  if (!rootDir || !sessionId) return null;
  const owner = {
    schemaVersion: 1,
    kind: 'session-owner',
    pid,
    processStartedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  };
  await writeOwner(rootDir, sessionId, owner);
  const timer = setInterval(() => {
    writeOwner(rootDir, sessionId, { ...owner, heartbeatAt: new Date().toISOString() }).catch(() => {});
  }, Math.max(1000, heartbeatMs));
  timer.unref?.();
  return {
    owner,
    heartbeat: timer,
    async stop() {
      clearInterval(timer);
      try {
        const current = await readSessionOwner(rootDir, sessionId);
        if (current?.pid === pid && current?.processStartedAt === owner.processStartedAt) {
          await fs.rm(ownerPath(rootDir, sessionId), { force: true });
        }
      } catch {
        // Best-effort cleanup; dead PIDs are handled by reconciliation.
      }
    },
  };
}

export { DEFAULT_HEARTBEAT_MS, OWNER_FILE, ownerPath };
