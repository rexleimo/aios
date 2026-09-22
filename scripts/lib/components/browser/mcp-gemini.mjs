/* 中文注释：Gemini CLI MCP 配置写入模块。Gemini 的 McpServerConfigSchema 是严格模式——
   含未知字段的 server 会让整份 settings.json 校验失败，gemini 启动即打印
   "Invalid configuration in ~/.gemini/settings.json ... Unrecognized key(s)" 并拒绝运行。
   因此 AIOS 写入的三个 server 必须先按 Gemini 字段白名单规范化
   （startupTimeoutSec 秒 → timeout 毫秒）。用户自有的 server 原样保留，不做改写。 */
import { migrateOneMcpJsonFile } from './mcp-migration.mjs';

/* 白名单取自 @google/gemini-cli 的 McpServerConfigSchema：
   url / type('stdio'|'sse'|'http') / trust / includeTools / excludeTools /
   command / args / cwd / env / headers / timeout(毫秒) / description / oauth。 */
const GEMINI_SERVER_FIELDS_ALLOWLIST = Object.freeze([
  'type', 'command', 'args', 'cwd', 'env', 'url', 'headers',
  'trust', 'timeout', 'description', 'includeTools', 'excludeTools',
]);

export function normalizeGeminiServerEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return entry;
  }
  const normalized = {};
  for (const field of GEMINI_SERVER_FIELDS_ALLOWLIST) {
    if (entry[field] !== undefined) {
      normalized[field] = entry[field];
    }
  }
  const startupSeconds = Number(entry.startupTimeoutSec);
  if (Number.isFinite(startupSeconds) && startupSeconds > 0 && normalized.timeout === undefined) {
    normalized.timeout = Math.round(startupSeconds * 1000);
  }
  return normalized;
}

export function migrateOneGeminiJsonFile(filePath, rootDir, { mode = undefined } = {}) {
  return migrateOneMcpJsonFile(filePath, rootDir, {
    serversKey: 'mcpServers',
    mapManagedServerEntry: normalizeGeminiServerEntry,
    mode,
  });
}
