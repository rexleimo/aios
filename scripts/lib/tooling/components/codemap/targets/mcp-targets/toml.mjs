// scripts/lib/tooling/components/codemap/targets/mcp-targets/toml.mjs — codex / grok 的 `[mcp_servers.*]` 落点。
//
// w5b 收编后：写盘交给 `landing-writer.mjs`（→ `clients/mcp/server-writer.mjs` 的定点手术），
// 本文件只留两件旧写入器里真正属于 codemap 的判断：
//   1. 条目形状 `{command, args, [cwd], type}` 与**键序**（TOML 段内逐键输出，键序就是字节序）；
//   2. 只有项目级配置才钉 `cwd`（写进 `~/.codex/config.toml` 的 cwd 会把 CRG 钉死在一个仓库上）。
// `parseCodexMcpServersToml` 保留：doctor 的 inspect 是纯读，不能为了探测而走写路径。
import { CRG_MCP_ALIAS } from '../../constants.mjs';
import { buildCrgMcpServerEntry, isCrgServeEntry, isProjectScopedTarget } from './entries.mjs';
import { removeTargetEntry, writeTargetEntry } from './landing-writer.mjs';

// 纯函数：转义 TOML 字符串，避免 Windows 反斜杠和引号破坏配置。
export function escapeTomlString(value) {
  return String(value || '').replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

export function parseTomlArrayStrings(raw = '') {
  const values = [];
  const regex = /"((?:\\.|[^"\\])*)"/gu;
  for (const match of String(raw || '').matchAll(regex)) {
    values.push(match[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\'));
  }
  return values;
}

export function parseCodexMcpServersToml(raw = '') {
  const servers = {};
  let currentName = '';

  for (const line of String(raw || '').split(/\r?\n/u)) {
    const sectionMatch = /^\s*\[mcp_servers\.([^\]]+)\]\s*$/u.exec(line);
    if (sectionMatch) {
      currentName = sectionMatch[1].trim().replace(/^"(.+)"$/u, '$1');
      if (currentName) {
        servers[currentName] = {};
      }
      continue;
    }

    if (!currentName) continue;
    const commandMatch = /^\s*command\s*=\s*"((?:\\.|[^"\\])*)"\s*$/u.exec(line);
    if (commandMatch) {
      servers[currentName].command = commandMatch[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
      continue;
    }
    const cwdMatch = /^\s*cwd\s*=\s*"((?:\\.|[^"\\])*)"\s*$/u.exec(line);
    if (cwdMatch) {
      servers[currentName].cwd = cwdMatch[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
      continue;
    }
    const typeMatch = /^\s*type\s*=\s*"((?:\\.|[^"\\])*)"\s*$/u.exec(line);
    if (typeMatch) {
      servers[currentName].type = typeMatch[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\');
      continue;
    }
    const argsMatch = /^\s*args\s*=\s*(\[[^\]]*\])\s*$/u.exec(line);
    if (argsMatch) {
      servers[currentName].args = parseTomlArrayStrings(argsMatch[1]);
    }
  }

  return servers;
}

/**
 * 该落点要写的条目，**键序即字节序**：`command, args, [cwd], type`。
 * 与旧 `formatCodexMcpServerToml` 逐字节一致；差别只有一处：clientKey 取目标自己的
 * （旧实现把 grok 也当 codex 构造，今天两者没有差异，但这种「碰巧一样」不该继续靠巧合成立）。
 */
export function buildCodexMcpEntry(clientKey, projectRoot, targetPath) {
  const desired = buildCrgMcpServerEntry(clientKey);
  const entry = { command: desired.command, args: desired.args };
  if (projectRoot && isProjectScopedTarget(targetPath, projectRoot)) entry.cwd = projectRoot;
  entry.type = desired.type;
  return entry;
}

/** 旧 `formatCodexMcpServerToml` 的等价物（保留文本形状，供 message/测试对照与排障）。 */
export function formatCodexMcpServerToml(clientKey, projectRoot, targetPath = '') {
  const entry = buildCodexMcpEntry(clientKey, projectRoot, targetPath);
  const lines = [`[mcp_servers.${CRG_MCP_ALIAS}]`];
  for (const [key, value] of Object.entries(entry)) {
    const rendered = Array.isArray(value)
      ? `[${value.map((part) => `"${escapeTomlString(part)}"`).join(', ')}]`
      : `"${escapeTomlString(value)}"`;
    lines.push(`${key} = ${rendered}`);
  }
  return lines.join('\n');
}

export async function upsertCodexMcpToml(target, projectRoot, { dryRun = false } = {}) {
  const entry = buildCodexMcpEntry(target.clientKey, projectRoot, target.path);
  return writeTargetEntry({ target, projectRoot, entry, dryRun });
}

export async function removeCrgFromCodexToml(target, { io = console, projectRoot = '', dryRun = false } = {}) {
  return removeTargetEntry({ target, projectRoot, io, dryRun });
}

export function inspectCodexToml(raw) {
  const servers = parseCodexMcpServersToml(raw);
  const entry = servers[CRG_MCP_ALIAS];
  return {
    exists: true,
    hasCrg: Boolean(entry),
    valid: isCrgServeEntry(entry),
    reason: entry ? 'invalid' : 'missing',
  };
}