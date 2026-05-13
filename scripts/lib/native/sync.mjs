import fs from 'node:fs/promises';
import path from 'node:path';

import { syncCanonicalAgents } from '../agents/sync.mjs';
import { withRepoLock } from '../fs/repo-lock.mjs';
import { syncGeneratedSkills } from '../skills/sync.mjs';
import {
  buildNativeSyncMetadata,
} from './install-metadata.mjs';
import { renderClaudeNativeOutputs } from './emitters/claude.mjs';
import { renderCodexNativeOutputs } from './emitters/codex.mjs';
import { renderGeminiNativeOutputs } from './emitters/gemini.mjs';
import { renderKiroNativeOutputs } from './emitters/kiro.mjs';
import { renderOpencodeNativeOutputs } from './emitters/opencode.mjs';
import {
  AIOS_NATIVE_BEGIN_MARK,
  AIOS_NATIVE_END_MARK,
  hasManagedMarkdownBlock,
  mergeManagedJsonFragment,
  parseJsonObject,
  removeManagedJsonFragment,
  removeManagedMarkdownBlock,
  stringifyJsonObject,
  upsertManagedMarkdownBlock,
  wrapManagedMarkdown,
} from './emitters/shared.mjs';
import { buildNativeOutputPlan, loadNativeSyncManifest, resolveNativeClients } from './source-tree.mjs';

const EMITTERS = {
  codex: renderCodexNativeOutputs,
  claude: renderClaudeNativeOutputs,
  gemini: renderGeminiNativeOutputs,
  kiro: renderKiroNativeOutputs,
  opencode: renderOpencodeNativeOutputs,
};
const SYNC_LOCK_NAME = 'native-skills-sync';

function createDefaultFsOps() {
  return {
    async readTextTarget(targetPath) {
      try {
        return await fs.readFile(targetPath, 'utf8');
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return '';
        }
        throw error;
      }
    },
    async writeTextTarget(targetPath, content) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content, 'utf8');
    },
    async removeTarget(targetPath) {
      await fs.rm(targetPath, { recursive: true, force: true });
    },
  };
}

