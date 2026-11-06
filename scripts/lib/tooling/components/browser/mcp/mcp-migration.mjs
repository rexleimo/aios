/* 中文注释：MCP 迁移只负责读写 JSON 文件并汇总结果，配置对象由 builder 模块提供。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getClientHomes } from '../../../../foundation/platform/paths.mjs';
import { isVolatileAiosRoot } from '../../../../foundation/platform/aios-runtime-root.mjs';
import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from '../constants.mjs';
import { planServerEdits } from '../../../../clients/mcp/server-writer.mjs';
import { writeFileAtomic } from '../../../../environment/fs/atomic-write.mjs';
import { BROWSER_MCP_ALIASES, LEGACY_BROWSER_ALIASES, findFirstBrowserServerEntry } from './mcp-aliases.mjs';
import { buildAuthToolsMcpServer, buildShellMcpServer } from './mcp-server-builders.mjs';
import { collectBrowserMcpMigrationTargets } from './mcp-targets.mjs';
import { migrateOneMcpToml } from './formats/mcp-toml.mjs';
import { migrateOneMcpOpencodeJson } from './formats/mcp-opencode.mjs';
import { migrateOneHermesYaml } from './formats/mcp-hermes-yaml.mjs';
import { migrateOneZcodeJsonFile } from './formats/mcp-zcode.mjs';
import { migrateOneGeminiJsonFile } from './formats/mcp-gemini.mjs';
import { resolveLocalBrowserMcpScript } from '../runtime/runtime-paths.mjs';
import { browserModeAppliesPlaywright, browserManagedServer, readSettingsFile, resolveBrowserMode } from '../modes/mcp-mode.mjs';

/* 中文注释：单文件迁移保持 alias 稳定，写盘交给通用 planner（见 clients/mcp/server-writer.mjs）。

   serversKey 支持点路径（如 zcode 的 'mcp.servers'）：逐段下钻；**只读**（不建中间层）——
   策略需要看现有条目（例如 auth 条目带过哪些 env），但探测本身不该在别人的文档里建出中间层。 */
function readServersBucket(parsed, serversKey) {
  const segments = String(serversKey || '').split('.').filter(Boolean);
  let container = parsed;
  for (const segment of segments.slice(0, -1)) {
    if (!container[segment] || typeof container[segment] !== 'object' || Array.isArray(container[segment])) return {};
    container = container[segment];
  }
  const leaf = segments[segments.length - 1] || 'mcpServers';
  const bucket = container[leaf];
  return bucket && typeof bucket === 'object' && !Array.isArray(bucket) ? bucket : {};
}

