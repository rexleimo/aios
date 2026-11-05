// scripts/lib/clients/mcp/landing-schema.mjs — MCP 落点的「表里没写的那一层」真相。
//
// 为什么存在：`CLIENT_MCP_TARGETS`（foundation/clients/selection/core/definitions.mjs:266）
// 声明了每家在哪个文件的哪个 namespace，但它缺三件写盘必需的事实：
//   1. 条目桶的点路径（pi 甚至整条没登记：format 'none' + scopes []）；
//   2. 每 (client, scope) 的**字段白名单**——同一个 client 的 home 与 project 形状不同
//      （zcode home 用 `transport`、project 用 `type`+`timeoutMs`；gemini 用 `timeout` 而
//      claude 家族用 `startupTimeoutSec`）；
//   3. 该落点今天到底能不能写（opencode 从未被写过；pi 的项目级只读，由 Pi 适配器自己读
//      `.mcp.json`）。
// 本模块**不重复声明路径**（路径的唯一所有者仍是 CLIENT_MCP_TARGETS），只补这三件事，
// 并把与权威表的不一致作为 drift 暴露出来，供 w2 的写入门与 w7 的证据卡消费。
//
// 证据来源（2026-11-05 实测，键名与值类型，未记录任何配置值）：见 docs/adr/0008 决策 6。
import { CLIENT_MCP_TARGETS } from '../../foundation/clients/selection/core/definitions.mjs';

/** 标准 stdio 条目形状（claude / qoder / workbuddy / hermes 项目级）。 */
const STDIO_CLAUDE_FAMILY = Object.freeze(['command', 'args', 'type', 'env', 'cwd', 'startupTimeoutSec']);
/** gemini 的严格 schema：`startupTimeoutSec` 不在白名单内（未知字段会让整份 settings.json 判废）。 */
const GEMINI_FIELDS = Object.freeze(['command', 'args', 'type', 'env', 'timeout']);
/**
 * gemini 项目级实测另带 `cwd`（`.gemini/settings.json` 里 5 条 AIOS 写的条目都有该键）。
 * 但 definitions.mjs:288-290 的注释说 gemini 的 McpServerConfigSchema 是严格的——两者冲突，
 * 本表按**实测**放行 cwd，同时把它标成待证：w7 必须用 gemini 自己启动一次来判定它是否真被接受，
 * 不能因为「今天写着且没崩」就当已验。
 */
const GEMINI_PROJECT_FIELDS = Object.freeze(['command', 'args', 'type', 'cwd']);
/** codex TOML 实测键集（含 .env 子表与 approval_mode）。 */
const CODEX_TOML_FIELDS = Object.freeze(['command', 'args', 'type', 'startup_timeout_sec', 'cwd', 'url', 'enabled', 'approval_mode']);
/** grok TOML 实测键集。 */
const GROK_TOML_FIELDS = Object.freeze(['command', 'args', 'type', 'startup_timeout_sec', 'cwd', 'url', 'enabled']);
/** opencode 的本地条目形状，与 claude 家族不同源。 */
const OPENCODE_FIELDS = Object.freeze(['type', 'command', 'enabled', 'environment']);
/** hermes 用户级 YAML 实测键集（codemap 写入器 toHermesMcpEntry 同形）。 */
const HERMES_YAML_FIELDS = Object.freeze(['command', 'args', 'env', 'cwd']);
/** zcode 严格白名单：未知字段被整条丢弃。 */
const ZCODE_HOME_FIELDS = Object.freeze(['transport', 'command', 'args', 'env']);
const ZCODE_PROJECT_FIELDS = Object.freeze(['type', 'command', 'args', 'env', 'timeoutMs']);
/** pi 全局 mcp.json：条目必须与 Pi 自己的写入器逐字节一致，否则 pi doctor 永久报 kept-differs。 */
const PI_FIELDS = Object.freeze(['command', 'args', 'lifecycle']);

/**
 * 每 client 每 scope 的补表。`entryPath` 是条目桶的点路径；`file` 只允许出现在
 * CLIENT_MCP_TARGETS 没登记落点的地方（目前只有 pi）。
 */