function normalizeText(content) {
  return String(content || '').replace(/\r\n/g, '\n');
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function backupTarget(targetPath, fsOps, backups) {
  if (backups.has(targetPath)) {
    return;
  }
  const exists = await pathExists(targetPath);
  backups.set(targetPath, {
    exists,
    content: exists ? await fsOps.readTextTarget(targetPath) : '',
  });
}

async function rollbackTargets(backups, fsOps) {
  const entries = Array.from(backups.entries()).reverse();
  for (const [targetPath, backup] of entries) {
    if (backup.exists) {
      await fsOps.writeTextTarget(targetPath, backup.content);
    } else {
      await fsOps.removeTarget(targetPath);
    }
  }
}

function summarizeMutation(existsBefore, changed) {
  if (!changed) {
    return 'reused';
  }
  return existsBefore ? 'updated' : 'installed';
}

function normalizeRepairOptions(repair = {}) {
  const force = Boolean(repair && (repair.force === true || repair.forceReplaceManagedFiles === true));
  return {
    forceReplaceManagedFiles: force || Boolean(repair?.forceReplaceManagedFiles),
    resetInvalidJson: force || Boolean(repair?.resetInvalidJson),
  };
}

async function applyMarkdownBlockOperation(targetPath, content, fsOps, backups) {
  const previous = await fsOps.readTextTarget(targetPath);
  const existsBefore = previous.length > 0 || await pathExists(targetPath);
  const next = upsertManagedMarkdownBlock(previous, content);
  if (normalizeText(previous) === normalizeText(next)) {
    return 'reused';
  }
  await backupTarget(targetPath, fsOps, backups);
  await fsOps.writeTextTarget(targetPath, next);
  return summarizeMutation(existsBefore, true);
}

async function applyManagedFileOperation(targetPath, content, fsOps, backups, repair) {
  const previous = await fsOps.readTextTarget(targetPath);
  const existsBefore = previous.length > 0 || await pathExists(targetPath);
  const next = wrapManagedMarkdown(content);

  if (previous) {
    let managed = false;
    try {
      managed = hasManagedMarkdownBlock(previous);
    } catch {
      if (!repair.forceReplaceManagedFiles) {
        throw new Error(`malformed managed block: ${path.basename(targetPath)}`);
      }
    }
    if (!managed && !repair.forceReplaceManagedFiles) {
      throw new Error(`unmanaged conflict: ${path.basename(targetPath)}`);
    }
    if (managed && normalizeText(previous) === normalizeText(next)) {
      return 'reused';
    }
  }

  await backupTarget(targetPath, fsOps, backups);
  await fsOps.writeTextTarget(targetPath, next);
  return summarizeMutation(existsBefore, true);
}

async function applyJsonMergeOperation(targetPath, fragment, fsOps, backups, repair) {
  const previous = await fsOps.readTextTarget(targetPath);
  const existsBefore = previous.length > 0 || await pathExists(targetPath);
  let parsed;
  try {
    parsed = parseJsonObject(previous, targetPath);
  } catch {
    if (!repair.resetInvalidJson) {
      throw new Error(`invalid json: ${path.basename(targetPath)}`);
    }
    parsed = {};
  }
  const next = stringifyJsonObject(mergeManagedJsonFragment(parsed, fragment));
  if (normalizeText(previous) === normalizeText(next)) {
    return 'reused';
  }
  await backupTarget(targetPath, fsOps, backups);
  await fsOps.writeTextTarget(targetPath, next);
  return summarizeMutation(existsBefore, true);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjectFragment(existingObject, fragment) {
  return {
    ...(isPlainObject(existingObject) ? existingObject : {}),
    ...(isPlainObject(fragment) ? fragment : {}),
  };
}

async function applyJsonMergeObjectOperation(targetPath, targetKey, fragment, fsOps, backups, repair) {
  const previous = await fsOps.readTextTarget(targetPath);
  const existsBefore = previous.length > 0 || await pathExists(targetPath);
  let parsed;
  try {
    parsed = parseJsonObject(previous, targetPath);
  } catch {
    if (!repair.resetInvalidJson) {
      throw new Error(`invalid json: ${path.basename(targetPath)}`);
    }
    parsed = {};
  }

  const currentNode = parsed[targetKey];
  if (currentNode !== undefined && !isPlainObject(currentNode)) {
    if (!repair.resetInvalidJson) {
      throw new Error(`invalid json: ${path.basename(targetPath)}#${targetKey}`);
    }
    parsed[targetKey] = {};
  }

  const next = stringifyJsonObject({
    ...parsed,
    [targetKey]: mergeObjectFragment(parsed[targetKey], fragment),
  });
  if (normalizeText(previous) === normalizeText(next)) {
    return 'reused';
  }
  await backupTarget(targetPath, fsOps, backups);
  await fsOps.writeTextTarget(targetPath, next);
  return summarizeMutation(existsBefore, true);
}

async function removeJsonMergeObjectOperation(targetPath, targetKey, fragment, fsOps, backups) {
  const previous = await fsOps.readTextTarget(targetPath);
  if (!previous && !(await pathExists(targetPath))) {
    return 'reused';
  }

  let parsed;
  try {
    parsed = parseJsonObject(previous, targetPath);
  } catch {
    return 'reused';
  }

  const currentNode = parsed[targetKey];
  if (!isPlainObject(currentNode)) {
    return 'reused';
  }

  const nextNode = { ...currentNode };
  let changed = false;
  for (const key of Object.keys(fragment || {})) {
    if (key in nextNode) {
      delete nextNode[key];
      changed = true;
    }
  }

  if (!changed) {
    return 'reused';
  }

  const nextObject = { ...parsed };
  if (Object.keys(nextNode).length > 0) {
    nextObject[targetKey] = nextNode;
  } else {
    delete nextObject[targetKey];
  }

  const nextText = Object.keys(nextObject).length > 0 ? stringifyJsonObject(nextObject) : '';
  await backupTarget(targetPath, fsOps, backups);
  if (nextText) {
    await fsOps.writeTextTarget(targetPath, nextText);
  } else {
    await fsOps.removeTarget(targetPath);
  }
  return 'removed';
}

async function removeOperation(targetPath, kind, fsOps, backups) {
  const previous = await fsOps.readTextTarget(targetPath);
  if (!previous && !(await pathExists(targetPath))) {
    return 'reused';
  }

  if (kind === 'markdown-block') {
    if (!previous || !hasManagedMarkdownBlock(previous)) {
      return 'reused';
    }
    const next = removeManagedMarkdownBlock(previous);
    await backupTarget(targetPath, fsOps, backups);
    if (next) {
      await fsOps.writeTextTarget(targetPath, next);
    } else {
      await fsOps.removeTarget(targetPath);
    }
    return 'removed';
  }

  if (kind === 'managed-file') {
    if (!previous || !hasManagedMarkdownBlock(previous)) {
      return 'reused';
    }
    await backupTarget(targetPath, fsOps, backups);
    await fsOps.removeTarget(targetPath);
    return 'removed';
  }

  const parsed = parseJsonObject(previous, targetPath);
  if (!(parsed && typeof parsed === 'object' && 'aiosNative' in parsed)) {
    return 'reused';
  }
  const nextObject = removeManagedJsonFragment(parsed);
  const nextText = Object.keys(nextObject).length > 0 ? stringifyJsonObject(nextObject) : '';
  await backupTarget(targetPath, fsOps, backups);
  if (nextText) {
    await fsOps.writeTextTarget(targetPath, nextText);
  } else {
    await fsOps.removeTarget(targetPath);
  }
  return 'removed';
}

function resultBucket(client, tier) {
  return {
    client,
    tier,
    installed: 0,
    updated: 0,
    reused: 0,
    skipped: 0,
    removed: 0,
  };
}

async function applyRenderedOperations({ rootDir, client, mode, rendered, plan, fsOps, repair }) {
  const backups = new Map();
  const result = resultBucket(client, plan.tier);
  try {
    for (const operation of rendered.operations) {
      const targetPath = path.join(rootDir, operation.targetPath);
      let status = 'reused';

      if (mode === 'uninstall') {
        if (operation.kind === 'json-merge-object') {
          status = await removeJsonMergeObjectOperation(targetPath, operation.targetKey, operation.content, fsOps, backups);
        } else {
          status = await removeOperation(targetPath, operation.kind, fsOps, backups);
        }
      } else if (operation.kind === 'markdown-block') {
        status = await applyMarkdownBlockOperation(targetPath, operation.content, fsOps, backups);
      } else if (operation.kind === 'managed-file') {
        status = await applyManagedFileOperation(targetPath, operation.content, fsOps, backups, repair);
      } else if (operation.kind === 'json-merge') {
        status = await applyJsonMergeOperation(targetPath, operation.content, fsOps, backups, repair);
      } else if (operation.kind === 'json-merge-object') {
        status = await applyJsonMergeObjectOperation(targetPath, operation.targetKey, operation.content, fsOps, backups, repair);
      } else {
        throw new Error(`unsupported native operation: ${operation.kind}`);
      }

      result[status] += 1;
    }

    if (mode === 'uninstall') {
      const metadataPath = plan.metadataPath;
      await backupTarget(metadataPath, fsOps, backups);
      await fsOps.removeTarget(metadataPath);
    } else {
      const metadataPath = plan.metadataPath;
      const metadataText = stringifyJsonObject(buildNativeSyncMetadata({
        client,
        tier: plan.tier,
        managedTargets: rendered.managedTargets,
      }));
      await backupTarget(metadataPath, fsOps, backups);
      await fsOps.writeTextTarget(metadataPath, metadataText);
    }
  } catch (error) {
    await rollbackTargets(backups, fsOps);
    throw error;
  }

  return result;
}

async function syncNativeEnhancementsUnlocked({
  rootDir,
  client = 'all',
  mode = 'install',
  io = console,
  fsOps,
  repair = {},
} = {}) {
  const manifest = loadNativeSyncManifest(rootDir);
  const selectedClients = resolveNativeClients(client);
  const ops = fsOps ? { ...createDefaultFsOps(), ...fsOps } : createDefaultFsOps();
  const repairOptions = normalizeRepairOptions(repair);
  const results = [];

  for (const currentClient of selectedClients) {
    if (mode !== 'uninstall') {
      await syncGeneratedSkills({
        rootDir,
        io,
        surfaces: [currentClient],
        withLock: false,
      });
      if (currentClient === 'codex' || currentClient === 'claude' || currentClient === 'kiro') {
        await syncCanonicalAgents({ rootDir, io, targets: [currentClient], mode: 'install' });
      }
    }

    const plan = buildNativeOutputPlan({ rootDir, manifest, client: currentClient });
    const rendered = EMITTERS[currentClient]({ rootDir, manifest });
    const result = await applyRenderedOperations({
      rootDir,
      client: currentClient,
      mode,
      rendered,
      plan,
      fsOps: ops,
      repair: repairOptions,
    });
    results.push(result);
  }

  return {
    ok: true,
    results,
  };
}

export async function syncNativeEnhancements({
  rootDir,
  client = 'all',
  mode = 'install',
  io = console,
  fsOps,
  repair = {},
  withLock = true,
  lockOptions = {},
} = {}) {
  const run = () => syncNativeEnhancementsUnlocked({
    rootDir,
    client,
    mode,
    io,
    fsOps,
    repair,
  });
  if (!withLock) {
    return run();
  }
  return withRepoLock({ rootDir, lockName: SYNC_LOCK_NAME, io, ...lockOptions }, run);
}
