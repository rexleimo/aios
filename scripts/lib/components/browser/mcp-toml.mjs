/* 中文注释：把浏览器/auth MCP server block 以 [mcp_servers.<alias>] 形式写入 codex config.toml。
   codex 读取 TOML 而非 mcp.json，故对 codex 专用此 writer；采用按段 surgical upsert，
   保留用户在 config.toml 里的其它配置（参考 codemap/mcp-targets/toml.mjs 的做法）。 */
import fs from 'node:fs';
import path from 'node:path';

import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from './constants.mjs';
import { BROWSER_MCP_ALIASES } from './mcp-aliases.mjs';
import { buildAuthToolsMcpServer, buildPreferredMcpServer, buildShellMcpServer } from './mcp-server-builders.mjs';

// 纯函数：转义 TOML 字符串，避免 Windows 反斜杠与引号破坏配置。
function escapeTomlString(value) {
  return String(value ?? '').replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// 把 {type, command, args[], env{}} 序列化为单个 [mcp_servers.alias] 段；env 用 inline table 保证整段无嵌套 [。
function serializeTomlServer(alias, server) {
  const lines = [`[mcp_servers.${alias}]`];
  if (server.type) {
    lines.push(`type = "${escapeTomlString(server.type)}"`);
  }
  lines.push(`command = "${escapeTomlString(server.command)}"`);
  const args = Array.isArray(server.args) ? server.args : [];
  lines.push(`args = [${args.map((arg) => `"${escapeTomlString(arg)}"`).join(', ')}]`);
  const env = server.env && typeof server.env === 'object' && !Array.isArray(server.env) ? server.env : {};
  const envPairs = Object.entries(env).map(([key, value]) => `"${escapeTomlString(key)}" = "${escapeTomlString(String(value))}"`);
  lines.push(`env = { ${envPairs.join(', ')} }`);
  return lines.join('\n');
}

function sectionPattern(alias) {
  return new RegExp(`(^|\\n)\\[mcp_servers\\.${escapeRegex(alias)}\\][\\s\\S]*?(?=\\n\\[|$)`, 'u');
}

function removeSection(raw, alias) {
  const pattern = sectionPattern(alias);
  if (!pattern.test(raw)) {
    return raw;
  }
  return raw.replace(pattern, '$1').replace(/\n{3,}/gu, '\n\n');
}

function unescapeTomlString(value) {
  return String(value).replace(/\\(["\\])/gu, '$1');
}

function parseTomlInlineStringTable(rawTable) {
  const parsed = {};
  const pattern = /"((?:\\.|[^"])*)"\s*=\s*"((?:\\.|[^"])*)"/gu;
  for (const match of rawTable.matchAll(pattern)) {
    parsed[unescapeTomlString(match[1])] = unescapeTomlString(match[2]);
  }
  return parsed;
}

function readExistingBrowserEnv(raw) {
  for (const alias of BROWSER_MCP_ALIASES) {
    const sectionMatch = raw.match(sectionPattern(alias));
    if (!sectionMatch) {
      continue;
    }

    const section = sectionMatch[0].replace(/^\n/u, '');
    const envLine = section
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('env = {'));
    if (!envLine) {
      return {};
    }

    const openBrace = envLine.indexOf('{');
    const closeBrace = envLine.lastIndexOf('}');
    if (openBrace === -1 || closeBrace === -1 || closeBrace <= openBrace) {
      return {};
    }

    return parseTomlInlineStringTable(envLine.slice(openBrace + 1, closeBrace));
  }

  return {};
}

/* 中文注释：返回 {status, nextRaw}，签名对齐 migrateOneMcpJsonFile，供 applyMcpConfigMigration 统一处理。
   做法：先移除我们管理的三个 alias 段，再以确定的间距重新追加，保证幂等且不破坏用户其它配置。 */
export function migrateOneMcpToml(filePath, rootDir) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';
  const existingBrowserEnv = readExistingBrowserEnv(raw);

  const managedSections = [
    serializeTomlServer(PRIMARY_BROWSER_ALIAS, buildPreferredMcpServer(rootDir, { env: existingBrowserEnv })),
    serializeTomlServer(AUTH_TOOLS_ALIAS, buildAuthToolsMcpServer(rootDir)),
    serializeTomlServer(SHELL_ALIAS, buildShellMcpServer(rootDir)),
  ];

  let base = raw;
  for (const alias of [...BROWSER_MCP_ALIASES, AUTH_TOOLS_ALIAS, SHELL_ALIAS]) {
    base = removeSection(base, alias);
  }
  base = base.replace(/\s*$/u, '');

  const body = managedSections.join('\n\n');
  const nextRaw = base ? `${base}\n\n${body}\n` : `${body}\n`;

  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }
  return { status: exists ? 'updated' : 'created', nextRaw };
}

export { serializeTomlServer, escapeTomlString };
