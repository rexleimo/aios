// scripts/tests/clients/mcp-formats/mcp-landing-schema.test.mjs — w1-landing-schema 验收。
//
// fixture 的键集全部抄自 2026-11-05 的本机只读探测（只看键名与值类型，未记录任何配置值），
// 因此这里断言的是「真实形状能不能过白名单」，不是「白名单想当然的形状」。
// 测试不碰任何真实配置文件，全部 hermetic。
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MCP_LANDING_OVERRIDES,
  assertEntryAllowed,
  findLandingDrift,
  listLandingClients,
  resolveLanding,
} from '../../../lib/clients/mcp/landing-schema.mjs';
import { OPENCODE_MCP_TIMEOUT_MS } from '../../../lib/clients/opencode/config.mjs';

const REAL_SHAPES = Object.freeze({
  'claude/home': { type: 'stdio', command: 'node', args: [], env: {}, startupTimeoutSec: 10 },
  'claude/project': { command: 'node', args: [], type: 'stdio', cwd: '.' },
  'codex/home': { command: 'node', args: [], type: 'stdio', startup_timeout_sec: 10 },
  'codex/project': { command: 'node', args: [], type: 'stdio', approval_mode: 'approve-all' },
  'gemini/home': { type: 'stdio', command: 'node', args: [], env: {}, timeout: 10 },
  'gemini/project': { command: 'node', args: [], type: 'stdio', cwd: '.' },
  'opencode/home': { type: 'local', command: ['node', 'x'], enabled: true, environment: {} },
  'hermes/home': { command: 'node', args: [], env: {} },
  'hermes/project': { command: 'node', args: [], type: 'stdio', cwd: '.' },
  'grok/home': { command: 'node', args: [], type: 'stdio', startup_timeout_sec: 10, url: '', enabled: true },
  'grok/project': { type: 'stdio', command: 'node', args: [], startup_timeout_sec: 10 },
  'workbuddy/home': { type: 'stdio', command: 'node', args: [], startupTimeoutSec: 10, env: {} },
  'qoder/home': { args: [], command: 'node', env: {}, startupTimeoutSec: 10, type: 'stdio' },
  'qoder/project': { type: 'stdio', command: 'node', args: [], startupTimeoutSec: 10, env: {} },
  // zcode 只有一种可写形状：schema 白名单（`type` + 可选 `timeoutMs`）。`transport` 是用户自有
  // 条目在磁盘上的样子，zcode 自己的 CLI 日志把 `transport` 记为 Unrecognized key——用它当写入门等于
  // 拒绝实际能用的形状。两个 scope 同一条白名单（schema 不分 home/project）。
  'zcode/home': { type: 'stdio', command: 'node', args: [], env: {}, timeoutMs: 10 },
  'zcode/project': { type: 'stdio', command: 'node', args: [], env: {}, timeoutMs: 10 },
  'pi/home': { command: 'uvx', args: ['code-review-graph', 'serve'], lifecycle: 'lazy' },
});

test('每个登记的 (client, scope) 都能解析出落点与白名单', () => {
  const combos = [];
  for (const clientId of listLandingClients()) {
    for (const scope of Object.keys(MCP_LANDING_OVERRIDES[clientId])) combos.push(`${clientId}/${scope}`);
  }
  // 每个可写落点都要有真实形状 fixture；唯一不可写的 pi/project 例外（单独断言）
  const expected = combos.filter((combo) => combo !== 'pi/project');
  assert.deepEqual(Object.keys(REAL_SHAPES).sort(), expected.sort(), '真实形状表必须逐对齐全补表');
  for (const combo of combos) {
    const [clientId, scope] = combo.split('/');
    const landing = resolveLanding(clientId, scope);
    assert.ok(landing.file, `${combo} 必须有落点文件`);
    assert.ok(landing.entryPath, `${combo} 必须有条目桶点路径`);
    assert.ok(landing.allowedFields.length > 0, `${combo} 必须有非空白名单`);
    assert.ok(['json', 'toml', 'yaml', 'opencode-json', 'gemini-json', 'zcode-json', 'none'].includes(landing.format), `${combo} format=${landing.format}`);
  }
});

