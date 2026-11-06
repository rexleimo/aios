/* 中文注释：客户端 MCP 路径修复器（stale-path repair）。
 *
 * 修的是这一类损伤：AIOS 托管条目里的绝对脚本路径指向**易失目录或已消失目录**
 * （/var/folders/…/T/aios-*、/tmp/aios-*），系统回收后客户端每次启动都连不上 MCP。
 * 现场样本：~/.config/opencode/opencode.json 的 aios-shell / aios-auth-tools，
 * 以及 ~/.codex/config.toml 的 aios-memory 托管段（该段由 codex emitter 维护）。
 *
 * 三条硬约束：
 * 1. 只在能解析出**稳定 AIOS 根**时动手；解析不出来就只报告，绝不猜 cwd——否则等于
 *    把配置写进一个新的坑。
 * 2. 范围可控：默认只碰检出 stale 的文件，`--client` 再收窄。全量 materialize 会覆盖
 *    十几个客户端配置，不适合当急救手段。
 * 3. 只重生成 AIOS 托管条目；用户自有条目由 writer 原样保留，修复器不文本改写 JSON。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  findVolatileAiosPaths,
  resolveStableAiosRoot,
} from '../../../../foundation/platform/aios-runtime-root.mjs';
import { getClientHomes } from '../../../../foundation/platform/paths.mjs';
import { AIOS_MANAGED_PATH_MARKERS } from '../constants.mjs';
import { collectClientMcpTargets } from './mcp-targets.mjs';
import { applyMcpConfigMigration } from './mcp-migration.mjs';
import { resolveBrowserMode } from '../modes/mcp-mode.mjs';
import { findDanglingOpenCodePluginEntries } from '../../../../clients/opencode/plugin-contract.mjs';

const MARKER_PATTERN = new RegExp(
  AIOS_MANAGED_PATH_MARKERS.map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|'),
  'iu',
);

/** 该 stale 路径是否属于 AIOS 自己拥有的条目（只修这些，其余交还给用户）。 */
/** 中文注释：悬空 plugin 条目判定归属 opencode 客户端模块，这里只转发（保持既有调用面）。 */
export { findDanglingOpenCodePluginEntries };

export function isAiosManagedPath(candidate) {
  return MARKER_PATTERN.test(String(candidate || ''));
}

/**
 * 扫描各客户端落点，返回含 AIOS 托管 stale 路径的文件清单（含 codex 用户级托管段）。
 * 只读。
 */
export function findStaleAiosMcpConfigs({ projectRoot = '', clientHomes = null, env = process.env, fsImpl = fs, tmpdir = os.tmpdir(), trustedRoots = [] } = {}) {
  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(env, os.homedir());
  const targets = collectClientMcpTargets({ projectRoot, clientHomes: homes });
  const stale = [];
  const unreadable = [];

  const inspect = (target) => {
    let text = '';
    try {
      if (!fsImpl.existsSync(target.path)) return null;
      text = fsImpl.readFileSync(target.path, 'utf8');
    } catch (error) {
      unreadable.push({ path: target.path, reason: error?.message || String(error) });
      return null;
    }
    const hits = findVolatileAiosPaths(text, { env, fsImpl, tmpdir, trustedRoots }).filter(isAiosManagedPath);
    if (!hits.length) return null;
    return { ...target, stalePaths: hits };
  };

  for (const target of targets) {
    const entry = inspect(target);
    if (entry) stale.push(entry);
  }

  // codex 的 trust + 五大 MCP 写在 ~/.codex/config.toml 的托管段里，由 emitter 单独维护。
  if (homes?.codex) {
    const codexPath = path.join(homes.codex, 'config.toml');
    const existing = stale.find((entry) => path.resolve(entry.path) === path.resolve(codexPath));
    if (existing) {
      /* 中文注释：同一个文件有两条写路径——[mcp_servers.*] 由迁移器写，
       * 托管块（trust + aios-memory 等）由 codex emitter 写。只走一条会漏修。 */
      existing.needsCodexHomeSync = true;
    } else {
      const entry = inspect({ path: codexPath, client: 'codex', scope: 'home', needsCodexHomeSync: true });
      if (entry) stale.push(entry);
    }
  }

  return { stale, unreadable, targetsScanned: targets.length };
}

