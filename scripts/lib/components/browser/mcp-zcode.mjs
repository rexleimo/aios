/* 中文注释：ZCode MCP 配置写入模块。ZCode 的 server schema 是严格模式——
   含未知字段的 server 会被整个丢弃，因此 AIOS 写入的三个 server 必须先按
   ZCode 文档字段白名单规范化（startupTimeoutSec 秒 → timeoutMs 毫秒）。
   用户自有的 server 原样保留，不做改写。 */
import { migrateOneMcpJsonFile } from './mcp-migration.mjs';

const ZCODE_SERVER_FIELDS_ALLOWLIST = Object.freeze([
  'type', 'command', 'args', 'cwd', 'env', 'headers', 'enabled', 'timeoutMs',
]);

export function normalizeZcodeServerEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return entry;
  }
  const normalized = {};
  for (const field of ZCODE_SERVER_FIELDS_ALLOWLIST) {
    if (entry[field] !== undefined) {
      normalized[field] = entry[field];
    }
  }
  const startupSeconds = Number(entry.startupTimeoutSec);
  if (Number.isFinite(startupSeconds) && startupSeconds > 0 && normalized.timeoutMs === undefined) {
    normalized.timeoutMs = Math.round(startupSeconds * 1000);
  }
  return normalized;
}

export function migrateOneZcodeJsonFile(filePath, rootDir) {
  return migrateOneMcpJsonFile(filePath, rootDir, {
    serversKey: 'mcp.servers',
    mapManagedServerEntry: normalizeZcodeServerEntry,
  });
}
