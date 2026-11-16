// 网关启停 API 与界面控制卡的契约守卫（#45/#46）。
// 只测客观源码事实：启停是副作用 → 必须有 confirm 门；HTTP body 永不进 shell；argv 是白名单数组；
// 控制卡走共享导入面、用确认弹窗、按 active 门控轮询；进程管理 CWD 不入安装树。不需要起 Next 服务。
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ui = (file) => new URL(`../../../../../apps/shell/ui/${file}`, import.meta.url);
const lib = (file) => new URL(`../../../../../scripts/lib/tooling/model-router/${file}`, import.meta.url);
const read = (url) => readFileSync(url, 'utf8');

test('启停 API：闭合动作集合 + confirm 门 + 端口校验，body 永不进 shell', () => {
  const route = read(ui('src/app/api/model-routing/gateway/route.ts'));
  assert.match(route, /new Set\(\['start', 'stop', 'connect', 'disconnect'\]\)/u, '动作必须是闭合集合');
  assert.match(route, /confirmation-required/u, '缺 confirm 必须 409');
  assert.match(route, /body\.confirm !== true/u);
  assert.match(route, /invalid-port/u, '端口必须整数校验');
  assert.match(route, /gateway-status/u, 'GET 走只读状态');
  assert.match(route, /execFile/u, '用 execFile 数组 argv');
  assert.doesNotMatch(route, /shell:\s*true/u, '不许开 shell');
  assert.doesNotMatch(route, /execSync|[^.]exec\(/u, '不许字符串命令');
  assert.doesNotMatch(route, /\[\s*script\s*,[^;]*body\./u, '不许把 body 直接拼进 argv');
});

test('生命周期模块：CWD 走单一 owner 挪出安装树，detached 托管，SIGTERM 优雅停', () => {
  const daemon = read(lib('lifecycle/daemon.mjs'));
  assert.match(daemon, /resolveCwdOutsideRootDir/u, 'CWD 判定只有一个 owner');
  assert.match(daemon, /detached:\s*true/u);
  assert.match(daemon, /SIGTERM/u);
  assert.match(daemon, /SIGKILL/u, '优雅停不下来才兜底');
  assert.doesNotMatch(daemon, /shell:\s*true/u);
  // 状态是客观事实：pid 活 + 端口应答才算运行；残留 pidfile 标 stale。
  assert.match(daemon, /stale/u);
  assert.match(daemon, /managed/u);
});

test('控制卡：共享导入面 + 确认弹窗 + confirm:true + active 门控轮询，不 import scripts/lib', () => {
  const card = read(ui('src/components/console/model-routing/gateway-control.tsx'));
  assert.match(card, /from '\.\.\/console-ui'/u, '只从共享面取件');
  assert.match(card, /Modal/u, '启停前确认');
  assert.match(card, /confirm:\s*true/u, 'POST 必须带确认');
  assert.match(card, /navigator\.clipboard/u, '命令可一键复制');
  assert.match(card, /if \(!active\) return/u, '非激活不轮询');
  assert.match(card, /\/api\/model-routing\/gateway/u);
  assert.doesNotMatch(card, /scripts\/lib/u, 'UI 不得 import scripts/lib');
  assert.doesNotMatch(card, /fieldClass|className=\{`[^`]*\$\{[^`]*\?/u, '不手搓条件样式汤');
});

test('共享网关工作台接入控制卡，按 active 与分区门控轮询；两个视图共用一个挂载', () => {
  const gateway = read(ui('src/components/console/gateway-workspace.tsx'));
  assert.match(gateway, /<GatewayControl active=\{active && section === 'overview'\}/u);
  assert.match(gateway, /<AgentOverview[\s\S]*?active=\{active && section === 'overview'\}/u);
  assert.equal((gateway.match(/useRoutingConfig\(\)/gu) || []).length, 1, '所有编辑面共用一份草稿');
  const workspace = read(ui('src/components/console/console-workspace.tsx'));
  assert.equal((workspace.match(/<GatewayWorkspace/gu) || []).length, 1);
  assert.match(workspace, /<GatewayWorkspace[\s\S]*?active=\{view === 'routing' \|\| view === 'routingConfig'\}/u);
  assert.doesNotMatch(workspace, /<ModelRoutingPanel/u, '退役的重复工作台不能继续挂载');
});

test('接入命令构造是单一事实源：connect 与 lifecycle 都复用 artifacts', () => {
  const artifacts = read(lib('connect/artifacts.mjs'));
  assert.match(artifacts, /export function connectLaunchCommand/u);
  const connect = read(lib('connect/command.mjs'));
  assert.match(connect, /connectLaunchCommand/u);
  assert.doesNotMatch(connect, /function launchCommand/u, '私有副本已删除，避免两份命令字符串');
  const daemon = read(lib('lifecycle/daemon.mjs'));
  assert.match(daemon, /connectLaunchCommand/u);
});

test('就地接入：API 客户端闭合校验 + 卡 per-client 接入/还原 + 外科编辑器原子写/备份/内联 token', () => {
  const route = read(ui('src/app/api/model-routing/gateway/route.ts'));
  assert.match(route, /new Set\(\['claude', 'codex', 'pi'\]\)/u, '客户端必须是闭合集合');
  assert.match(route, /invalid-client/u, '非法客户端必须 400');
  const card = read(ui('src/components/console/model-routing/gateway-control.tsx'));
  assert.match(card, /runConnectAction/u, 'per-client 接入/还原走确认门');
  assert.match(card, /action, confirm: true, client/u, '接入 POST 带 client + 确认');
  assert.match(card, /--isolated/u, '隔离模式降为可折叠兜底');
  const inplace = read(lib('connect/inplace.mjs'));
  assert.match(inplace, /renameSync/u, '原子写（temp+rename）');
  assert.match(inplace, /connect-backup\.json/u, '原值备份落盘供还原');
  const editors = read(lib('connect/editors.mjs'));
  assert.match(editors, /experimental_bearer_token/u, 'codex 内联占位 token，免 shell env');
  assert.match(editors, /aios-gateway:begin/u, 'codex 块带标记，可识别/移除');
});

test('模型来源：动态发现端点单一源 + 刷新 confirm 门 + 自定义入口走共享面、不 import scripts/lib', () => {
  const route = read(ui('src/app/api/model-routing/models/route.ts'));
  assert.match(route, /confirmation-required/u, '刷新写注册表是副作用，需确认');
  assert.match(route, /'models', '--refresh', '--json'/u, '经 CLI 调发现/合并');
  assert.match(route, /execFile/u, 'execFile 数组 argv');
  assert.doesNotMatch(route, /shell:\s*true/u, '不许开 shell');
  const section = read(ui('src/components/console/model-routing/model-source-section.tsx'));
  assert.match(section, /from '\.\.\/console-ui'/u, '只从共享面取件');
  assert.match(section, /刷新模型/u, '有刷新入口');
  assert.match(section, /onRefresh/u);
  assert.doesNotMatch(section, /scripts\/lib/u, 'UI 不得 import scripts/lib');
  const discovery = read(lib('routing/discovery.mjs'));
  assert.match(discovery, /resolveProviderModelsEndpoint/u, '模型列表端点单一源，尊重供应商路径格式');
  assert.match(discovery, /errors\.push/u, '某协议失败 fail-soft 不炸');
  const protocols = read(lib('routing/protocols.mjs'));
  assert.match(protocols, /export function protocolModelsEndpoint/u);
});

test('real gateway handler forwards the actual port and rejects stale, stopped or invalid connections without client writes', async (t) => {
  const routeUrl = ui('src/app/api/model-routing/gateway/route.ts');
  const executable = stripTypeScriptTypes(read(routeUrl), { sourceUrl: routeUrl.href })
    .replace(/from '(\.[^']+)'/gu, (_match, specifier) => `from '${new URL(specifier, routeUrl).href}'`);
  const { POST } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-gateway-api-'));
  const previous = process.env.AIOS_PROJECT_ROOT;
  const previousFetch = globalThis.fetch;
  let health = { ok: true, ready: true, configuredModels: 1, readyModels: 1 };
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'http://127.0.0.1:3127/health', 'only an intercepted local health check is allowed');
    return Response.json(health);
  };
  process.env.AIOS_PROJECT_ROOT = root;
  t.after(() => {
    if (previous === undefined) delete process.env.AIOS_PROJECT_ROOT;
    else process.env.AIOS_PROJECT_ROOT = previous;
    globalThis.fetch = previousFetch;
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'scripts'));
  // A fake CLI records argv, never starts a gateway or opens a real client config.
  fs.writeFileSync(path.join(root, 'scripts', 'aios.mjs'), `
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
console.log(args[1] === 'gateway-status' ? fs.readFileSync('status.json', 'utf8') : JSON.stringify({ ok: true }));
`);
  const setStatus = (status) => fs.writeFileSync(path.join(root, 'status.json'), JSON.stringify(status));
  const calls = () => fs.existsSync(path.join(root, 'calls.jsonl')) ? fs.readFileSync(path.join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : [];
  const post = async (body) => {
    const response = await POST(new Request('http://localhost/api/model-routing/gateway', { method: 'POST', body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  for (const body of [null, [], 'invalid', { action: 'connect', confirm: true }, ...[65536, 2.5, true, '3127', [3127]].map(port => ({ action: 'start', confirm: true, port }))]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal((await post({ action: 'connect', port: 3127 })).status, 409);
  assert.deepEqual(calls(), [], 'validation and confirmation precede every CLI invocation');
  setStatus({ running: true, port: 3127 });
  assert.equal((await post({ action: 'connect', confirm: true, client: 'codex', port: 3127 })).body.ok, true);
  assert.deepEqual(calls().at(-1), ['model-router', 'connect', '--json', '--port', '3127', '--client', 'codex']);
  health = { ok: true, ready: false, configuredModels: 0, readyModels: 0 };
  assert.equal((await post({ action: 'connect', confirm: true, client: 'codex', port: 3127 })).status, 409);
  assert.equal(calls().at(-1)[1], 'gateway-status', 'a listening but unready gateway cannot reach client writes');
  for (const status of [{ running: false, port: 3127 }, { running: true, port: 8686 }]) {
    setStatus(status);
    assert.equal((await post({ action: 'connect', confirm: true, port: 3127 })).status, 409);
    assert.equal(calls().at(-1)[1], 'gateway-status', 'a changed gateway must never reach connect');
  }
  assert.equal((await post({ action: 'disconnect', confirm: true, client: 'codex' })).status, 200);
  assert.deepEqual(calls().at(-1), ['model-router', 'disconnect', '--json', '--client', 'codex'], 'restore remains available while stopped');
  assert.equal((await post({ action: 'start', confirm: true, port: 3127 })).status, 200);
  assert.deepEqual(calls().at(-1), ['model-router', 'gateway-start', '--json', '--port', '3127']);
});