/**
 * 主入口：把 stale 的 AIOS 托管条目重新 materialize 到稳定根。
 * 默认 dryRun=true——修复器首先是一份"看得见要改什么"的报告，其次才是一次写盘。
 */
export async function repairStaleAiosMcpPaths({
  rootDir = process.cwd(),
  env = process.env,
  clientHomes = null,
  client = 'all',
  dryRun = true,
  io = console,
  fsImpl = fs,
  tmpdir = os.tmpdir(),
} = {}) {
  const stable = resolveStableAiosRoot({ rootDir, env, fsImpl, tmpdir });
  if (!stable.root) {
    const reason = stable.volatile
      ? 'rootDir is a volatile temp dir and no stable AIOS runtime root is declared (set AIOS_ROOT_DIR)'
      : 'no AIOS runtime root found (scripts/aios.mjs missing and AIOS_ROOT_DIR unset)';
    io?.log?.(`[fail] mcp-repair refused: ${reason}`);
    return { ok: false, reason, stableRoot: null, stale: [], changedPaths: [], danglingPluginRefs: [], dryRun };
  }

  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(env, os.homedir());
  const scan = findStaleAiosMcpConfigs({
    projectRoot: stable.root,
    clientHomes: homes,
    env,
    fsImpl,
    tmpdir,
    trustedRoots: [stable.root],
  });
  let targets = scan.stale;
  if (client && client !== 'all') targets = targets.filter((entry) => entry.client === client);

  for (const entry of targets) {
    io?.log?.(`stale ${entry.client}/${entry.scope} ${entry.path} -> ${entry.stalePaths.length} path(s)`);
  }

  const dangling = targets
    .filter((entry) => entry.client === 'opencode')
    .map((entry) => findDanglingOpenCodePluginEntries(entry.path, { fsImpl }))
    .filter((entry) => entry.dropped.length);
  for (const entry of dangling) {
    for (const item of entry.dropped) {
      io?.log?.(`WARN dangling plugin reference: ${item.entry} in ${entry.file} (not removed; declare it or delete it yourself)`);
    }
  }

  if (!targets.length) {
    io?.log?.('mcp-repair: no AIOS-managed stale paths found.');
    return {
      ok: true,
      stableRoot: stable.root,
      stableRootSource: stable.source,
      stale: [],
      changedPaths: [],
      danglingPluginRefs: dangling,
      scannedRoot: stable.root,
      dryRun,
    };
  }

  /* 中文注释：写盘前逐文件备份。修复器改的是用户长期配置，出错必须能一键回滚。 */
  const backups = [];
  if (!dryRun) {
    const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace('T', '-').slice(0, 15);
    for (const entry of targets) {
      const backup = `${entry.path}.bak-${stamp}`;
      try {
        fsImpl.copyFileSync(entry.path, backup);
        backups.push(backup);
      } catch (error) {
        io?.log?.(`[fail] backup refused: ${entry.path} (${error?.message || error})`);
      }
    }
  }

  const migrationTargets = targets;
  let migration = null;
  if (migrationTargets.length) {
    migration = await applyMcpConfigMigration({
      targets: migrationTargets,
      rootDir: stable.root,
      io,
      dryRun,
      mode: resolveBrowserMode(null, { rootDir: stable.root }),
    });
  }

  let codexHome = null;
  if (targets.some((entry) => entry.needsCodexHomeSync)) {
    const { syncCodexHomeConfig } = await import('../../../../clients/native/distribution/emitters/codex-config.mjs');
    const codexPath = path.join(homes.codex, 'config.toml');
    codexHome = dryRun
      ? { status: 'planned', path: codexPath }
      : await syncCodexHomeConfig({ rootDir: stable.root, env });
    io?.log?.(`codex home config ${codexHome.status}: ${codexHome.path}`);
  }

  const changedPaths = [...(migration?.changedPaths || [])];
  if (codexHome && codexHome.status === 'updated') changedPaths.push(path.resolve(codexHome.path));

  return {
    ok: (migration?.errors || 0) === 0,
    stableRoot: stable.root,
    stableRootSource: stable.source,
    stale: targets,
    migration,
    codexHome,
    danglingPluginRefs: dangling,
    changedPaths,
    backups,
    dryRun,
    scannedRoot: stable.root,
  };
}