export function migrateOneMcpJsonFile(filePath, rootDir, { serversKey = 'mcpServers', mapManagedServerEntry = null, mode = undefined } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  let parsed = {};
  if (exists && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        status: 'error',
        reason: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = {};
  }

  // 只读地取现有桶（`create: false`）：策略需要看「用户的 auth 条目里带过什么 env」，
  // 但**绝不**为了让探测把中间层建进别人的文档——写路径是下面的 planner，不是这棵内存对象。
  const mcpServers = readServersBucket(parsed, serversKey);
  const existingAlias = findFirstBrowserServerEntry(mcpServers);
  // 按 mode 取托管 browser 条目：none/bsk 时为 null。
  const browserManaged = browserManagedServer(rootDir, existingAlias, {}, mode);
  const managedServers = {};
  if (browserManaged !== null) {
    managedServers[PRIMARY_BROWSER_ALIAS] = browserManaged;
  }
  managedServers[AUTH_TOOLS_ALIAS] = buildAuthToolsMcpServer(rootDir, mcpServers[AUTH_TOOLS_ALIAS]);
  managedServers[SHELL_ALIAS] = buildShellMcpServer(rootDir);
  if (typeof mapManagedServerEntry === 'function') {
    for (const alias of Object.keys(managedServers)) {
      managedServers[alias] = mapManagedServerEntry(managedServers[alias]);
    }
  }

  // 「先算后写」：算这一趟要动的条目集合（要下掉的旧别名 + 要写的托管条目），文本手术交给通用 planner。
  // 策略逐条保留：旧别名单下（与旧实现一致），主浏览器别名在 mode 不适用 playwright 时**不下掉**——
  // 四个写入器今天对此不一致（TOML 先删全部再加回，JSON/YAML/opencode 只删 legacy），
  // 这是 mode 特性自己的问题（切 none 是否应摘掉已装条目），不归收编顺手改；记在计划里待拍。
  const edits = [
    ...LEGACY_BROWSER_ALIASES.map((alias) => ({ action: 'remove', serverName: alias })),
    ...Object.entries(managedServers).map(([serverName, entry]) => ({ action: 'upsert', serverName, entry })),
  ];
  const planned = planServerEdits({
    filePath,
    // 迁移写入器自己就是这些条目形状的 owner（builder 决定字段），所以不套 CLI 的落点白名单；
    // 白名单门属于「用户点按钮装一条」的那条路径（`install-policy`）。桶路径仍取目标自己的（zcode 的点路径）。
    shape: { format: 'json', entryPath: serversKey, allowedFields: null, createIfMissing: true },
    edits,
  });
  if (planned.status === 'rejected') {
    return { status: 'error', reason: `${planned.reason}${planned.unknownFields ? `: ${planned.unknownFields.join(', ')}` : ''}` };
  }
  if (planned.status === 'unchanged') {
    return { status: 'unchanged' };
  }
  return {
    status: exists ? 'updated' : 'created',
    nextRaw: planned.text,
  };
}

function hasExplicitBrowserModeInSettings(rootDir) {
  if (!rootDir) return false;
  try {
    const settings = readSettingsFile(rootDir);
    const value = settings?.browser?.mcp;
    return typeof value === 'string' && value.length > 0;
  } catch {
    return false;
  }
}

const BROWSER_ENTRY_MARKERS = [...BROWSER_MCP_ALIASES, 'aios-mcp-proxy', 'run-local-browser-mcp'];
function targetsHaveExistingBrowser(targets) {
  for (const target of targets || []) {
    if (!target?.path) continue;
    let text = '';
    try {
      if (!fs.existsSync(target.path)) continue;
      text = fs.readFileSync(target.path, 'utf8');
    } catch {
      continue;
    }
    for (const marker of BROWSER_ENTRY_MARKERS) {
      if (text.includes(marker)) return true;
    }
  }
  return false;
}

