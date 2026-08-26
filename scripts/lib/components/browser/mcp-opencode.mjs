/* 中文注释：把浏览器/auth MCP server 写入 opencode 的 opencode.json。
   opencode 用 `mcp` 命名空间 + 本地条目形状 {type:'local', command:[...], enabled, environment}，
   与 claude/gemini 的 mcpServers/stdio 形状不同，故单独一个 writer（参考 codemap 的 opencode 处理）。
   注意：`environment` 字段名依据 opencode 本地 MCP 约定;浏览器 server 需要 env，故必须落到 environment。 */
import fs from 'node:fs';

import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from './constants.mjs';
import { findFirstBrowserServerEntry, removeLegacyBrowserServerEntries } from './mcp-aliases.mjs';
import { buildAuthToolsMcpServer, buildPreferredMcpServer, buildShellMcpServer } from './mcp-server-builders.mjs';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// 把 {type:'stdio', command, args[], env{}} 形状转换为 opencode 的本地条目形状。
function toOpencodeLocalEntry(server) {
  const args = Array.isArray(server.args) ? server.args : [];
  const env = isObjectRecord(server.env) ? server.env : {};
  return {
    type: 'local',
    command: [server.command, ...args],
    enabled: true,
    environment: { ...env },
  };
}

function readExistingEnvironment(entry) {
  if (!isObjectRecord(entry)) return {};
  if (isObjectRecord(entry.environment)) return entry.environment;
  if (isObjectRecord(entry.env)) return entry.env;
  return {};
}

/* 中文注释：返回 {status, nextRaw}，签名对齐 migrateOneMcpJsonFile，供 applyMcpConfigMigration 统一处理。 */
export function migrateOneMcpOpencodeJson(filePath, rootDir) {
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
  if (!isObjectRecord(parsed)) {
    parsed = {};
  }
  if (!isObjectRecord(parsed.mcp)) {
    parsed.mcp = {};
  }

  /* 中文注释：注入全局 MCP 工具调用超时（若缺失），避免工具挂起时客户端无限等待。
     项目根 opencode.json 的 buildOpenCodeConfig 已带 mcp_timeout；
     这里保证 home 作用域的全局 opencode.json 也有同样兜底。 */
  if (!isObjectRecord(parsed.experimental)) {
    parsed.experimental = {};
  }
  if (typeof parsed.experimental.mcp_timeout !== 'number' || parsed.experimental.mcp_timeout <= 0) {
    parsed.experimental.mcp_timeout = 90_000;
  }

  const mcp = parsed.mcp;
  const existingBrowser = findFirstBrowserServerEntry(mcp);
  removeLegacyBrowserServerEntries(mcp);
  const browser = buildPreferredMcpServer(rootDir, { env: readExistingEnvironment(existingBrowser) });
  const auth = buildAuthToolsMcpServer(rootDir, { env: readExistingEnvironment(mcp[AUTH_TOOLS_ALIAS]) });
  const shell = buildShellMcpServer(rootDir);
  mcp[PRIMARY_BROWSER_ALIAS] = toOpencodeLocalEntry(browser);
  mcp[AUTH_TOOLS_ALIAS] = toOpencodeLocalEntry(auth);
  mcp[SHELL_ALIAS] = toOpencodeLocalEntry(shell);

  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }
  return { status: exists ? 'updated' : 'created', nextRaw };
}

export { toOpencodeLocalEntry };
