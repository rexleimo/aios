/* 中文注释：MCP 迁移只负责读写 JSON 文件并汇总结果，配置对象由 builder 模块提供。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getClientHomes } from '../../platform/paths.mjs';
import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from './constants.mjs';
import { BROWSER_MCP_ALIASES, findFirstBrowserServerEntry, removeLegacyBrowserServerEntries } from './mcp-aliases.mjs';
import { buildAuthToolsMcpServer, buildShellMcpServer } from './mcp-server-builders.mjs';
import { collectBrowserMcpMigrationTargets } from './mcp-targets.mjs';
import { migrateOneMcpToml } from './mcp-toml.mjs';
import { migrateOneMcpOpencodeJson } from './mcp-opencode.mjs';
import { migrateOneHermesYaml } from './mcp-hermes-yaml.mjs';
import { migrateOneZcodeJsonFile } from './mcp-zcode.mjs';
import { migrateOneGeminiJsonFile } from './mcp-gemini.mjs';
import { resolveLocalBrowserMcpScript } from './runtime-paths.mjs';
import { browserModeAppliesPlaywright, browserManagedServer, readSettingsFile, resolveBrowserMode } from './mcp-mode.mjs';

/* 中文注释：单文件迁移保持 alias 稳定，只替换 server block 内容，减少客户端侧配置漂移。
   serversKey 支持点路径（如 zcode 的 'mcp.servers'）：逐段下钻并在缺段时创建中间对象。
   mapManagedServerEntry 允许严格 schema 宿主（zcode）在落盘前规范化 AIOS 管理的
   三个 server；用户自有 server 不经过该函数，保持逐字节保留。 */
function resolveServersBucket(parsed, serversKey) {
  const segments = String(serversKey || '').split('.').filter(Boolean);
  let container = parsed;
  for (const segment of segments.slice(0, -1)) {
    if (!container[segment] || typeof container[segment] !== 'object' || Array.isArray(container[segment])) {
      container[segment] = {};
    }
    container = container[segment];
  }
  const leaf = segments[segments.length - 1] || 'mcpServers';
  if (!container[leaf] || typeof container[leaf] !== 'object' || Array.isArray(container[leaf])) {
    container[leaf] = {};
  }
  return container[leaf];
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

  const mcpServers = resolveServersBucket(parsed, serversKey);
  const existingAlias = findFirstBrowserServerEntry(mcpServers);
  removeLegacyBrowserServerEntries(mcpServers);
  // 按 mode 取托管 browser 条目：none/bsk 时为 null，writer 据此不写入该 alias（含 legacy）。
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
  Object.assign(mcpServers, managedServers);

  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }

  return {
    status: exists ? 'updated' : 'created',
    nextRaw,
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

export async function migrateBrowserMcpConfig({ rootDir, mode = null, io = console, dryRun = false, clientHomes = null } = {}) {
  let resolvedMode = typeof mode === 'string' ? mode : resolveBrowserMode(null, { rootDir });
  const explicitMode = typeof mode === 'string' || hasExplicitBrowserModeInSettings(rootDir);

  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env, os.homedir());
  const targets = collectBrowserMcpMigrationTargets({ rootDir, clientHomes: homes });

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

  return applyMcpConfigMigration({ targets, rootDir, io, dryRun, mode: resolvedMode });
}

/* 中文注释：apply 阶段统一统计 created/updated/unchanged/errors，doctor 用这些数字给出修复证据。 */
export function applyMcpConfigMigration({ targets, rootDir, io, dryRun, mode = undefined }) {
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
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, result.nextRaw, 'utf8');
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
  };
}
