import path from 'node:path';

import { syncCanonicalAgents } from '../../../../foundation/agents/sync.mjs';
import { withRepoLock } from '../../../../environment/fs/repo-lock.mjs';
import { syncGeneratedSkills } from '../../../../tooling/skills/install/sync.mjs';
import { supportsClientCapability } from '../../../../foundation/clients/registry.mjs';
import { buildNativeOutputPlan, loadNativeSyncManifest, resolveNativeClients } from '../../source-tree.mjs';

import { installContextDbSkills } from '../../../../tooling/components/skills/lifecycle/install.mjs';
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
  env = process.env,
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
        const { syncCodexHomeConfig } = await import('../../distribution/emitters/codex-config.mjs');
        const homeConfig = await syncCodexHomeConfig({ rootDir: sourceRootDir });
        io.log?.(`[codex] home config ${homeConfig.status}: ${homeConfig.path}`);
        result.codexHomeConfig = homeConfig.status;
      } catch (err) {
        io.log?.(`[warn] codex home config sync skipped: ${err.message}`);
      }
    }

    // 中文注释：Claude Code 全局 statusLine 同样是家目录路径，只能走后置步骤。
    // 卸载只收回仍然是 AIOS 写下的那个值；用户改写过就保留。
    if (currentClient === 'claude') {
      try {
        const home = mode === 'uninstall'
          ? await import('../../distribution/emitters/claude-home.mjs').then((mod) => mod.removeClaudeHomeStatusline({ rootDir: sourceRootDir, env }))
          : await import('../../distribution/emitters/claude-home.mjs').then((mod) => mod.syncClaudeHomeStatusline({ rootDir: sourceRootDir, env }));
        io.log?.(`[claude] home statusline ${home.status}${home.reason ? ` (${home.reason})` : ''}: ${home.path}`);
        result.claudeHomeStatusline = home.status;
      } catch (err) {
        io.log?.(`[warn] claude home statusline sync skipped: ${err.message}`);
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
  env = process.env,
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
    env,
  });
  if (!withLock) {
    return run();
  }
  return withRepoLock({ rootDir, lockName: SYNC_LOCK_NAME, io, ...lockOptions }, run);
}