export const MCP_LANDING_OVERRIDES = Object.freeze({
  claude: {
    home: { entryPath: 'mcpServers', allowedFields: STDIO_CLAUDE_FAMILY, writable: true, unknownFieldPolicy: 'reject' },
    project: { entryPath: 'mcpServers', allowedFields: STDIO_CLAUDE_FAMILY, writable: true, unknownFieldPolicy: 'reject' },
  },
  codex: {
    home: { entryPath: 'mcp_servers', allowedFields: CODEX_TOML_FIELDS, writable: true, unknownFieldPolicy: 'reject' },
    project: { entryPath: 'mcp_servers', allowedFields: CODEX_TOML_FIELDS, writable: true, unknownFieldPolicy: 'reject' },
  },
  gemini: {
    // 归一化由 browser/mcp/formats/mcp-gemini.mjs 负责（startupTimeoutSec -> timeout）。
    home: { entryPath: 'mcpServers', allowedFields: GEMINI_FIELDS, writable: true, unknownFieldPolicy: 'reject' },
    project: { entryPath: 'mcpServers', allowedFields: GEMINI_PROJECT_FIELDS, writable: true, unknownFieldPolicy: 'reject',
      unverifiedFields: ['cwd'],
      note: 'cwd 是实测放行、schema 未证：w7 必须用 gemini 真启动判一次，不得因「今天写着没崩」当已验。' },
  },
  opencode: {
    home: { entryPath: 'mcp', allowedFields: OPENCODE_FIELDS, writable: true, unknownFieldPolicy: 'reject',
      requiresRootKeys: ['experimental.mcp_timeout'],
      note: '今天从未被写过：两个 opencode.json 实测无 `mcp` 键。形状与 claude 家族不同源。' },
  },
  hermes: {
    home: { entryPath: 'mcp_servers', allowedFields: HERMES_YAML_FIELDS, writable: true, unknownFieldPolicy: 'reject',
      note: '实测真实结构就是 mcp_servers.<name>（无中间 mcp 层），与 codemap yaml 写入器一致。' },
    project: { entryPath: 'mcpServers', allowedFields: STDIO_CLAUDE_FAMILY, writable: true, unknownFieldPolicy: 'reject' },
  },
  grok: {
    home: { entryPath: 'mcp_servers', allowedFields: GROK_TOML_FIELDS, writable: true, unknownFieldPolicy: 'reject' },
    project: { entryPath: 'mcp_servers', allowedFields: GROK_TOML_FIELDS, writable: true, unknownFieldPolicy: 'reject' },
  },
  workbuddy: {
    home: { entryPath: 'mcpServers', allowedFields: STDIO_CLAUDE_FAMILY, writable: true, unknownFieldPolicy: 'reject' },
  },
  qoder: {
    home: { entryPath: 'mcpServers', allowedFields: STDIO_CLAUDE_FAMILY, writable: true, unknownFieldPolicy: 'reject' },
    project: { entryPath: 'mcpServers', allowedFields: STDIO_CLAUDE_FAMILY, writable: true, unknownFieldPolicy: 'reject' },
  },
  zcode: {
    home: { entryPath: 'mcp.servers', allowedFields: ZCODE_HOME_FIELDS, writable: true, unknownFieldPolicy: 'drop-entry' },
    project: { entryPath: 'mcp.servers', allowedFields: ZCODE_PROJECT_FIELDS, writable: true, unknownFieldPolicy: 'drop-entry' },
  },
  pi: {
    // CLIENT_MCP_TARGETS 把 pi 登记成 format 'none' + scopes []，但真实落点存在且有三处写入者
    // （browser/lifecycle/install.mjs:158、codemap targets.mjs:88、pi/doctor.mjs:41，同取 clientHomes.pi）。
    home: { entryPath: 'mcpServers', file: 'mcp.json', allowedFields: PI_FIELDS, requiredFields: ['lifecycle'],
      writable: true, unknownFieldPolicy: 'reject',
      note: '条目必须与 pi 写入器逐字节一致（lifecycle:"lazy"），否则 pi doctor 的 JSON.stringify 比对永久报 kept-differs。' },
    project: { entryPath: 'mcpServers', file: '.mcp.json', allowedFields: STDIO_CLAUDE_FAMILY,
      writable: false, unknownFieldPolicy: 'reject',
      note: 'Pi 项目级由适配器直接读仓库自己的 .mcp.json，不作为本控制台的写入落点。' },
  },
});

export function listLandingClients() {
  return Object.freeze([...Object.keys(MCP_LANDING_OVERRIDES)]);
}

