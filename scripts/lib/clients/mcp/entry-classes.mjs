// scripts/lib/clients/mcp/entry-classes.mjs — 每客户端允许集合（ADR 0008 决策 5）。
//
// 落点白名单管的是**字段**（`landing-schema.mjs`），这里管的是**条目身份**：某个 MCP server 是不是
// 这家客户端允许 AIOS 去登记的东西。两者都是写入门的门，但拦的东西不同、理由不同。
//
// 名字来源都是仓库里已有的常量，不在这里重新发明（改这些别名的人会在 `clients/mcp` 之外改，
// 所以本表由测试反向钉住：`entry-classes` 与本表对不上即红）。
// 本表刻意 **不 import** `tooling/components/**`：那是自下而上的反向依赖（standards 的
// reverseDependencies 规则），客户端层不许指到工具组件层。
export const MCP_ENTRY_CLASSES = Object.freeze({
  'code-review-graph': 'crg',          // codemap/constants.mjs:4 CRG_MCP_ALIAS
  'mcp-browser-use': 'browser',        // browser/constants.mjs:3 PRIMARY_BROWSER_ALIAS
  'aios-auth-tools': 'auth',           // browser/constants.mjs:6 AUTH_TOOLS_ALIAS
  'aios-shell': 'shell',               // browser/constants.mjs:7 SHELL_ALIAS
  headroom: 'headroom',                // aios-init/headroom-mcp/ownership.mjs:58
  'aios-memory': 'memory',             // integrations/pi/mcp-adapter.mjs:121
  'aios-bridge': 'bridge',             // integrations/pi/mcp-adapter.mjs:126
});

/**
 * 每客户端的禁止类别，理由保留**源文本**（决策 5 要求拒绝时能给出原文，不给「不合适」这种糊话）。
 * 引用行号以 `pi/mcp-adapter.mjs` 当前内容为准：:21-22。
 */
const DENIED = Object.freeze({
  pi: Object.freeze({
    shell: Object.freeze({
      reason: 'class-denied:shell',
      policy: 'Shell and auth stay out: a shell MCP tool would bypass the AIOS Pi safety gate, and auth stays niche.',
      policyRef: 'scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs:21-22',
    }),
    auth: Object.freeze({
      reason: 'class-denied:auth',
      policy: 'Shell and auth stay out: a shell MCP tool would bypass the AIOS Pi safety gate, and auth stays niche.',
      policyRef: 'scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs:21-22',
    }),
  }),
});

export function classifyServerName(serverName) {
  return MCP_ENTRY_CLASSES[String(serverName || '').trim()] || 'user-defined';
}

/**
 * 允许集合判定。`browser` 在 pi 上还要一个显式前提：运行时确已安装——
 * Pi 的全局 mcp.json 不该登记一个起不来的 server（`pi/mcp-adapter.mjs:78-81` 的同一条理由）。
 * `user-defined` 不因类别被拒：那是用户自己要求的 server，边界由归属账本管，不由这里管。
 */
export function assertEntryClassAllowed({ clientId, serverName, browserRuntimeInstalled = false } = {}) {
  const entryClass = classifyServerName(serverName);
  const denied = DENIED[clientId]?.[entryClass];
  if (denied) return { ok: false, entryClass, reason: denied.reason, policy: denied.policy, policyRef: denied.policyRef };
  if (clientId === 'pi' && entryClass === 'browser' && browserRuntimeInstalled !== true) {
    return {
      ok: false,
      entryClass,
      reason: 'browser-runtime-not-installed',
      policy: 'The browser server joins them once the caller states the runtime is installed, so the Pi-global file never advertises a server that cannot start.',
      policyRef: 'scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs:78-81',
    };
  }
  return { ok: true, entryClass, reason: 'ok', policy: '', policyRef: '' };
}
