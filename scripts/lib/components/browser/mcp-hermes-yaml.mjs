/* 中文注释：将 MCP server block 以 YAML 格式写入 Hermes ~/.hermes/config.yaml 的 mcp_servers 段。
   采用 surgical upsert，保留用户其它配置，幂等写入。 */

import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { parseDocument } from 'yaml';

import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from './constants.mjs';
import { buildAuthToolsMcpServer, buildPreferredMcpServer, buildShellMcpServer } from './mcp-server-builders.mjs';

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
 * @param {string} filePath - config.yaml 绝对路径
 * @param {string} rootDir - 项目根目录
 * @returns {{ status: 'created'|'updated'|'unchanged'|'error', reason?: string, nextRaw?: string }}
 */
export function migrateOneHermesYaml(filePath, rootDir) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  const document = parseDocument(raw || '{}\n');
  if (document.errors.length > 0) {
    return {
      status: 'error',
      reason: `YAML parse failed: ${document.errors.map((error) => error.message).join('; ')}`,
    };
  }

  let config = document.toJS();
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    document.contents = document.createNode({});
    config = {};
  }
  if (!config.mcp_servers || typeof config.mcp_servers !== 'object' || Array.isArray(config.mcp_servers)) {
    document.set('mcp_servers', document.createNode({}));
    config.mcp_servers = {};
  }

  const existing = config.mcp_servers;
  const desired = {
    [PRIMARY_BROWSER_ALIAS]: toHermesMcpEntry(buildPreferredMcpServer(rootDir)),
    [AUTH_TOOLS_ALIAS]: toHermesMcpEntry(buildAuthToolsMcpServer(rootDir)),
    [SHELL_ALIAS]: toHermesMcpEntry(buildShellMcpServer(rootDir)),
  };

  let changed = false;
  for (const alias of [PRIMARY_BROWSER_ALIAS, AUTH_TOOLS_ALIAS, SHELL_ALIAS]) {
    const next = desired[alias];
    if (!next) continue;
    const prev = existing[alias];
    if (!isDeepStrictEqual(prev, next)) {
      document.setIn(['mcp_servers', alias], next);
      changed = true;
    }
  }

  // 移除可能遗留的旧 browser alias
  const LEGACY_BROWSER_ALIASES = new Set(['browser-use', 'mcp-browser', 'ai-browser-use']);
  for (const legacy of LEGACY_BROWSER_ALIASES) {
    if (Object.hasOwn(existing, legacy) && legacy !== PRIMARY_BROWSER_ALIAS) {
      document.deleteIn(['mcp_servers', legacy]);
      changed = true;
    }
  }

  if (!changed) {
    return { status: 'unchanged' };
  }

  const nextRaw = String(document);
  if (!nextRaw) {
    return { status: 'error', reason: 'YAML serialization produced empty output' };
  }

  return {
    status: exists ? 'updated' : 'created',
    nextRaw,
  };
}
