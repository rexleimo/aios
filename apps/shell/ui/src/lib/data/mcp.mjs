// apps/shell/ui/src/lib/data/mcp.mjs — MCP 段唯一的取数与动作构造点。
//
// 三条界线（都是前面几个工作项用真机教训换来的，不是风格）：
//   1. **事实只有一条通道**：`aios mcp list --json`（schema `mcp.list.v1`）。视图不 import
//      `scripts/lib/**`，也不自己读客户端配置文件——否则同一份配置在界面与 CLI 各有一套解释。
//   2. **动作 argv 由白名单构造，永远不拼字符串**：`buildMcpArgv` 只接受闭合的 action 集合与
//      经过校验的字段（client 必须真的出现在刚取回的落点表里、name 匹配 `^[A-Za-z0-9][\w.-]*$`、
//      scope ∈ {home, project}、entry 必须是对象且体积有上限）。HTTP 请求体永远不进 shell。
//   3. **状态列印机器 token，不印好听话**：ADR 0008 决策 2 要求「未验证的落点显示
//      `landing-unverified` + 失败原文，不得标绿、不得编造原因」。所以这里给出的是
//      `landing-error | landing-unregistered | landing-unverified | landing-verified`
//      四个 token，以及照抄的原因文本；`landing-verified` 只在**有证据卡**时出现。
//      今天证据目录（w7 产出）还不存在，因此每个落点都会诚实地读作 `landing-unverified`。
import fs from 'node:fs';
import path from 'node:path';

import { runCapabilityJson } from './capability.mjs';

export const MCP_LIST_SCHEMA = 'mcp.list.v1';
/** 只有这四个动作能到达命令行；不在表里的 action 一律拒绝（不做前缀匹配、不做透传）。 */
export const MCP_ACTIONS = Object.freeze(['add', 'remove', 'adopt', 'doctor']);
export const MCP_SCOPES = Object.freeze(['home', 'project']);
/** 服务名：与 CLI 的落点桶键同一字符集，且长度有上限（防超长 argv）。 */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const MAX_ENTRY_BYTES = 8192;
export const EVIDENCE_DIR = path.join('docs', 'evidence', '2026-11-05-mcp-landing');

/**
 * 读证据卡（w7 产出）：落点键 → `{ status, reason }`。缺目录就是「没有证据」，不是错误。
 * 只认**按落点命名的卡**（`<clientId>-<scope>.json`）；`index.json` 是汇总、`headroom-mcp.json` 属于另一件事，
 * 它们不是任何落点的证据。卡里说 `verified` 才算验证过——存在一张 `host-unsupported` 的卡不等于通过。
 */
export function readEvidenceKeys({ rootDir = process.cwd(), dir = EVIDENCE_DIR } = {}) {
  const cards = new Map();
  const base = path.join(rootDir, dir);
  let names = [];
  try {
    names = fs.readdirSync(base);
  } catch {
    return cards;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    if (name === 'index.json' || !/^[a-z0-9]+-[a-z]+$/u.test(name.slice(0, -'.json'.length))) continue;
    try {
      const card = JSON.parse(fs.readFileSync(path.join(base, name), 'utf8'));
      cards.set(name.slice(0, -'.json'.length), {
        status: String(card?.status || 'unverified'),
        reason: String(card?.reason || ''),
      });
    } catch {
      // 读不回来的卡不当作证据：宁可显示未验证，也不要拿一份坏 JSON 说「已验证」。
    }
  }
  return cards;
}

function landingKey(clientId, scope) {
  return `${clientId}-${scope}`;
}

/**
 * 落点状态 token。判据只有两条客观事实：`aios mcp list` 怎么说这份落点、有没有证据卡。
 * 顺序是有意的——「读失败」压过「未验证」：连配置都没读成功时，说「未验证」是错的。
 */
/**
 * @param {{ status?: string, reason?: string, registered?: boolean, unverifiedFields?: string[], clientId?: string, scope?: string } | null} landing
 * @param {{ evidence?: Set<string> }} [options]
 * @returns {{ token: string, reason: string }}
 */
