/* 中文注释：ZCode MCP 配置写入模块。ZCode 的 server schema 是严格模式——
   含未知字段的 server 会被整个丢弃（CLI 记 config_mcp_server_invalid 警告，
   逐条丢弃、非致命），因此 AIOS 写入的 server 必须先按 ZCode 的字段白名单规范化
   （startupTimeoutSec 秒 → timeoutMs 毫秒）。
   用户自有的 server 原样保留，不做改写。

   2026-09-22 (v6.0.13)：白名单的来源钉在 ZCode CLI 运行时自己的 zod schema 上
   （安装包 resources/glm/zcode.cjs）：discriminatedUnion("type", [stdio|http|sse])，
   每个分支 .strict()，字段为
     stdio: type | command(必填) | args | cwd | env
     http/sse: type | url(必填) | headers
     公共: headers | enabled | timeoutMs | protocolVersion | oauth
   旧白名单是按 stdio 分支反推的，漏了 url / protocolVersion / oauth：一旦 AIOS 托管
   的 server 是 HTTP（例如厂商集成的文档 MCP），url 会在规范化时被删掉，之后
   ZCode 的 http 分支因缺必填 url 把整条 server 丢掉。这里补齐为 schema 全集。
   实测佐证（ZCode 自己的日志 ~/.zcode/cli/log/zcode-2026-09-2*.jsonl）：
     config.mcp_server.skipped / config_mcp_server_invalid /
     `Unrecognized key: "transport"` / mcp.servers.pencil —— 未知字段逐条丢弃；
   同一次启动里 AIOS 写的 aios-shell（type:"stdio" + timeoutMs）确实 connected。 */
import { migrateOneMcpJsonFile } from './mcp-migration.mjs';

export const ZCODE_SERVER_FIELDS_ALLOWLIST = Object.freeze([
  // stdio 分支
  'type', 'command', 'args', 'cwd', 'env',
  // http / sse 分支
  'url',
  // 公共字段
  'headers', 'enabled', 'timeoutMs', 'protocolVersion', 'oauth',
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

export function migrateOneZcodeJsonFile(filePath, rootDir, { mode = undefined } = {}) {
  return migrateOneMcpJsonFile(filePath, rootDir, {
    serversKey: 'mcp.servers',
    mapManagedServerEntry: normalizeZcodeServerEntry,
    mode,
  });
}
