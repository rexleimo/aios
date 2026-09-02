import path from 'node:path';

import { syncCanonicalAgents } from '../../agents/sync.mjs';
import { withRepoLock } from '../../fs/repo-lock.mjs';
import { syncGeneratedSkills } from '../../skills/sync.mjs';
import { supportsClientCapability } from '../../clients/registry.mjs';
import { buildNativeOutputPlan, loadNativeSyncManifest, resolveNativeClients } from '../source-tree.mjs';

import { installContextDbSkills } from '../../components/skills/install.mjs';
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
  const globalInstalled = new Set(); // 避免重复写入共享 home 目录

  for (const currentClient of selectedClients) {
    if (mode !== 'uninstall') {
      await syncGeneratedSkills({
        rootDir: sourceRootDir,
        targetRootDir: resolvedTargetRootDir,
        io,
        surfaces: [currentClient],
        withLock: false,
      });

      // 全局 scope skill 安装：写入各客户端 home 目录（~/.hermes/skills/ 等），去重避免重复写入共享目录
      if (!globalInstalled.has(currentClient)) {
        globalInstalled.add(currentClient);
        try {
          await installContextDbSkills({
            rootDir: sourceRootDir,
            client: currentClient,
            scope: 'global',
            installMode: 'copy',
            io,
          });
        } catch (err) {
          io.log(`[warn] global skill install skipped for ${currentClient}: ${err.message}`);
        }
      }
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

    // 中文注释：codex 用户级 config.toml（trust 持久化 + 五大 MCP）在项目目录之外，
    // 不能走相对路径的 operations 管线，作为 codex 专属后置步骤执行。
    if (currentClient === 'codex') {
      try {
        const { syncCodexHomeConfig } = await import('../emitters/codex-config.mjs');
        const homeConfig = await syncCodexHomeConfig({ rootDir: sourceRootDir });
        io.log?.(`[codex] home config ${homeConfig.status}: ${homeConfig.path}`);
        result.codexHomeConfig = homeConfig.status;
      } catch (err) {
        io.log?.(`[warn] codex home config sync skipped: ${err.message}`);
      }
    }
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
