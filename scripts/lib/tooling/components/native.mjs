import { syncNativeEnhancements } from '../../clients/native/synchronize/sync.mjs';
import { doctorNativeEnhancements as runNativeDoctor } from '../../clients/native/health/doctor.mjs';
import { getNativeRepair, listNativeRepairs, rollbackNativeRepair } from '../../clients/native/repair/repairs.mjs';
import { checkRouteTriggerCommandsSync, syncRouteTriggerCommands } from '../../clients/native/routing/route-commands.mjs';
import { checkClaudeHomeStatusline } from '../../clients/native/distribution/emitters/claude-home.mjs';
import { resolveNativeClients } from '../../clients/native/source-tree.mjs';

// 中文注释：`all` 展开成真实客户端列表再判断，避免 `all` 被当成字面客户端 id。
function selectsClient(selection, target) {
  if (String(selection || '').trim().toLowerCase() === 'all') return true;
  try {
    return resolveNativeClients(selection).includes(target);
  } catch {
    return false;
  }
}

export async function installNativeEnhancements({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  homeMap = {},
  env = process.env,
  io = console,
} = {}) {
  const result = await syncNativeEnhancements({ rootDir, targetRootDir: projectRoot, client, mode: 'install', io, env });
  const routeResult = await syncRouteTriggerCommands({ rootDir, client, homeMap, env, mode: 'install', io });
  for (const item of result.results) {
    io.log(`[done] native ${item.client} -> installed=${item.installed} updated=${item.updated} reused=${item.reused} removed=${item.removed}`);
  }
  for (const item of routeResult.results) {
    io.log(`[done] route commands ${item.client} -> installed=${item.installed} updated=${item.updated} reused=${item.reused} skipped=${item.skipped}`);
  }
  return result;
}

export async function updateNativeEnhancements({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  homeMap = {},
  env = process.env,
  io = console,
} = {}) {
  const result = await syncNativeEnhancements({ rootDir, targetRootDir: projectRoot, client, mode: 'install', io, env });
  const routeResult = await syncRouteTriggerCommands({ rootDir, client, homeMap, env, mode: 'install', io });
  for (const item of result.results) {
    io.log(`[done] native ${item.client} -> installed=${item.installed} updated=${item.updated} reused=${item.reused} removed=${item.removed}`);
  }
  for (const item of routeResult.results) {
    io.log(`[done] route commands ${item.client} -> installed=${item.installed} updated=${item.updated} reused=${item.reused} skipped=${item.skipped}`);
  }
  return result;
}

export async function uninstallNativeEnhancements({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  homeMap = {},
  env = process.env,
  io = console,
} = {}) {
  const result = await syncNativeEnhancements({ rootDir, targetRootDir: projectRoot, client, mode: 'uninstall', io, env });
  const routeResult = await syncRouteTriggerCommands({ rootDir, client, homeMap, env, mode: 'uninstall', io });
  for (const item of result.results) {
    io.log(`[done] native ${item.client} -> removed=${item.removed} reused=${item.reused}`);
  }
  for (const item of routeResult.results) {
    io.log(`[done] route commands ${item.client} -> removed=${item.removed} reused=${item.reused} skipped=${item.skipped}`);
  }
  return result;
}

export async function doctorNativeEnhancements({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  verbose = false,
  fix = false,
  dryRun = false,
  homeMap = {},
  env = process.env,
  io = console,
} = {}) {
  const nativeResult = await runNativeDoctor({ rootDir, targetRootDir: projectRoot, client, verbose, fix, dryRun, io });
  // Claude Code 全局 statusLine 在项目之外，doctor 的项目遍历看不见它，单独探一次。
  const claudeHome = selectsClient(client, 'claude')
    ? await checkClaudeHomeStatusline({ rootDir, env }).catch((error) => ({ ok: true, skipped: error.message }))
    : { ok: true };
  if (!claudeHome.ok && fix && !dryRun) {
    const { syncClaudeHomeStatusline } = await import('../../clients/native/distribution/emitters/claude-home.mjs');
    const synced = await syncClaudeHomeStatusline({ rootDir, env });
    io.log(`[claude] home statusline ${synced.status}${synced.reason ? ` (${synced.reason})` : ''}: ${synced.path}`);
  }
  if (!claudeHome.ok) io.log(`[warn] claude home statusline: ${claudeHome.issue}`);
  let routeResult = await checkRouteTriggerCommandsSync({ rootDir, client, homeMap, env });
  if (!routeResult.ok && fix) {
    if (dryRun) {
      io.log('[plan] route commands: install managed shortcuts');
    } else {
      await syncRouteTriggerCommands({ rootDir, client, homeMap, env, mode: 'install', io });
      routeResult = await checkRouteTriggerCommandsSync({ rootDir, client, homeMap, env });
    }
  }
  if (verbose || !routeResult.ok) {
    for (const issue of routeResult.issues) {
      io.log(`[warn] route command: ${issue}`);
    }
  }
  return {
    ok: nativeResult.ok && routeResult.ok,
    effectiveWarnings: nativeResult.effectiveWarnings + (routeResult.ok ? 0 : routeResult.issues.length),
    errors: nativeResult.errors,
    issues: [...(nativeResult.issues || []), ...routeResult.issues],
  };
}

