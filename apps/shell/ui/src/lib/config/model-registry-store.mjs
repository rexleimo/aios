// Standalone UI storage: CLI archives exclude apps/, and Next must not trace scripts/.
// Interoperate with entry/registry.mjs via mkdir <canonical file>.write-lock, holding
// through verification/rollback, then rmdir. Never steal locks by age/PID; tests pin both.
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const registryHash = (text) => createHash('sha256').update(text).digest('hex');

export async function readRegistrySnapshot(file, seedFile) {
  let text;
  let seeded = false;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    text = await fs.readFile(seedFile, 'utf8');
    seeded = true;
  }
  return { file, text, seeded, hash: registryHash(text) };
}

/** Hold an atomic, cross-process directory lock through read/check/commit/verify. */
export async function withRegistryWriteLock(file, action, { timeoutMs = 5_000 } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const directory = await fs.realpath(path.dirname(file));
  const lock = path.join(directory, `${path.basename(file)}.write-lock`);
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    try {
      await fs.mkdir(lock);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (performance.now() >= deadline) {
        const locked = new Error('model registry is locked; retry later (an abandoned .write-lock requires manual recovery)');
        locked.code = 'REGISTRY_LOCKED';
        throw locked;
      }
      await delay(20);
    }
  }
  // Never steal on age/PID: a paused writer must not lose ownership mid-commit.
  try {
    return await action();
  } finally {
    await fs.rmdir(lock);
  }
}

export function assertRegistryHash(current, expectedHash) {
  if (typeof expectedHash !== 'string' || current.hash !== expectedHash) {
    const error = new Error('the registry changed since it was read; reload before saving');
    error.code = 'REGISTRY_STALE';
    throw error;
  }
}

async function replaceAtomically(file, text) {
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

/** Caller must hold the write lock and have read current inside it. */
export async function commitRegistrySnapshot(current, text, { backupDir = '', validateText = JSON.parse } = {}) {
  await validateText(text);
  let backup = null;
  if (!current.seeded && backupDir) {
    await fs.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backup = path.join(backupDir, `model-registry-${stamp}-${randomUUID()}.json`);
    await fs.writeFile(backup, current.text, { flag: 'wx', mode: 0o600 });
  }
  await replaceAtomically(current.file, text);
  let saved;
  try {
    saved = await fs.readFile(current.file, 'utf8');
  } catch (cause) {
    throw Object.assign(new Error('model registry could not be verified; disk state preserved, reload before retrying', { cause }), { code: 'REGISTRY_VERIFICATION_FAILED' });
  }
  // A non-cooperating writer may have replaced our commit. Never restore over it.
  assertRegistryHash({ hash: registryHash(saved) }, registryHash(text));
  try {
    await validateText(saved);
  } catch (cause) {
    // Async validation can yield. Roll back only if the disk still contains our bytes.
    const latest = await fs.readFile(current.file, 'utf8');
    assertRegistryHash({ hash: registryHash(latest) }, registryHash(text));
    try {
      if (current.seeded) await fs.unlink(current.file);
      else await replaceAtomically(current.file, current.text);
    } catch (rollback) {
      throw new AggregateError([cause, rollback], 'registry verification and rollback failed');
    }
    const error = new Error('model registry verification failed; previous state restored', { cause });
    error.code = 'REGISTRY_VERIFICATION_FAILED';
    throw error;
  }
  return { backup, hash: registryHash(text) };
}
