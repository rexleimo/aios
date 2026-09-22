// scripts/lib/integrations/clients.mjs — 每个客户端注册远程 HTTP MCP 的调用表。
// 设计约束：这里的每一条命令都必须来自该客户端自己的 `--help` 输出，并把证据字符串
// 一起记录下来。没有证据的客户端一律标记 verified:false，doctor 会如实报告
// "unverified" 并打印待人工执行的命令，而不是假装已安装成功。
import path from 'node:path';

import { CLIENT_DEFINITIONS } from '../clients/core/definitions.mjs';

// 覆盖顺序：先本机已实测的客户端，再是证据不足的客户端。
export const INTEGRATION_CLIENT_ORDER = Object.freeze([
  'claude',
  'codex',
  'opencode',
  'hermes',
  'grok',
  'pi',
  'gemini',
  'workbuddy',
  'zcode',
  'qoder',
]);

function cliAdd(command, args) {
  return Object.freeze({ command, args: Object.freeze(args) });
}

// 纯函数：默认作用域；user 表示写用户级配置，project 表示写当前仓库配置。
function scopeOf(scope) {
  return scope === 'project' ? 'project' : 'user';
}

export const INTEGRATION_CLIENT_TABLE = Object.freeze({
  claude: Object.freeze({
    client: 'claude',
    transport: 'cli',
    verified: true,
    evidence: 'claude mcp add --help: `--transport <...>` with example `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp`',
    buildAdd: ({ mcp, scope }) => cliAdd('claude', [
      'mcp', 'add', '--scope', scopeOf(scope), '--transport', 'http', mcp.serverName, mcp.url,
    ]),
    buildRemove: ({ mcp, scope }) => cliAdd('claude', [
      'mcp', 'remove', '--scope', scopeOf(scope), mcp.serverName,
    ]),
    buildProbe: ({ mcp }) => cliAdd('claude', ['mcp', 'get', mcp.serverName]),
  }),

  codex: Object.freeze({
    client: 'codex',
    transport: 'cli',
    verified: true,
    evidence: 'codex mcp add --help: `<NAME> (--url <URL> | -- <COMMAND>...)`, `--url` documented as "URL for a streamable HTTP MCP server"',
    buildAdd: ({ mcp }) => cliAdd('codex', ['mcp', 'add', mcp.serverName, '--url', mcp.url]),
    buildRemove: ({ mcp }) => cliAdd('codex', ['mcp', 'remove', mcp.serverName]),
    buildProbe: ({ mcp }) => cliAdd('codex', ['mcp', 'get', mcp.serverName]),
  }),

  opencode: Object.freeze({
    client: 'opencode',
    transport: 'cli',
    verified: true,
    evidence: 'opencode mcp add --help: `--url  URL for a remote MCP server`',
    buildAdd: ({ mcp }) => cliAdd('opencode', ['mcp', 'add', mcp.serverName, '--url', mcp.url]),
    buildRemove: ({ mcp }) => cliAdd('opencode', ['mcp', 'remove', mcp.serverName]),
    buildProbe: () => cliAdd('opencode', ['mcp', 'list']),
  }),

  hermes: Object.freeze({
    client: 'hermes',
    transport: 'cli',
    verified: true,
    // `hermes mcp add --url` 会交互式追问 "Does this server require authentication?"，
    // 且没有非交互开关。非 TTY 环境下必须把它降级为人工步骤（与 headroom 注册同一处理）。
    interactive: true,
    manualHint: 'requires an interactive terminal (hermes prompts for the auth method)',
    evidence: 'hermes mcp add --help: `--url URL   HTTP/SSE endpoint URL`; verified interactive: prompts "Does this server require authentication?"',
    buildAdd: ({ mcp, scope }) => cliAdd('hermes', [
      'mcp', 'add', mcp.serverName, '--url', mcp.url, ...(scopeOf(scope) === 'project' ? ['--scope', 'project'] : []),
    ]),
    buildRemove: ({ mcp }) => cliAdd('hermes', ['mcp', 'remove', mcp.serverName]),
    buildProbe: () => cliAdd('hermes', ['mcp', 'list']),
  }),

  grok: Object.freeze({
    client: 'grok',
    transport: 'cli',
    verified: true,
    evidence: 'grok mcp add --help: `-t, --transport <TRANSPORT>` with `http: Connect to a remote server over streamable HTTP` and `-s, --scope`',
    buildAdd: ({ mcp, scope }) => cliAdd('grok', [
      'mcp', 'add', '-t', 'http', '--scope', scopeOf(scope), mcp.serverName, mcp.url,
    ]),
    buildRemove: ({ mcp, scope }) => cliAdd('grok', [
      'mcp', 'remove', '--scope', scopeOf(scope), mcp.serverName,
    ]),
    buildProbe: () => cliAdd('grok', ['mcp', 'list']),
  }),

  // Pi core has no MCP surface; the AIOS-managed path is the pi-mcp-adapter extension,
  // which reads the Pi-global mcp.json. Its README documents `url` as
  // "HTTP endpoint (StreamableHTTP with SSE fallback)". AIOS only appends a
  // user-owned entry and never rewrites entries it does not own.
  pi: Object.freeze({
    client: 'pi',
    transport: 'config',
    verified: true,
    evidence: 'pi-mcp-adapter README: `url` = "HTTP endpoint (StreamableHTTP with SSE fallback)"; adapter reads the Pi-global mcp.json',
    config: Object.freeze({
      scope: 'home',
      file: Object.freeze(['mcp.json']),
      namespace: 'mcpServers',
      buildEntry: ({ mcp }) => ({ url: mcp.url, lifecycle: 'lazy' }),
    }),
    buildAdd: null,
    buildRemove: null,
    buildProbe: null,
  }),

  // gemini 有自己的 MCP CLI（add/remove/list/enable/disable），所以走 CLI 委托路径，
  // 而不是让人手工改 ~/.gemini/settings.json。注意它没有 `mcp get <name>`，探测用 list。
  gemini: Object.freeze({
    client: 'gemini',
    transport: 'cli',
    verified: true,
    evidence: 'gemini mcp add --help (0.60.0): `-t, --transport, --type  Transport type (stdio, sse, http)`, `-s, --scope  Configuration scope (user or project)`, `--timeout  Set connection timeout in milliseconds`; subcommands add/remove/list/enable/disable',
    buildAdd: ({ mcp, scope }) => cliAdd('gemini', [
      'mcp', 'add', '--scope', scopeOf(scope), '--transport', 'http', mcp.serverName, mcp.url,
    ]),
    buildRemove: ({ mcp, scope }) => cliAdd('gemini', [
      'mcp', 'remove', '--scope', scopeOf(scope), mcp.serverName,
    ]),
    buildProbe: () => cliAdd('gemini', ['mcp', 'list']),
  }),

  // 2026-09-21 (v6.0.6): 旧条目把 WorkBuddy 当作「HTTP transport 键名未验证」的人工步骤，
  // 前提是错的。实测 codebuddy 2.137.1：`mcp add` 根本没有 `--agent` 选项（"agent 名单无法
  // 枚举" 从未成立），且 `-t, --transport` 支持 stdio|sse|http。`codebuddy mcp add <name> <url>
  // -t http` 写出的就是 `{"type":"http","url":...}` —— 即缺失的那个键名。
  // 仍然由 AIOS 拥有 `~/.workbuddy/mcp.json`（而不是 CLI 的 user 文件 `~/.codebuddy/.mcp.json`），
  // 这样 ledger、备份与「只删自己写的」语义都保持不变；`codebuddy mcp list` 会读到该文件里的条目。
  workbuddy: Object.freeze({
    client: 'workbuddy',
    transport: 'config',
    verified: true,
    evidence: 'codebuddy mcp add --help (2.137.1): `-t, --transport <transport>` stdio|sse|http, `-s, --scope <scope>` local|project|user, no `--agent` option; verified: `codebuddy mcp add typesafe-docs <url> -t http` wrote {"type":"http","url":...} into the mcpServers namespace',
    config: Object.freeze({
      scope: 'home',
      file: Object.freeze(['mcp.json']),
      namespace: 'mcpServers',
      buildEntry: ({ mcp }) => ({ type: 'http', url: mcp.url }),
    }),
    buildAdd: null,
    buildRemove: null,
    buildProbe: null,
  }),

  // 2026-09-22 (v6.0.13): zcode 从 manual 升级为 config —— "HTTP transport 键名未验证" 的前提是错的。
  // 证据来自 ZCode 自带的 CLI 运行时（安装包 resources/glm/zcode.cjs）里 mcp.servers 条目的 zod 校验：
  //   iWr = preprocess(alias, discriminatedUnion("type", [stdio | http | sse]))，三个分支都是 .strict()。
  //   http/sse 分支要求 { url: string.min(1), headers?, oauth? }，公共字段 protocolVersion|enabled|timeoutMs。
  // 所以缺失的键名就是 `type: "http"` + `url`（与 buildDesiredMcpEntry 的通用形状一致）；
  // 未知字段不会让整个文件失效，但会让该 server 被丢弃并记 config_mcp_server_invalid 警告。
  // 预处理还把旧别名归一：enable→enabled、environment→env、http_headers→headers、
  // type:"remote"→"http"、缺 type 时按 command/url 推断（~/.zcode/cli/config.json 里的 pencil 条目
  // 就是历史形状，用 transport:"stdio" 而不是 type:"stdio"）。
  // 文件位置沿用 AIOS 自己拥有的 MCP 目标：home ~/.zcode/cli/config.json / project .zcode/config.json，
  // 命名空间 mcp.servers（CLI 的 readServerMapFromJson 也按这个点路径取值）。
  zcode: Object.freeze({
    client: 'zcode',
    transport: 'config',
    verified: true,
    evidence: 'ZCode CLI runtime (installation resources/glm/zcode.cjs) mcp.servers entry schema: zod discriminatedUnion("type", [stdio|http|sse]), each branch .strict(); http/sse require {url, headers?, oauth?} with shared protocolVersion|enabled|timeoutMs. ZCode desktop "New MCP server" form offers exactly stdio/http/sse. Verified on ZCode 3.6.5 (win32-x64).',
    config: Object.freeze({
      scope: 'home',
      file: Object.freeze(['cli', 'config.json']),
      namespace: 'mcp.servers',
      buildEntry: ({ mcp }) => ({ type: 'http', url: mcp.url }),
    }),
    projectConfig: Object.freeze({ scope: 'project', file: Object.freeze(['.zcode', 'config.json']) }),
    buildAdd: null,
    buildRemove: null,
    buildProbe: null,
  }),

  // Qoder CLI ships first-class MCP CRUD (verified via the native mcp-config skill
  // surface): `qoderclicn mcp add <name> <commandOrUrl> [args...] --scope
  // <user|local|project> --transport <stdio|sse|http|ws>` plus add-json/list/get/remove.
  qoder: Object.freeze({
    client: 'qoder',
    transport: 'cli',
    verified: true,
    evidence: 'qoderclicn mcp add --help (via native mcp-config skill): `--scope <user|local|project>`, `--transport <stdio|sse|http|ws>`; mcp list/get/remove documented',
    buildAdd: ({ mcp, scope }) => cliAdd('qoder', [
      'mcp', 'add', '--scope', scopeOf(scope), '--transport', 'http', mcp.serverName, mcp.url,
    ]),
    buildRemove: ({ mcp, scope }) => cliAdd('qoder', [
      'mcp', 'remove', '--scope', scopeOf(scope), mcp.serverName,
    ]),
    buildProbe: ({ mcp }) => cliAdd('qoder', ['mcp', 'get', mcp.serverName]),
  }),
});

