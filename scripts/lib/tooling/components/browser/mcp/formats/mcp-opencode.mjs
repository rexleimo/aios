/* 中文注释：把浏览器/auth MCP server 写入 opencode 的 opencode.json。
   opencode 用 `mcp` 命名空间 + 本地条目形状 {type:'local', command:[...], enabled, environment}，
   与 claude/gemini 的 mcpServers/stdio 形状不同，故单独一个 writer。
   `environment` 字段名依据 opencode 本地 MCP 约定；浏览器 server 需要 env，故必须落到 environment。

   w5b：文本手术改经通用 planner（`planServerEdits`），本文件只保留**策略**——
   条目形状转换（`toOpencodeLocalEntry`）、env 从既有条目继承、桶外根键声明。
   「先算后写」不变：返回 {status, nextRaw}，写盘由 `applyMcpConfigMigration` 一次完成。 */
import fs from 'node:fs';

import { planServerEdits } from '../../../../../clients/mcp/server-writer.mjs';
import { OPENCODE_MCP_TIMEOUT_MS } from '../../../../../clients/opencode/config.mjs';

import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from '../../constants.mjs';
import { LEGACY_BROWSER_ALIASES, findFirstBrowserServerEntry } from '../mcp-aliases.mjs';
import { buildAuthToolsMcpServer, buildShellMcpServer } from '../mcp-server-builders.mjs';
import { browserManagedServer } from '../../modes/mcp-mode.mjs';

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

/** 只读地取现有的 `mcp` 桶：策略要看「用户的 auth 条目带过什么 env」，但不为探测建中间层。 */
function readOpencodeBucket(parsed) {
  return isObjectRecord(parsed.mcp) ? parsed.mcp : {};
}

/* 中文注释：返回 {status, nextRaw}，签名对齐 migrateOneMcpJsonFile，供 applyMcpConfigMigration 统一处理。 */
export function migrateOneMcpOpencodeJson(filePath, rootDir, { mode = undefined } = {}) {
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

  const mcp = readOpencodeBucket(parsed);
  const existingBrowser = findFirstBrowserServerEntry(mcp);
  // 按 mode 取托管 browser 条目：不注入 Playwright 时为 null（跳过该 alias）。
  // existingBrowser 用 opencode 的 .environment；buildPreferredMcpServer 读 .env，故包裹为 {env}。
  const browserManaged = browserManagedServer(rootDir, { env: readExistingEnvironment(existingBrowser) }, {}, mode);
  const auth = buildAuthToolsMcpServer(rootDir, { env: readExistingEnvironment(mcp[AUTH_TOOLS_ALIAS]) });
  const shell = buildShellMcpServer(rootDir);

  const managed = {
    ...(browserManaged !== null ? { [PRIMARY_BROWSER_ALIAS]: toOpencodeLocalEntry(browserManaged) } : {}),
    [AUTH_TOOLS_ALIAS]: toOpencodeLocalEntry(auth),
    [SHELL_ALIAS]: toOpencodeLocalEntry(shell),
  };

  const planned = planServerEdits({
    filePath,
    // 迁移写入器是这些条目形状的 owner（builder + `toOpencodeLocalEntry`），所以不套 CLI 的落点白名单。
    // 桶外根键的**默认值**不再抄裸 `90_000`：`clients/opencode/config.mjs:13` 是它唯一的所有者。
    // 行为差异如实记：旧实现会**修**掉非法/非正的既有值（例如 0 或 "90s" → 90000），
    // 新规则「已存在的值一概不碰」——与 CLI、codemap 收编后的规则一致；无法解释的值留给用户/doctor。
    shape: {
      format: 'json',
      entryPath: 'mcp',
      allowedFields: null,
      createIfMissing: true,
      requiresRootKeys: [{ path: 'experimental.mcp_timeout', createWith: OPENCODE_MCP_TIMEOUT_MS }],
    },
    edits: [
      // 每趟都保证兜底超时键在——哪怕三个条目全 unchanged（旧实现也是这样）。
      { action: 'ensure-root-keys' },
      ...LEGACY_BROWSER_ALIASES.map((alias) => ({ action: 'remove', serverName: alias })),
      ...Object.entries(managed).map(([serverName, entry]) => ({ action: 'upsert', serverName, entry })),
    ],
  });
  if (planned.status === 'rejected') {
    return { status: 'error', reason: planned.reason };
  }
  if (planned.status === 'unchanged') {
    return { status: 'unchanged' };
  }
  return { status: exists ? 'updated' : 'created', nextRaw: planned.text };
}

export { toOpencodeLocalEntry };