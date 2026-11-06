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
// zcode 的字段白名单**不是本表测出来的**，而是 zcode 自己的 zod schema 的公开副本
// （`foundation/clients/integration/mcp/zcode-schema.mjs`，browser 与 codemap 都从那里取）。
// 本表原先自己抄了一份 `['transport','command','args','env']`，依据是 `~/.zcode/cli/config.json`
// 里那一条**用户自有**的 `pencil` 条目；而同一份文件里 AIOS 自己写的四条（browser/auth/shell/crg）
// 全是 `type` + `timeoutMs`，且 zcode-schema 的注释记着 CLI 日志原文 `Unrecognized key: "transport"`。
// 结果是写入门拒绝了实际能用的形状、放行了实际被丢弃的字段：`aios mcp add --client zcode --scope home`
// 今天写不进去。白名单归 schema 所有者，本表只是引用（2026-11-05，w5b 开工前实测）。
import { ZCODE_SERVER_FIELDS_ALLOWLIST } from '../../foundation/clients/integration/mcp/zcode-schema.mjs';
import { OPENCODE_MCP_TIMEOUT_MS } from '../opencode/config.mjs';

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
/**
 * grok TOML 实测键集（2026-11-05 复测：`~/.grok/config.toml` 里 AIOS 托管的条目带 `[mcp_servers.<name>.env]`
 * 子表，例如 aios-shell / aios-memory；groK CLI 的 `mcp add -e K=V` 落的就是 env）。原表漏了 env——
 * 那是按“没有 env 的条目”测出来的，于是 headroom 的自写路径会被自己的白名单拒掉。
 */
const GROK_TOML_FIELDS = Object.freeze(['command', 'args', 'type', 'startup_timeout_sec', 'cwd', 'url', 'enabled', 'env']);
/** opencode 的本地条目形状，与 claude 家族不同源。 */
const OPENCODE_FIELDS = Object.freeze(['type', 'command', 'enabled', 'environment']);
/**
 * hermes 用户级 YAML 实测键集（codemap 写入器 toHermesMcpEntry 同形）。
 * `enabled` / `tools` 是 hermes 自己 `mcp add` 写出的字段（见 headroom-mcp 的 `hermesEntryUsable`：
 * 条目必须 `enabled:true` 且带三个 headroom 工具名才算可用）。AIOS 自写时必须能复现同一形状，
 * 但“手写这两列 hermes 也认”没有实证——所以列入白名单同时标成 unverified，交给 w7 用真客户端验。
 */
const HERMES_YAML_FIELDS = Object.freeze(['command', 'args', 'env', 'cwd', 'enabled', 'tools']);
/**
 * zcode 的 server schema 是 per-client 的 discriminated union，**不分 home/project**：
 * 两个 scope 的差别只在“文件里的既有条目长什么样”，不在“能写哪些字段”。
 * 所以两个 scope 都直接引用 owner 的白名单（含 `timeoutMs` 秒→毫秒换算的落点字段）。
 */
const ZCODE_FIELDS = ZCODE_SERVER_FIELDS_ALLOWLIST;
/**
 * pi 全局 mcp.json：条目必须与 Pi 自己的写入器逐字节一致，否则 pi doctor 永久报 kept-differs。
 * `env` 在这一列不是可选项而是事实：pi 自己的写入器给 headroom 就写
 * `{command, args, env:{HEADROOM_MCP_CLIENT, HEADROOM_MCP_READ}, lifecycle}`
 * （`scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs:103-108`，形状由
 * `scripts/tests/clients/pi-adapter/pi-mcp-adapter.test.mjs:58-66` 钉住）。
 * 本表原先只列 `command/args/lifecycle`，而 pi/home 的 `unknownFieldPolicy:'reject'`——
 * 那等于让通用路径**拒掉一个私有路径今天就在装的条目**：收编后 headroom 会从 pi 里静默消失。
 * 白名单描述的是「这个落点的条目能带哪些字段」，不描述键序；键序由调用方构造对象的顺序决定
 * （`formats/json-editor.mjs` 的 serializeValue 保留传入顺序），所以这里加 `env` 不会改字节形状。
 */