// 纯函数：为"已知配置文件位置、未知 transport 键名"的客户端造一条条目。
// 不编造键名：只把文件路径、命名空间和 URL 交给人工，并显式标出待确认字段。
// 2026-09-22 (v6.0.13)：最后一个 manual 客户端 zcode 也拿到了自己的 schema 证据（见上），
// 所以当前没有任何客户端走这条路。它保留为"下一个证据不足的客户端"的兜底形状——
// 新增客户端时必须先跑通客户端的 --help / 配置 schema 再决定 transport，拿不到证据就落在这里。
function manualHttpEntry(client, { file, projectFile, namespace = 'mcpServers', reason, evidence }) {
  return Object.freeze({
    client,
    transport: 'manual',
    verified: false,
    unverifiedReason: reason,
    evidence,
    namespace,
    placeholder: '<transport-key>',
    config: file,
    projectConfig: projectFile || null,
    buildAdd: ({ mcp }) => ({
      kind: 'manual-config',
      client,
      namespace,
      serverName: mcp.serverName,
      url: mcp.url,
      placeholder: '<transport-key>',
    }),
    buildRemove: ({ mcp }) => ({
      kind: 'manual-config-remove',
      client,
      namespace,
      serverName: mcp.serverName,
    }),
    buildProbe: null,
  });
}

