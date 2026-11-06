/* 中文注释：把浏览器/auth MCP server block 以 [mcp_servers.<alias>] 形式写入 codex/grok config.toml。
   codex 读取 TOML 而非 mcp.json，故对 codex/grok 专用此 writer。

   w5b：文本手术改经通用 planner（`planServerEdits`），本文件只保留**策略**——
   条目形状（`type/command/args/startup_timeout_sec/env`，env 写成子表）、
   浏览器 env 从既有条目继承、mode 决定是否注入主浏览器条目。
   「先算后写」不变：返回 {status, nextRaw}，写盘由 `applyMcpConfigMigration` 一次完成。 */
import fs from 'node:fs';

import { planServerEdits } from '../../../../../clients/mcp/server-writer.mjs';
import { readTomlEntries } from '../../../../../clients/mcp/formats/toml-editor.mjs';

import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from '../../constants.mjs';
import { BROWSER_MCP_ALIASES, findFirstBrowserServerEntry } from '../mcp-aliases.mjs';
import { buildAuthToolsMcpServer, buildShellMcpServer } from '../mcp-server-builders.mjs';
import { browserManagedServer } from '../../modes/mcp-mode.mjs';

/**
 * {type, command, args[], env{}} → codex 的表段条目。
 * 键序即字节序：`type, command, args, startup_timeout_sec`，env 由 planner 写成一级子表
 * （`[mcp_servers.<alias>.env]`，codex 的现实形状；写成内联表会被旧用例判成形状漂移）。
 * `startupTimeoutSec` 在 codex 侧的名字就是 `startup_timeout_sec` 且**同为秒**，不换算。
 */
function toCodexTomlEntry(server) {
  const entry = {};
  if (server.type) entry.type = String(server.type);
  entry.command = String(server.command ?? '');
  entry.args = Array.isArray(server.args) ? server.args.map(String) : [];
  const timeout = Number(server.startupTimeoutSec ?? 0);
  if (Number.isFinite(timeout) && timeout > 0) entry.startup_timeout_sec = timeout;
  const env = server.env && typeof server.env === 'object' && !Array.isArray(server.env) ? server.env : {};
  const envEntries = Object.entries(env).map(([key, value]) => [key, String(value)]);
  if (envEntries.length > 0) entry.env = Object.fromEntries(envEntries);
  return entry;
}

/**
 * 返回 `{status, nextRaw}`（先算后写：本函数绝不写盘）。
 * 策略与旧实现一致：先整组下掉受管 alias（含 legacy），再以确定顺序追加受管段——
 * 于是 mode 不适用 Playwright 时主浏览器段也会消失（旧 TOML 写入器就是这么做的）。
 */
export function migrateOneMcpToml(filePath, rootDir, { mode = undefined } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  // 读既有条目只为**继承浏览器的 env**（CDP 端口/代理链这类值不能因为重写而丢）。
  // 统一走 toml-editor 的读路径：它认得内联表与 `[x.env]` 子表两种形状。
  const entries = readTomlEntries(raw, ['mcp_servers']).entries;
  const existingBrowser = findFirstBrowserServerEntry(entries);
  const browserManaged = browserManagedServer(rootDir, { env: existingBrowser?.env || {} }, {}, mode);

  const managed = {
    ...(browserManaged ? { [PRIMARY_BROWSER_ALIAS]: toCodexTomlEntry(browserManaged) } : {}),
    [AUTH_TOOLS_ALIAS]: toCodexTomlEntry(buildAuthToolsMcpServer(rootDir)),
    [SHELL_ALIAS]: toCodexTomlEntry(buildShellMcpServer(rootDir)),
  };

  const planned = planServerEdits({
    filePath,
    // 迁移写入器是这些条目形状的 owner（builder + `toCodexTomlEntry`），不套 CLI 的落点白名单。
    shape: { format: 'toml', entryPath: 'mcp_servers', allowedFields: null, createIfMissing: true },
    edits: [
      ...[...BROWSER_MCP_ALIASES, AUTH_TOOLS_ALIAS, SHELL_ALIAS].map((alias) => ({ action: 'remove', serverName: alias })),
      ...Object.entries(managed).map(([serverName, entry]) => ({ action: 'upsert', serverName, entry })),
    ],
  });
  if (planned.status === 'rejected') return { status: 'error', reason: planned.reason };
  if (planned.status === 'unchanged') return { status: 'unchanged' };
  return { status: exists ? 'updated' : 'created', nextRaw: planned.text };
}