export async function rollbackNativeEnhancements({
  rootDir,
  repairId = 'latest',
  dryRun = false,
  io = console,
} = {}) {
  const result = await rollbackNativeRepair({
    rootDir,
    repairId,
    dryRun,
  });
  io.log(`[repair] rollback id=${result.repairId} dryRun=${result.dryRun}`);
  io.log(`[repair] manifest=${result.manifestRelPath}`);
  io.log(`[repair] summary total=${result.summary.total} restored=${result.summary.restored} removed=${result.summary.removed}`);
  return result;
}

function printRepairChangedEntries(io, entries = [], prefix = '[repair] changed', maxCount = 20) {
  const total = entries.length;
  io.log(`${prefix} total=${total}`);
  for (const entry of entries.slice(0, maxCount)) {
    io.log(`${prefix} file=${entry.path} (${entry.change})`);
  }
  if (total > maxCount) {
    io.log(`${prefix} ... +${total - maxCount} more`);
  }
}

export async function inspectNativeRepairHistory({
  rootDir,
  repairAction = 'list',
  repairId = 'latest',
  limit = 20,
  io = console,
} = {}) {
  const mode = String(repairAction || 'list').trim().toLowerCase();

  if (mode === 'list') {
    const result = await listNativeRepairs({ rootDir, limit });
    if (result.repairs.length === 0) {
      io.log('[repair] no repair history found');
      return result;
    }
    io.log('Native Repair History');
    io.log('---------------------');
    for (const item of result.repairs) {
      io.log(`[repair] id=${item.repairId} status=${item.status || 'unknown'} dryRun=${item.dryRun ? 'true' : 'false'}`);
      io.log(`[repair] summary changed=${item.summary.totalChanged} added=${item.summary.added} updated=${item.summary.updated} removed=${item.summary.removed}`);
      io.log(`[repair] rollbackCount=${item.rollbackCount} lastRolledBackAt=${item.lastRolledBackAt || '-'}`);
      io.log(`[repair] manifest=${item.manifestRelPath}`);
    }
    return result;
  }

  if (mode === 'show') {
    const detail = await getNativeRepair({ rootDir, repairId });
    io.log('Native Repair Detail');
    io.log('--------------------');
    io.log(`[repair] id=${detail.repairId}`);
    io.log(`[repair] manifest=${detail.manifestRelPath}`);
    io.log(`[repair] status=${detail.status || 'unknown'} dryRun=${detail.dryRun ? 'true' : 'false'} reason=${detail.reason || '-'}`);
    io.log(`[repair] clients=${detail.clients.join(', ') || '(none)'}`);
    io.log(`[repair] timeline createdAt=${detail.createdAt || '-'} completedAt=${detail.completedAt || '-'}`);
    io.log(`[repair] summary changed=${detail.summary.totalChanged} added=${detail.summary.added} updated=${detail.summary.updated} removed=${detail.summary.removed}`);
    io.log(`[repair] rollbackCount=${detail.rollbackCount} lastRolledBackAt=${detail.lastRolledBackAt || '-'}`);
    printRepairChangedEntries(io, detail.changedEntries, '[repair] changed', 30);
    return detail;
  }

  throw new Error(`Unsupported native repair action: ${mode}`);
}