export function deriveLandingStatus(landing, { evidence = new Map() } = {}) {
  if (!landing) return { token: 'landing-unregistered', reason: 'no landing resolved' };
  // ① 读失败压过一切：连配置都读不出来时，说「未验证」是错的（那会让失败看起来像没测）。
  if (landing.status === 'error') {
    return { token: 'landing-error', reason: String(landing.reason || 'config read failed') };
  }
  // ② 证据卡在就先看它。存在卡 ≠ 通过：只有卡里写 `verified` 才是验证过。
  //    `host-unsupported`（这台机器没装该客户端）与 `unverified` 都必须照实显示成未验证 + 原文。
  const card = evidence.get(landingKey(landing.clientId, landing.scope));
  if (card) {
    return card.status === 'verified'
      ? { token: 'landing-verified', reason: '' }
      : { token: 'landing-unverified', reason: card.reason || `evidence card says ${card.status}` };
  }
  // ③ 没有证据时，「声明表里没有这个落点」是一条可核对的事实（pi 的用户级就是这种：
  //    声明表把它登记成 format 'none'，真实落点由补表提供）。它不该压过证据，但没有证据时它就是解释。
  if (!landing.registered) {
    return { token: 'landing-unregistered', reason: 'declaration table (CLIENT_MCP_TARGETS) has no such landing' };
  }
  const unverified = Array.isArray(landing.unverifiedFields) ? landing.unverifiedFields : [];
  return {
    token: 'landing-unverified',
    reason: unverified.length > 0
      ? `unverified fields: ${unverified.join(', ')}`
      : 'no client evidence recorded yet',
  };
}

/** 一行一个 MCP server；身份是 (client, scope, name)，不是名字（同名条目在不同落点是不同对象）。 */
/**
 * @param {unknown} payload
 * @param {{ evidence?: Set<string> }} [options]
 * @returns {Array<Record<string, unknown>>}
 */
export function flattenMcpServers(payload, { evidence = new Map() } = {}) {
  const landings = Array.isArray(payload?.landings) ? payload.landings : [];
  const rows = [];
  for (const landing of landings) {
    const status = deriveLandingStatus(landing, { evidence });
    const servers = Array.isArray(landing.servers) ? landing.servers : [];
    for (const server of servers) {
      rows.push({
        id: `${landing.clientId}/${landing.scope}/${server.name}`,
        name: String(server.name || ''),
        clientId: String(landing.clientId || ''),
        scope: String(landing.scope || ''),
        file: String(landing.file || ''),
        format: String(landing.format || ''),
        entryPath: String(landing.entryPath || ''),
        writable: landing.writable !== false,
        ownership: String(server.ownership || 'unknown'),
        fields: Array.isArray(server.fields) ? [...server.fields] : [],
        envKeys: Array.isArray(server.envKeys) ? [...server.envKeys] : [],
        fingerprint: String(server.fingerprint || ''),
        lastVerifiedAt: server.lastVerifiedAt ?? null,
        bucketCreated: server.bucketCreated === true,
        note: String(landing.note || ''),
        ledgerCorrupt: String(landing.ledgerCorrupt || ''),
        status: status.token,
        statusReason: status.reason,
      });
    }
  }
  return rows;
}

/** 页头数字。每个数字都由 payload 数出来，缺字段时如实给 0（不是「大概有」）。 */
export function summarizeMcp(payload, { evidence = new Map() } = {}) {
  const landings = Array.isArray(payload?.landings) ? payload.landings : [];
  const rows = flattenMcpServers(payload, { evidence });
  const count = (predicate) => rows.filter(predicate).length;
  const landingCount = (token) => landings.filter((landing) => deriveLandingStatus(landing, { evidence }).token === token).length;
  const counts = payload?.counts && typeof payload.counts === 'object' ? payload.counts : {};
  return {
    landings: landings.length,
    writableLandings: landings.filter((landing) => landing.writable !== false).length,
    servers: rows.length,
    owned: count((row) => row.ownership === 'owned'),
    external: count((row) => row.ownership === 'external'),
    conflict: count((row) => row.ownership === 'conflict'),
    keptDiffers: count((row) => row.ownership === 'kept-differs'),
    landingVerified: landingCount('landing-verified'),
    landingUnverified: landingCount('landing-unverified'),
    landingError: landingCount('landing-error'),
    landingUnregistered: landingCount('landing-unregistered'),
    drift: Array.isArray(counts.drift) ? counts.drift : Array.isArray(payload?.drift) ? payload.drift : [],
  };
}

function knownLanding(landings, client, scope) {
  return (landings || []).find((landing) => landing.clientId === client && landing.scope === scope) || null;
}

