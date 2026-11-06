/* 中文注释：将 MCP server block 以 YAML 格式写入 Hermes ~/.hermes/config.yaml 的 mcp_servers 段。
   采用 surgical upsert，保留用户其它配置，幂等写入。

   w5b：文本手术改经通用 planner（`planServerEdits`），本文件只保留 hermes 自己的**形状收敛**——
   剥离 `type: 'stdio'`、env 只留字符串且键排序。`yaml` 的 Document API 保证未改动节点保留原风格与注释。*/

import fs from 'node:fs';

import { parseDocument } from 'yaml';

import { planServerEdits } from '../../../../../clients/mcp/server-writer.mjs';

import {
  AUTH_TOOLS_ALIAS,
  LEGACY_HERMES_BROWSER_ALIASES,
  PRIMARY_BROWSER_ALIAS,
  SHELL_ALIAS,
} from '../../constants.mjs';
import { buildAuthToolsMcpServer, buildShellMcpServer } from '../mcp-server-builders.mjs';
import { browserManagedServer } from '../../modes/mcp-mode.mjs';

/** 把 JSON 风格的 MCP server 对象转为 Hermes YAML 兼容的 plain object（剥离 type: 'stdio'，保留 command/args/env） */
function toHermesMcpEntry(server) {
  if (!server || typeof server !== 'object') return null;
  const entry = {};
  if (server.command) entry.command = String(server.command);
  if (Array.isArray(server.args) && server.args.length > 0) {
    entry.args = server.args.map(String);
  }
  if (server.env && typeof server.env === 'object' && !Array.isArray(server.env)) {
    const envKeys = Object.keys(server.env);
    if (envKeys.length > 0) {
      entry.env = Object.fromEntries(envKeys.sort().map((k) => [k, String(server.env[k])]));
    }
  }
  return Object.keys(entry).length > 0 ? entry : null;
}
/**
 * 将 AIOS 管理的三个 MCP server 写入 Hermes config.yaml 的 mcp_servers 段。
 * 返回 `{ status, nextRaw }`（先算后写：本函数绝不写盘，写盘由 `applyMcpConfigMigration` 一次完成）。
 * @param {string} filePath - config.yaml 绝对路径
 * @param {string} rootDir - 项目根目录
 */
export function migrateOneHermesYaml(filePath, rootDir, { mode = undefined } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  const document = parseDocument(raw || '{}\n');
  if (document.errors.length > 0) {
    return { status: 'error', reason: `YAML parse failed: ${document.errors.map((error) => error.message).join('; ')}` };
  }

  // 按 mode 取托管 browser 条目：不注入为 null → 跳过该 alias（与旧实现一致：不主动摘掉已装的主条目）。
  const desired = {
    [PRIMARY_BROWSER_ALIAS]: toHermesMcpEntry(browserManagedServer(rootDir, {}, {}, mode)),
    [AUTH_TOOLS_ALIAS]: toHermesMcpEntry(buildAuthToolsMcpServer(rootDir)),
    [SHELL_ALIAS]: toHermesMcpEntry(buildShellMcpServer(rootDir)),
  };

  const planned = planServerEdits({
    filePath,
    // hermes 的条目形状由本组件的 `toHermesMcpEntry` 收敛，不套 CLI 的落点白名单。
    shape: { format: 'yaml', entryPath: 'mcp_servers', allowedFields: null, createIfMissing: true },
    edits: [
      // 旧别名总是请求删除：planner 对「本来就不在」返回 not-found 且不改字节，所以不需要先判断存在性。
      ...LEGACY_HERMES_BROWSER_ALIASES
        .filter((alias) => alias !== PRIMARY_BROWSER_ALIAS)
        .map((alias) => ({ action: 'remove', serverName: alias })),
      ...Object.entries(desired)
        .filter(([, entry]) => entry !== null)
        .map(([serverName, entry]) => ({ action: 'upsert', serverName, entry })),
    ],
  });
  if (planned.status === 'rejected') return { status: 'error', reason: planned.reason };
  if (planned.status === 'unchanged') return { status: 'unchanged' };
  if (!planned.text) return { status: 'error', reason: 'YAML serialization produced empty output' };

  return { status: exists ? 'updated' : 'created', nextRaw: planned.text };
}