test('真实条目形状全部过白名单', () => {
  for (const [combo, entry] of Object.entries(REAL_SHAPES)) {
    const [clientId, scope] = combo.split('/');
    if (scope === 'project' && clientId === 'pi') continue; // 唯一不可写落点，单独断言
    const verdict = assertEntryAllowed(clientId, scope, entry);
    assert.equal(verdict.reason, 'ok', `${combo} 应通过，实得 ${verdict.reason} unknown=${verdict.unknownFields}`);
    assert.equal(verdict.ok, true, combo);
  }
});

test('gemini 项目级的 cwd 放行但标为待证，不许混进「已验」', () => {
  const landing = resolveLanding('gemini', 'project');
  assert.deepEqual(landing.unverifiedFields, ['cwd']);
  assert.equal(assertEntryAllowed('gemini', 'project', { command: 'node', args: [], type: 'stdio', cwd: '.' }).ok, true);
  // home 白名单不含 cwd 与 startupTimeoutSec：同一 client 两种 scope 不能共用一份白名单
  assert.deepEqual(assertEntryAllowed('gemini', 'home', { command: 'node', args: [], cwd: '.' }).unknownFields, ['cwd']);
});

test('gemini 的 startupTimeoutSec 必须被判未知字段（最危险的实测坑）', () => {
  const verdict = assertEntryAllowed('gemini', 'home', { type: 'stdio', command: 'node', args: [], startupTimeoutSec: 10 });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'unknown-field');
  assert.deepEqual(verdict.unknownFields, ['startupTimeoutSec']);
});

test('zcode 两个 scope 共用 schema 白名单，未知字段（含 transport）一律拒', () => {
  const real = { type: 'stdio', command: 'node', args: [], env: {}, timeoutMs: 10 };
  for (const scope of ['home', 'project']) {
    assert.deepEqual(assertEntryAllowed('zcode', scope, real).unknownFields, [], `${scope} 的实测形状必须过`);
    // 写进 zcode 的条目不能带 schema 外的字段：zcode 会逐条丢弃（不是报错），静默失效比拒绝更糟。
    assert.deepEqual(assertEntryAllowed('zcode', scope, { ...real, transport: 'stdio' }).unknownFields, ['transport']);
  }
  // 用户自有的 `pencil` 条目就是 transport 形状——它证明的是“磁盘上有这种条目”，不是“我们能这么写”。
  assert.equal(assertEntryAllowed('zcode', 'home', { transport: 'stdio', command: 'node' }).ok, false);
});

test('pi 条目缺 lifecycle 即拒——它必须与 Pi 自己的写入器逐字节一致', () => {
  const verdict = assertEntryAllowed('pi', 'home', { command: 'node', args: [] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'required-field-missing');
  assert.deepEqual(verdict.missingFields, ['lifecycle']);
});

test('pi/home 允许 env：pi 自己的写入器给 headroom 就写 env，白名单漏了它等于收编后静默丢条目', () => {
  // 形状取自 mcp-adapter.mjs:103-108（pi-mcp-adapter.test.mjs:58-66 钉住同一个形状）。
  const headroom = {
    command: '/opt/bin/headroom',
    args: ['mcp', 'serve'],
    env: { HEADROOM_MCP_CLIENT: 'pi', HEADROOM_MCP_READ: 'off' },
    lifecycle: 'lazy',
  };
  const verdict = assertEntryAllowed('pi', 'home', headroom);
  assert.equal(verdict.ok, true, JSON.stringify(verdict));
  assert.deepEqual(verdict.unknownFields, []);
  // 反向钉住「白名单不是无界放行」：pi 不接受 stdio 家族才有的 type。
  assert.deepEqual(assertEntryAllowed('pi', 'home', { ...headroom, type: 'stdio' }).unknownFields, ['type']);
});

test('pi 项目级不是本控制台的写入门（适配器自己读仓库 .mcp.json）', () => {
  const landing = resolveLanding('pi', 'project');
  assert.equal(landing.writable, false);
  const verdict = assertEntryAllowed('pi', 'project', { command: 'node', args: [], type: 'stdio' });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'landing-not-writable');
});