const PI_FIELDS = Object.freeze(['command', 'args', 'env', 'lifecycle']);

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
      // 桶外根键：opencode 只有在 `experimental.mcp_timeout` 存在且为正数时才会给 MCP 工具调用套超时。
      // 默认值不在这里另立一个数字——`clients/opencode/config.mjs:13` 才是它的唯一所有者
      // （`browser/mcp/formats/mcp-opencode.mjs:65` 今天抄了一份裸 `90_000`，是漂移的候选，w5b 收编时改引这个常量）。
      // `createWith` 是「缺了就按这个值补上」的授权：补出来的键由写路径回报 `createdRootKeys`，卸载时按 provenance 收掉，
      // 与 `createdBucket` 同一套路——否则「装→卸回到原字节」这条门在一个本来没有 `experimental` 的文件上必然过不了。
      requiresRootKeys: [{ path: 'experimental.mcp_timeout', createWith: OPENCODE_MCP_TIMEOUT_MS }],
      note: '今天从未被写过：两个 opencode.json 实测无 `mcp` 键。形状与 claude 家族不同源。' },
  },
  hermes: {
    home: { entryPath: 'mcp_servers', allowedFields: HERMES_YAML_FIELDS, writable: true, unknownFieldPolicy: 'reject',
      unverifiedFields: ['enabled', 'tools'],
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
    home: { entryPath: 'mcp.servers', allowedFields: ZCODE_FIELDS, writable: true, unknownFieldPolicy: 'drop-entry',
      note: '实测：AIOS 写的条目是 type+timeoutMs（zcode 自己的 CLI 日志把 transport 记为 Unrecognized key）。' },
    project: { entryPath: 'mcp.servers', allowedFields: ZCODE_FIELDS, writable: true, unknownFieldPolicy: 'drop-entry' },
  },
  pi: {
    // CLIENT_MCP_TARGETS 把 pi 登记成 format 'none' + scopes []，但真实落点存在且有三处写入者
    // （browser/lifecycle/install.mjs:158、codemap targets.mjs:88、pi/doctor.mjs:41，同取 clientHomes.pi）。
    home: { entryPath: 'mcpServers', file: 'mcp.json', allowedFields: PI_FIELDS, requiredFields: ['lifecycle'],
      // 声明表没登记 pi（format 'none' + scopes []），所以 `createIfMissing` 的 per-scope 默认在这里显式补：
      // Pi 自己的适配器在 `~/.pi/agent/mcp.json` 不存在时是**直接创建**的（`integrations/pi/mcp-adapter.mjs:197-198`），
      // 通用路径若不建文件就永远装不上 pi，那是把「未登记」伪装成「不可写」。
      createIfMissing: true,
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
 * `createIfMissing` 的解析顺序：补表显式值 → 声明表显式值 → **声明表注释里写明的 per-scope 默认**
 * （`definitions.mjs:265`：home 默认 false、project 默认 true）。
 * 今天这一格是 `Boolean(declared.createIfMissing)`，把「没写」当成 false——于是所有没显式写 true 的
 * project 落点都被判成「文件不存在就不许建」，而 project 恰恰是新建仓库时才第一次装 MCP 的地方。
 * 这一格以前没被消费过，所以错着也没人疼；w5a 让它进写路径，就必须先把它算对。
 */
function resolveCreateIfMissing(override, declared, scope) {
  if (override.createIfMissing !== undefined) return Boolean(override.createIfMissing);
  if (declared && declared.createIfMissing !== undefined) return Boolean(declared.createIfMissing);
  return scope === 'project';
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
    requiresRootKeys: Object.freeze((override.requiresRootKeys || []).map((key) => (typeof key === 'string'
      ? Object.freeze({ path: key, createWith: undefined })
      : Object.freeze({ path: key.path, createWith: key.createWith })))),
    unknownFieldPolicy: override.unknownFieldPolicy,
    unverifiedFields: Object.freeze([...(override.unverifiedFields || [])]),
    writable: override.writable !== false,
    registered: Boolean(declared),
    createIfMissing: resolveCreateIfMissing(override, declared, scope),
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