/**
 * CLIENT_MCP_TARGETS 里某 scope 的声明条目（找不到返回 null，便于把「表未登记」当事实返回）。
 *
 * namespace 与 format 的**优先级是 scope 级覆盖 client 级**：hermes 的 client 级写
 * `namespace:'mcpServers'`，而 home scope 写 `namespace:'mcp_servers'`
 * （`definitions.mjs:309-314`，注释 :308 亦言「Hermes reads mcp_servers from its YAML config」）。
 * 读 client 级就会把对的表读成错的——w1 自己先踩过一次。
 */
function declaredScope(clientId, scope, targets = CLIENT_MCP_TARGETS) {
  const declared = targets[clientId];
  if (!declared) return null;
  const match = (declared.scopes || []).find((entry) => entry.scope === scope) || null;
  if (!match) return null;
  return { ...match, format: match.format || declared.format, namespace: match.namespace || declared.namespace || '' };
}

/**
 * 合并声明表与补表，产出一个 (client, scope) 的完整落点描述。
 * 返回 `registered: false` 表示 CLIENT_MCP_TARGETS 没登记该落点（补表提供文件）。
 */
export function resolveLanding(clientId, scope, { targets = CLIENT_MCP_TARGETS } = {}) {
  const override = MCP_LANDING_OVERRIDES[clientId]?.[scope];
  if (!override) throw new Error(`unknown MCP landing: ${clientId}/${scope}`);
  const declared = declaredScope(clientId, scope, targets);
  const file = declared ? declared.file : override.file;
  if (!file) throw new Error(`no landing file for ${clientId}/${scope}`);
  return Object.freeze({
    clientId,
    scope,
    file,
    format: (declared && declared.format) || 'json',
    // 点路径优先取补表：它按真实文件实测，声明表的 namespace 在 pi/zcode 上不够用。
    entryPath: override.entryPath,
    allowedFields: Object.freeze([...override.allowedFields]),
    requiredFields: Object.freeze([...(override.requiredFields || [])]),
    requiresRootKeys: Object.freeze([...(override.requiresRootKeys || [])]),
    unknownFieldPolicy: override.unknownFieldPolicy,
    unverifiedFields: Object.freeze([...(override.unverifiedFields || [])]),
    writable: override.writable !== false,
    registered: Boolean(declared),
    createIfMissing: Boolean(declared ? declared.createIfMissing : true),
    note: override.note || '',
  });
}

/**
 * 写入门：条目字段是否在白名单内、必需字段是否齐。w2 的每个 writer 落盘前必须先过这里。
 * `drop-entry` 的策略由调用方（zcode）负责，这里只报告违规，不改变条目。
 */
export function assertEntryAllowed(clientId, scope, entry, { targets = CLIENT_MCP_TARGETS } = {}) {
  const landing = resolveLanding(clientId, scope, { targets });
  const allowed = new Set(landing.allowedFields);
  const keys = Object.keys(entry || {});
  const unknownFields = keys.filter((key) => !allowed.has(key));
  const missingFields = landing.requiredFields.filter((key) => !keys.includes(key));
  return Object.freeze({
    ok: unknownFields.length === 0 && missingFields.length === 0 && landing.writable,
    clientId,
    scope,
    unknownFields: Object.freeze(unknownFields),
    missingFields: Object.freeze(missingFields),
    writable: landing.writable,
    unknownFieldPolicy: landing.unknownFieldPolicy,
    reason: !landing.writable ? 'landing-not-writable'
      : missingFields.length ? 'required-field-missing'
        : unknownFields.length ? 'unknown-field' : 'ok',
  });
}

/**
 * 与权威表的不一致清单。这是「表不可盲信」的机器版本：w7 的证据卡与 w1 的验收都读它。
 */
export function findLandingDrift({ targets = CLIENT_MCP_TARGETS } = {}) {
  const drift = [];
  for (const clientId of listLandingClients()) {
    const scopes = MCP_LANDING_OVERRIDES[clientId];
    for (const scope of Object.keys(scopes)) {
      const declared = declaredScope(clientId, scope, targets);
      if (!declared) {
        drift.push({ clientId, scope, kind: 'unregistered-in-declaration-table', declaredFormat: targets[clientId]?.format || 'absent', overrideFile: scopes[scope].file || '' });
        continue;
      }
      const declaredEntryPath = declared.namespace || '';
      if (scopes[scope].entryPath !== declaredEntryPath) {
        drift.push({ clientId, scope, kind: 'entry-path-differs', declared: declaredEntryPath, override: scopes[scope].entryPath });
      }
    }
  }
  return Object.freeze(drift);
}