test('opencode 落点声明它还需要根键 experimental.mcp_timeout，并自带补建用的默认值', () => {
  // 形状是 `{ path, createWith }`：w5a 起这一格真的被写路径消费，只有名字没有默认值就等于声明了个没法兑现的要求。
  // 默认值不在这里重述数字——引 `clients/opencode/config.mjs` 的唯一所有者常量。
  assert.deepEqual(resolveLanding('opencode', 'home').requiresRootKeys, [{ path: 'experimental.mcp_timeout', createWith: OPENCODE_MCP_TIMEOUT_MS }]);
  assert.equal(resolveLanding('claude', 'home').requiresRootKeys.length, 0, '其余落点没声明桶外根键');
});

test('createIfMissing 按声明表的 per-scope 默认解析：project 可建文件，home 未写即不建', () => {
  // `definitions.mjs:265` 写的是「null/undefined 按消费方默认（home false、project true）」。
  // 补表以前把没登记的落点一律当 true、登记的按 Boolean(值)，于是 codex/gemini/zcode 的 project
  // （声明里没写这一格）全被判成 false——新建仓库第一次装 MCP 恰好在 project 上。w5a 让它进写路径，先算对。
  assert.equal(resolveLanding('codex', 'project').createIfMissing, true, 'project 没写即为 true');
  assert.equal(resolveLanding('claude', 'project').createIfMissing, true);
  assert.equal(resolveLanding('gemini', 'project').createIfMissing, true);
  assert.equal(resolveLanding('codex', 'home').createIfMissing, true, 'home 显式写了 true');
  assert.equal(resolveLanding('pi', 'home').createIfMissing, true, '未登记的 pi 由补表显式补 true');
});

test('补表把「权威表没登记的落点」暴露成 drift，而不是静默跳过', () => {
  const drift = findLandingDrift();
  const piHome = drift.find((item) => item.clientId === 'pi' && item.scope === 'home');
  assert.ok(piHome, 'pi/home 必须是 unregistered-in-declaration-table');
  assert.equal(piHome.kind, 'unregistered-in-declaration-table');
  assert.equal(piHome.declaredFormat, 'none');
  assert.equal(piHome.overrideFile, 'mcp.json');
});

test('hermes 的真实桶是 mcp_servers，且 scope 级 namespace 必须压过 client 级', () => {
  // 作废的旧结论：hermes 有 mcp_servers.mcp.<name> 的额外嵌套（实测无此层）。
  // 仍然成立的事实：声明表的 client 级 namespace 是 mcpServers，home scope 才是 mcp_servers
  // （definitions.mjs:309-314）。读 client 级就会把对的表读成错的——w1 自己踩过。
  assert.equal(resolveLanding('hermes', 'home').entryPath, 'mcp_servers');
  assert.equal(resolveLanding('hermes', 'project').entryPath, 'mcpServers');
  const drift = findLandingDrift().filter((item) => item.clientId === 'hermes');
  assert.deepEqual(drift, [], '正确读取时 hermes 不该被判漂移');
  // 反向证明优先级：把 scope 级 namespace 抹掉，漂移就该出现。
  const crippled = findLandingDrift({
    targets: { hermes: { format: 'json', namespace: 'mcpServers', scopes: [{ scope: 'home', file: 'config.yaml', format: 'yaml' }] } },
  }).filter((item) => item.clientId === 'hermes' && item.kind === 'entry-path-differs');
  assert.equal(crippled.length, 1);
  assert.equal(crippled[0].declared, 'mcpServers');
});

test('未登记的 (client, scope) 直接抛错，不返回半截事实', () => {
  assert.throws(() => resolveLanding('workbuddy', 'project'), /unknown MCP landing/);
});
