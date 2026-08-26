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

// 把 {type, command, args[], env{}} 序列化为 Codex 当前使用的父段 + env 子段。
function serializeTomlServer(alias, server) {
  const lines = [`[mcp_servers.${alias}]`];
  if (server.type) {
    lines.push(`type = "${escapeTomlString(server.type)}"`);
  }
  lines.push(`command = "${escapeTomlString(server.command)}"`);
  const args = Array.isArray(server.args) ? server.args : [];
  lines.push(`args = [${args.map((arg) => `"${escapeTomlString(arg)}"`).join(', ')}]`);
  const timeout = Number(server.startupTimeoutSec ?? 0);
  if (Number.isFinite(timeout) && timeout > 0) {
    lines.push(`startup_timeout_sec = ${timeout}`);
  }
  const env = server.env && typeof server.env === 'object' && !Array.isArray(server.env) ? server.env : {};
  const envEntries = Object.entries(env);
  if (envEntries.length > 0) {
    lines.push(
      '',
      `[mcp_servers.${alias}.env]`,
      ...envEntries.map(([key, value]) => `${formatTomlKey(key)} = "${escapeTomlString(String(value))}"`),
    );
  }
  return lines.join('\n');
}

function readTomlSectionName(line) {
  const match = /^\s*(\[+)([^\]]+)(\]+)\s*$/u.exec(line);
  if (!match || match[1].length !== match[3].length) {
    return null;
  }
  return match[2].trim();
}

function removeSection(raw, alias) {
  const kept = [];
  let removing = false;
  for (const line of String(raw).split(/\r?\n/u)) {
    const sectionName = readTomlSectionName(line);
    if (sectionName) {
      removing = isManagedMcpSection(sectionName, alias);
      if (removing) {
        continue;
      }
    }
    if (!removing) {
      kept.push(line);
    }
  }
  return kept.join('\n').replace(/\n{3,}/gu, '\n\n');
}

function unescapeTomlString(value) {
  return String(value).replace(/\\(["\\])/gu, '$1');
}

function isManagedMcpSection(sectionName, alias) {
  const root = `mcp_servers.${alias}`;
  return sectionName === root || sectionName.startsWith(`${root}.`);
}

function formatTomlKey(key) {
  const value = String(key);
  return /^[A-Za-z0-9_-]+$/u.test(value) ? value : `"${escapeTomlString(value)}"`;
}

function parseTomlInlineStringTable(rawTable) {
  const parsed = {};
  const pattern = /(?:"((?:\\.|[^"\\])*)"|([A-Za-z0-9_-]+))\s*=\s*"((?:\\.|[^"\\])*)"/gu;
  for (const match of rawTable.matchAll(pattern)) {
    const key = match[1] ?? match[2];
    parsed[unescapeTomlString(key)] = unescapeTomlString(match[3]);
  }
  return parsed;
}

function parseTomlSections(raw) {
  const sections = [];
  let current = null;
  for (const line of String(raw).split(/\r?\n/u)) {
    const name = readTomlSectionName(line);
    if (name) {
      current = { name, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

function readExistingBrowserEnv(raw) {
  for (const alias of BROWSER_MCP_ALIASES) {
    const sections = parseTomlSections(raw).filter(({ name }) => (
      name === `mcp_servers.${alias}` || name === `mcp_servers.${alias}.env`
    ));
    if (sections.length === 0) {
      continue;
    }

    const inlineEnv = {};
    const nestedEnv = {};
    for (const section of sections) {
      if (section.name === `mcp_servers.${alias}`) {
        for (const line of section.lines) {
          const envMatch = /^\s*env\s*=\s*\{([\s\S]*)\}\s*$/u.exec(line);
          if (envMatch) {
            Object.assign(inlineEnv, parseTomlInlineStringTable(envMatch[1]));
          }
        }
      } else {
        Object.assign(nestedEnv, parseTomlInlineStringTable(section.lines.join('\n')));
      }
    }
    return { ...inlineEnv, ...nestedEnv };
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