/**
 * 构造 `aios mcp ...` 的 argv（**不含 node 与脚本路径**，那是 runner 的事）。
 * 任何不合法输入都返回 `{ error }` 而**不是**抛异常或猜一个值——调用方据此回 400。
 * `landings` 必须是刚取回的 payload 落点表：client/scope 的合法性来自事实，不来自本文件的常量。
 */
/**
 * @param {string} action
 * @param {{ client?: string, scope?: string, name?: string, entry?: unknown, dryRun?: boolean, adopt?: boolean, restore?: boolean, force?: boolean }} [input]
 * @param {{ landings?: Array<{ clientId?: string, scope?: string, writable?: boolean }> }} [context]
 * @returns {{ argv: string[] } | { error: string }}
 */
export function buildMcpArgv(action, input = {}, { landings = [] } = {}) {
  if (!MCP_ACTIONS.includes(action)) return { error: `unknown action: ${String(action)}` };
  const client = typeof input.client === 'string' ? input.client : '';
  if (action === 'doctor') {
    // doctor 是整表体检，客户端可有可无；给了就必须是已知落点里的客户端。
    if (client && !landings.some((landing) => landing.clientId === client)) return { error: 'unknown client' };
    const argv = ['mcp', 'doctor'];
    if (client) argv.push('--client', client);
    argv.push('--json');
    return { argv };
  }

  // 不 trim：带首尾空白或换行的名字不是「顺手清理一下」就能变成合法值的输入——
  // 它是调用方给错了东西，如实拒绝。表单自己要在提交前 trim（那是显示层的事）。
  const name = typeof input.name === 'string' ? input.name : '';
  if (!NAME_PATTERN.test(name)) return { error: 'invalid server name' };
  if (!client) return { error: 'client is required' };
  if (!landings.some((landing) => landing.clientId === client)) return { error: 'unknown client' };
  const scope = input.scope === undefined ? 'home' : String(input.scope);
  if (!MCP_SCOPES.includes(scope)) return { error: `invalid scope: ${scope}` };
  const landing = knownLanding(landings, client, scope);
  if (!landing) return { error: `unknown landing: ${client}/${scope}` };
  if (landing.writable === false) return { error: `landing-not-writable: ${client}/${scope}` };

  const argv = ['mcp', action, name, '--client', client, '--scope', scope];
  if (action === 'add') {
    const entry = input.entry;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { error: 'entry must be a JSON object' };
    const text = JSON.stringify(entry);
    if (text.length > MAX_ENTRY_BYTES) return { error: `entry exceeds ${MAX_ENTRY_BYTES} bytes` };
    argv.push('--entry', text);
  }
  for (const [flag, key] of [['--dry-run', 'dryRun'], ['--adopt', 'adopt'], ['--restore', 'restore'], ['--force', 'force']]) {
    if (input[key] === true) argv.push(flag);
  }
  argv.push('--json');
  return { argv };
}

/** 会写盘的 action：API 层要求 `confirm: true`（与 `/api/actions/<id>` 同一约定）。 */
export function actionWrites(action) {
  return action === 'add';
}

/**
 * 取一次列表。`evidence` 默认从磁盘读（w7 的证据卡），测试可注入。
 * 返回 `{ ok: true, data, rows, summary }` 或 `{ ok: false, error }`。
 */
/**
 * @param {{ rootDir?: string, runImpl?: Function, timeoutMs?: number, evidence?: Set<string> }} [options]
 * @returns {Promise<{ ok: true, data: unknown, rows: Array<Record<string, unknown>>, summary: Record<string, unknown>, exitCode?: number } | { ok: false, error: string }>}
 */
export async function loadMcpList({ rootDir, runImpl, timeoutMs, evidence } = {}) {
  const result = await runCapabilityJson(['mcp', 'list', '--json'], { rootDir, runImpl, timeoutMs });
  if (!result.ok) return result;
  const data = result.data;
  if (!data || data.schema !== MCP_LIST_SCHEMA) {
    return { ok: false, error: `unexpected schema: ${String(data?.schema ?? '(none)')}` };
  }
  const keys = evidence ?? readEvidenceKeys({ rootDir: rootDir ?? process.cwd() });
  return { ok: true, data, rows: flattenMcpServers(data, { evidence: keys }), summary: summarizeMcp(data, { evidence: keys }), exitCode: result.exitCode };
}