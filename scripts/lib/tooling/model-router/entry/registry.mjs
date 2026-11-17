import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { writeFileAtomic } from '../../../environment/fs/atomic-write.mjs';
import nativeModelTemplates from '../../specs/registry/native-model-templates.json' with { type: 'json' };
import { clonePlain, normalizeId } from './shared.mjs';
import { migrateTargetRefs, parseTargetRef } from '../routing/targets.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..');
const BUILTIN_REL = path.join('scripts', 'lib', 'tooling', 'specs', 'registry', 'model-registry.json');

// 纯函数：磁盘 registry 的绝对路径（connect 写 clientDefaults、GUI route.ts 同源）。
export function registryFilePath({ rootDir = ROOT_DIR } = {}) {
  return path.join(rootDir, 'memory', 'specs', 'model-registry.json');
}

// Native CLI selection/aliases use reference templates, never the gateway's disk seed.
export function defaultModelRegistry() {
  return clonePlain(nativeModelTemplates);
}

function parseRegistry(text) {
  const document = JSON.parse(text);
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('registry must be a JSON object');
  }
  return document;
}

// Read fresh bytes: a cache must never hide another process's save or a broken file.
export async function loadRegistrySnapshot({ rootDir = ROOT_DIR } = {}) {
  const file = registryFilePath({ rootDir });
  let text;
  let seeded = false;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    text = await fs.readFile(path.join(rootDir, BUILTIN_REL), 'utf8');
    seeded = true;
  }
  return { file, text, seeded, hash: createHash('sha256').update(text).digest('hex'), document: parseRegistry(text) };
}

export async function loadRegistry(options = {}) {
  return (await loadRegistrySnapshot(options)).document;
}

// Native CLI dispatch cannot execute gateway groups/Auto. Never reinterpret a
// concrete ID at lookup time: only assignment boundaries decode references.
export function getNativeModelId(value, registry) {
  if (registry?.targetRefVersion === undefined) return normalizeId(value);
  const target = parseTargetRef(value, { targetRefVersion: registry?.targetRefVersion });
  if (!target) return '';
  if (target.kind !== 'model') {
    throw Object.assign(new Error(`Native model routing does not support ${target.kind} targets; use the gateway or select a concrete model`), { code: 'UNSUPPORTED_NATIVE_TARGET' });
  }
  return normalizeId(target.id);
}

export function getActiveModel(registry) {
  return getNativeModelId(registry?.activeModel, registry);
}

// Independently packaged CLI/UI share this protocol, not an import across release boundaries:
// mkdir <canonical registry parent>/<basename>.write-lock; hold until verification/rollback;
// rmdir to release. Never reclaim a lock by age or PID. Cross-process tests pin both writers.
export async function withRegistryWriteLock(file, operation) {
  const parent = path.dirname(file);
  await fs.mkdir(parent, { recursive: true });
  const lockPath = path.join(await fs.realpath(parent), `${path.basename(file)}.write-lock`);
  const started = performance.now();
  let acquired = false;
  while (!acquired) {
    try {
      await fs.mkdir(lockPath);
      acquired = true;
    } catch (cause) {
      if (cause?.code !== 'EEXIST') throw cause;
      if (performance.now() - started >= 5_000) {
        throw Object.assign(new Error('model registry is locked; retry later (an abandoned .write-lock requires manual recovery)'), { code: 'REGISTRY_LOCKED' });
      }
      await delay(20);
    }
  }
  try {
    return await operation();
  } finally {
    await fs.rmdir(lockPath);
  }
}

// expectedHash protects snapshots held across discovery; compare only under the disk lock.
export async function saveRegistryDocument(document, { backupDir = '', rootDir = ROOT_DIR, expectedHash } = {}) {
  const file = registryFilePath({ rootDir });
  return withRegistryWriteLock(file, async () => {
    const current = await loadRegistrySnapshot({ rootDir });
    if (expectedHash !== undefined && current.hash !== expectedHash) {
      throw Object.assign(new Error('the registry changed since it was read; reload before saving'), { code: 'REGISTRY_STALE' });
    }
    const text = `${JSON.stringify(migrateTargetRefs(document), null, 2)}\n`;
    parseRegistry(text);
    if (!current.seeded && backupDir) {
      await fs.mkdir(backupDir, { recursive: true });
      const backup = `model-registry-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
      await fs.writeFile(path.join(backupDir, backup), current.text, { flag: 'wx', mode: 0o600 });
    }
    await writeFileAtomic(file, text);
    let savedText;
    try {
      savedText = await fs.readFile(file, 'utf8');
    } catch (cause) {
      throw Object.assign(new Error('registry could not be verified; disk state preserved, reload before retrying', { cause }), { code: 'REGISTRY_VERIFICATION_FAILED' });
    }
    if (savedText !== text) {
      throw Object.assign(new Error('registry changed during verification; disk state preserved, reload before saving'), { code: 'REGISTRY_STALE' });
    }
    try {
      parseRegistry(savedText);
    } catch (cause) {
      // Never roll back an external replacement, including a previously absent file.
      if (await fs.readFile(file, 'utf8') !== text) {
        throw Object.assign(new Error('registry changed during verification; disk state preserved, reload before saving'), { code: 'REGISTRY_STALE' });
      }
      try {
        if (current.seeded) await fs.unlink(file);
        else await writeFileAtomic(file, current.text);
      } catch (rollback) {
        throw new AggregateError([cause, rollback], 'registry verification and rollback failed');
      }
      throw Object.assign(new Error('registry verification failed; previous state restored', { cause }), { code: 'REGISTRY_VERIFICATION_FAILED' });
    }
    return file;
  });
}