export async function migrateBrowserMcpConfig({ rootDir, mode = null, io = console, dryRun = false, clientHomes = null, env = process.env, tmpdir = os.tmpdir() } = {}) {
  let resolvedMode = typeof mode === 'string' ? mode : resolveBrowserMode(null, { rootDir });
  const explicitMode = typeof mode === 'string' || hasExplicitBrowserModeInSettings(rootDir);

  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(env, os.homedir());
  let targets = collectBrowserMcpMigrationTargets({ rootDir, clientHomes: homes });

  /* 中文注释：易失根守卫。从 mkdtemp 物化目录发起的迁移不得写进**长期存在**的配置文件：
   * 一旦把临时路径写进 home 配置，系统回收该目录后客户端 MCP 永久失联（opencode 2.0 现场即此）。
   * 沙箱到沙箱（目标也在临时目录下）照旧允许，否则测试无法自测自己的落点。 */
  const sourceVolatile = isVolatileAiosRoot(rootDir, { env, tmpdir });
  const skipped = [];
  if (sourceVolatile) {
    const persistent = targets.filter((target) => !isVolatileAiosRoot(target.path, { env, tmpdir }));
    for (const target of persistent) {
      io.log?.(`WARN mcp-migrate refused (volatile AIOS root): ${target.path}`);
      skipped.push({ path: target.path, reason: 'volatile-root' });
    }
    targets = targets.filter((target) => isVolatileAiosRoot(target.path, { env, tmpdir }));
  }

  // 保留已有 browser：无显式选择且目标里有旧 browser 条目时，按 playwright 保留升级而不是删掉。
  // Fresh（无旧条目）保持 none（默认-off）。显式 none 尊重用户选择，照常删除。
  if (!explicitMode && resolvedMode === 'none' && targetsHaveExistingBrowser(targets)) {
    resolvedMode = 'playwright';
    io.log('[info] existing browser entry found with no explicit mode; preserving as playwright (direct) instead of dropping to none.');
  }

  // 只有选 Playwright 才要求仓库内 Node/Playwright 运行期；none/bsk 无需它。
  if (browserModeAppliesPlaywright(resolvedMode)) {
    const localMcpScript = resolveLocalBrowserMcpScript(rootDir);
    const localMcpPackage = path.join(rootDir, 'mcp-server', 'package.json');
    if (!fs.existsSync(localMcpScript)) {
      throw new Error(`repository-local browser MCP launcher not found: ${localMcpScript}`);
    }
    if (!fs.existsSync(localMcpPackage)) {
      throw new Error(`repository-local browser MCP package not found: ${localMcpPackage}`);
    }
  }

  return await applyMcpConfigMigration({ targets, rootDir, io, dryRun, mode: resolvedMode, skipped });
}

/* 中文注释：apply 阶段统一统计 created/updated/unchanged/errors，doctor 用这些数字给出修复证据。
   这是「先算后写」的后半段：每个 migrateOne* 只算不写（返回 nextRaw），本函数逐文件**写一次**——
   多个条目落进同一份配置时不会产生中间态；写盘走 writeFileAtomic（崩溃不留半截文件）。 */
export async function applyMcpConfigMigration({ targets, rootDir, io, dryRun, mode = undefined, skipped = [] }) {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  const changedPaths = [];

  for (const target of targets) {
    const absPath = path.resolve(target.path);
    let result;
    if (target.format === 'toml') {
      result = migrateOneMcpToml(absPath, rootDir, { mode });
    } else if (target.format === 'opencode-json') {
      result = migrateOneMcpOpencodeJson(absPath, rootDir, { mode });
    } else if (target.format === 'yaml') {
      result = migrateOneHermesYaml(absPath, rootDir, { mode });
    } else if (target.format === 'zcode-json') {
      result = migrateOneZcodeJsonFile(absPath, rootDir, { mode });
    } else if (target.format === 'gemini-json') {
      result = migrateOneGeminiJsonFile(absPath, rootDir, { mode });
    } else {
      result = migrateOneMcpJsonFile(absPath, rootDir, { serversKey: target.namespace, mode });
    }
    if (result.status === 'error') {
      io.log(`ERR  mcp-migrate skipped (invalid json): ${absPath}; ${result.reason}`);
      errors += 1;
      continue;
    }

    if (result.status === 'unchanged') {
      io.log(`OK   mcp-migrate unchanged: ${absPath}`);
      unchanged += 1;
      continue;
    }

    if (dryRun) {
      io.log(`PLAN mcp-migrate ${result.status}: ${absPath}`);
    } else {
      await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
      await writeFileAtomic(absPath, result.nextRaw);
      io.log(`OK   mcp-migrate ${result.status}: ${absPath}`);
    }

    changedPaths.push(absPath);
    if (result.status === 'created') created += 1;
    if (result.status === 'updated') updated += 1;
  }

  io.log(
    `mcp-migrate summary: created=${created} updated=${updated} unchanged=${unchanged} ` +
    `errors=${errors} dryRun=${dryRun ? 'true' : 'false'}`,
  );

  return {
    created,
    updated,
    unchanged,
    errors,
    dryRun,
    changedPaths,
    ...(skipped.length ? { skipped, skippedReason: 'volatile-root' } : {}),
  };
}
