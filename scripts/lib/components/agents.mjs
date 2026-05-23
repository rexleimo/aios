import { resolveAgentTargets, syncCanonicalAgents } from '../agents/sync.mjs';

export async function installOrchestratorAgents({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  io = console,
} = {}) {
  const targets = resolveAgentTargets(client);
  if (targets.length === 0) {
    io.log(`[skip] agents skipped for unsupported client selection: ${client}`);
    return { ok: true, skipped: true, targets: [], results: [] };
  }
  const result = await syncCanonicalAgents({ rootDir, targetRootDir: projectRoot, io, targets, mode: 'install' });

  for (const item of result.results) {
    io.log(`[done] agents ${item.targetRel} -> installed=${item.installed} updated=${item.updated} skipped=${item.skipped} removed=${item.removed}`);
  }

  return result;
}

export async function uninstallOrchestratorAgents({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  io = console,
} = {}) {
  const targets = resolveAgentTargets(client);
  if (targets.length === 0) {
    io.log(`[skip] agents uninstall skipped for unsupported client selection: ${client}`);
    return { ok: true, skipped: true, targets: [], results: [] };
  }
  const result = await syncCanonicalAgents({
    rootDir,
    targetRootDir: projectRoot,
    io,
    targets,
    mode: 'uninstall',
    writeCompatibilityExport: false,
  });

  for (const item of result.results) {
    io.log(`[done] agents ${item.targetRel} -> removed=${item.removed} skipped=${item.skipped}`);
  }

  return result;
}
