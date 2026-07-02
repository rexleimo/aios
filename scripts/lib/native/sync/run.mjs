import path from 'node:path';

import { syncCanonicalAgents } from '../../agents/sync.mjs';
import { withRepoLock } from '../../fs/repo-lock.mjs';
import { syncGeneratedSkills } from '../../skills/sync.mjs';
import { supportsClientCapability } from '../../clients/registry.mjs';
import { buildNativeOutputPlan, loadNativeSyncManifest, resolveNativeClients } from '../source-tree.mjs';

import { applyRenderedOperations } from './apply.mjs';
import { EMITTERS, SYNC_LOCK_NAME } from './constants.mjs';
import { areSamePath, createDefaultFsOps, normalizeRepairOptions } from './fs-ops.mjs';

export async function syncNativeEnhancementsUnlocked({
  rootDir,
  targetRootDir = rootDir,
  client = 'all',
  mode = 'install',
  io = console,
  fsOps,
  repair = {},
} = {}) {
  const sourceRootDir = path.resolve(rootDir);
  const resolvedTargetRootDir = path.resolve(targetRootDir || rootDir);
  const manifest = loadNativeSyncManifest(sourceRootDir);
  const allClients = resolveNativeClients(client);
  // Deduplicate clients that share the same metadataRoot.
  // Keep only the first client per metadataRoot to avoid overwriting each other's metadata.
  const seenRoots = new Set();
  const selectedClients = [];
  for (const c of allClients) {
    const entry = manifest.clients[c];
    const root = entry && entry.metadataRoot;
    if (!root || seenRoots.has(root)) continue;
    seenRoots.add(root);
    selectedClients.push(c);
  }
  const ops = fsOps ? { ...createDefaultFsOps(), ...fsOps } : createDefaultFsOps();
  const repairOptions = normalizeRepairOptions(repair);
  const results = [];

  for (const currentClient of selectedClients) {
    if (mode !== 'uninstall') {
      await syncGeneratedSkills({
        rootDir: sourceRootDir,
        targetRootDir: resolvedTargetRootDir,
        io,
        surfaces: [currentClient],
        withLock: false,
      });
      if (supportsClientCapability(currentClient, 'agents')) {
        await syncCanonicalAgents({
          rootDir: sourceRootDir,
          targetRootDir: resolvedTargetRootDir,
          io,
          targets: [currentClient],
          mode: 'install',
          writeCompatibilityExport: areSamePath(sourceRootDir, resolvedTargetRootDir),
        });
      }
    }

    const plan = buildNativeOutputPlan({ rootDir: resolvedTargetRootDir, manifest, client: currentClient });
    const rendered = EMITTERS[currentClient]({
      rootDir: sourceRootDir,
      manifest,
      selectedClients,
    });
    const result = await applyRenderedOperations({
      rootDir: resolvedTargetRootDir,
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
  targetRootDir = rootDir,
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
    targetRootDir,
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