// 客户端 id 与真实可执行名可能不同（workbuddy → codebuddy）。探测必须用真实命令名，
// 否则已安装的客户端会被误报为 client-missing。
export function resolveIntegrationClientCommand(client) {
  const commandName = String(CLIENT_DEFINITIONS[client]?.commandName || '').trim();
  return commandName || client;
}

export function resolveIntegrationClientOrder() {
  const known = new Set(Object.keys(CLIENT_DEFINITIONS));
  const ordered = INTEGRATION_CLIENT_ORDER.filter((client) => known.has(client));
  for (const client of known) {
    if (!ordered.includes(client)) ordered.push(client);
  }
  return ordered;
}

// 纯函数：解析 --clients 参数。all/detected 之外的取值必须是已知客户端名。
export function normalizeIntegrationClients(raw, { known = resolveIntegrationClientOrder() } = {}) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value || value === 'all') return [...known];
  const requested = value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const unknown = requested.filter((item) => !known.includes(item));
  if (unknown.length > 0) {
    throw new Error(`unknown client(s): ${unknown.join(', ')}. Known: ${known.join(', ')}`);
  }
  return [...new Set(requested)];
}

export function getIntegrationClientEntry(client) {
  return INTEGRATION_CLIENT_TABLE[String(client || '').trim().toLowerCase()] || null;
}

// 纯函数：解析 config/manual 型客户端的目标文件绝对路径。
export function resolveIntegrationClientConfigPath(client, { clientHome, projectRoot, scope = 'home' } = {}) {
  const entry = getIntegrationClientEntry(client);
  if (!entry || !entry.config) return '';
  const target = scope === 'project' ? (entry.projectConfig || entry.config) : entry.config;
  const base = target.scope === 'home' ? clientHome : projectRoot;
  if (!base) return '';
  return path.join(base, ...target.file);
}

// 纯函数：给人工执行用的命令预览字符串（未验证客户端与 dry-run 输出复用）。
export function formatInvocation(invocation) {
  if (!invocation) return '';
  if (invocation.kind === 'manual-config') {
    return `${invocation.client}: add ${invocation.serverName} under ${invocation.namespace} (confirm the HTTP transport key name)`;
  }
  if (invocation.kind === 'manual-config-remove') {
    return `${invocation.client}: remove ${invocation.serverName} from ${invocation.namespace}`;
  }
  return [invocation.command, ...invocation.args].join(' ');
}

// 纯函数：人工步骤要写进哪个文件、写成什么形状。
// 不猜 transport 键名，而是把它标成占位符，强制人工对照客户端文档确认。
export function describeManualTarget(client, { clientHome, projectRoot, integration, scope = 'home' } = {}) {
  const entry = getIntegrationClientEntry(client);
  if (!entry || entry.transport !== 'manual') return null;
  const targetPath = resolveIntegrationClientConfigPath(client, { clientHome, projectRoot, scope });
  const url = integration?.mcp?.url || '';
  const serverName = integration?.mcp?.serverName || '';
  const snippet = {
    [entry.namespace]: {
      [serverName]: { [entry.placeholder || '<transport-key>']: url },
    },
  };
  return { path: targetPath, namespace: entry.namespace, snippet };
}
