// Exercise the real development server through its token gate and current Console routes.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runGatewayBrowserChecks } from '../browser/gateway-workspace.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const NEXT_BIN = path.join(ROOT, 'apps', 'shell', 'ui', 'node_modules', 'next', 'dist', 'bin', 'next');
const LAUNCHER = path.join(ROOT, 'scripts', 'aios-ui.mjs');

test('layered Console controls share one Radix dismissal and focus registry', () => {
  const ui = path.join(ROOT, 'apps/shell/ui');
  const lock = JSON.parse(fs.readFileSync(path.join(ui, 'package-lock.json'), 'utf8'));
  for (const registry of ['react-dismissable-layer', 'react-focus-scope']) {
    const name = `@radix-ui/${registry}`;
    assert.deepEqual(Object.keys(lock.packages).filter(key => key.endsWith(`/${name}`)), [`node_modules/${name}`]);
    if (!fs.existsSync(NEXT_BIN)) continue;
    const require = createRequire(path.join(ui, 'package.json'));
    const shared = fs.realpathSync(require.resolve(name));
    for (const owner of ['react-dialog', 'react-select', 'react-popover', 'react-tooltip']) {
      assert.equal(fs.realpathSync(createRequire(require.resolve(`@radix-ui/${owner}`)).resolve(name)), shared);
    }
    const menuRequire = createRequire(require.resolve('@radix-ui/react-dropdown-menu'));
    assert.equal(fs.realpathSync(createRequire(menuRequire.resolve('@radix-ui/react-menu')).resolve(name)), shared);
  }
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
async function waitFor(predicate, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
function stopTree(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch { /* Already stopped. */ }
}
async function request(port, pathname, { cookie, headers, method, body } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    redirect: 'manual',
    headers: { ...(cookie ? { cookie } : {}), ...headers },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  return { status: response.status, headers: response.headers, body: response.status === 200 ? await response.text() : '' };
}

// The two browser suites this drives take ~5-6 minutes on a clean CI runner
// (measured 316s locally with a warm cache); 300s was too tight and made every
// downstream subtest report a misleading "browser has been closed" cascade.
test('the development server serves the current Console through the token gate', { timeout: 600_000 }, async t => {
  if (!fs.existsSync(NEXT_BIN)) {
    t.skip('ui dependencies are not installed (run: npm run ui:setup)');
    return;
  }
  const port = await freePort();
  // A different port still shares Next's dev lock. Copy the small app, not the user's build.
  const ui = path.join(ROOT, 'apps/shell/ui');
  const sandboxParent = path.join(ROOT, '.cache', 'aios-ui-acceptance');
  fs.mkdirSync(sandboxParent, { recursive: true });
  const sandbox = fs.mkdtempSync(path.join(sandboxParent, 'trust-'));
  const sandboxUi = path.join(sandbox, 'apps/shell/ui');
  fs.mkdirSync(sandboxUi, { recursive: true });
  for (const entry of fs.readdirSync(ui)) {
    if (['.next', 'node_modules', 'tsconfig.tsbuildinfo'].includes(entry)) continue;
    fs.cpSync(path.join(ui, entry), path.join(sandboxUi, entry), { recursive: true });
  }
  fs.symlinkSync(path.join(ui, 'node_modules'), path.join(sandboxUi, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.writeFileSync(path.join(sandboxUi, 'next.config.mjs'), `import config from ${JSON.stringify(path.join(ui, 'next.config.mjs'))};\nexport default { ...config, turbopack: { ...config.turbopack, root: ${JSON.stringify(ROOT)} } };\n`);
  const child = spawn(process.execPath, [LAUNCHER, 'dev', '--root', sandbox, '--port', String(port)], {
    cwd: ROOT, detached: process.platform !== 'win32', env: { ...process.env, AIOS_UI_PORT: String(port), AIOS_PROJECT_ROOT: ROOT }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  t.after(() => {
    stopTree(child);
    if (process.env.AIOS_GATEWAY_TEST_ARTIFACTS) {
      fs.mkdirSync(process.env.AIOS_GATEWAY_TEST_ARTIFACTS, { recursive: true });
      fs.writeFileSync(path.join(process.env.AIOS_GATEWAY_TEST_ARTIFACTS, 'dev-server.log'), output);
    }
    fs.rmSync(sandbox, { recursive: true, force: true });
  });
  const tokenFile = path.join(os.tmpdir(), `aios-ui-token-${port}`);
  assert.ok(await waitFor(() => fs.existsSync(tokenFile), 30_000), 'launcher must publish its token');
  const token = fs.readFileSync(tokenFile, 'utf8').trim();
  assert.match(token, /^[0-9a-f]{32}$/u);
  assert.ok(output.includes(`open http://127.0.0.1:${port}/t/${token}/`), 'launcher must print its bootstrap URL');
  const ready = await waitFor(async () => {
    if (child.exitCode !== null) return true;
    try { return (await request(port, '/')).status === 403; } catch { return false; }
  });
  assert.ok(ready && child.exitCode === null, `the gate must answer before serving the page\n${output}`);

  const bare = await request(port, '/');
  assert.equal(bare.status, 403);
  assert.equal(bare.headers.get('x-aios-deny'), 'missing-token');
  const exchange = await request(port, `/t/${token}/`);
  assert.ok([307, 308].includes(exchange.status));
  if (exchange.status === 307) {
    const setCookie = exchange.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /aios_ui_token=/u);
    assert.match(setCookie, /HttpOnly/u);
    assert.match(setCookie, /SameSite=strict/iu);
  }
  const cookie = `aios_ui_token=${token}`;
  const page = await request(port, '/', { cookie });
  assert.equal(page.status, 200, output);
  // 首屏必须是**本机真实事实**，不是被批准的口号或全局示例横幅
  // （docs/plans/2026-11-07-product-landing-roadmap.md 问题 1/7；契约改动记录于
  //  docs/plans/2026-11-07-stage0-real-data-measurement.md）。
  // 页头说的是「哪个工作区 + 本次采集耗时」：选中项与数据必须同源，不能再出现
  // 「显示 10-27 但记忆是 11-07」那种两个面不同新鲜度的并排。
  assert.match(page.body, /工作区 <strong/u, 'the header must name the workspace it collected for');
  assert.match(page.body, /一次采集/u);
  // 首页是 magpie 路由总览：每个 agent 一行，行内如实标注本机有没有配置落点（真实事实，不是示例）。
  assert.match(page.body, /最近请求与配置默认，分开看清/u, 'home must render the read-only routing overview');
  assert.match(page.body, /本机有配置落点|本机无落点/u, 'each agent row must state its real local landing presence');
  assert.doesNotMatch(page.body, /把工具管好，把精力留给创作。/u, 'the approved slogan was retired by the landing roadmap');
  assert.doesNotMatch(page.body, /示例数据 · 不读取私人文件/u, 'the global demo banner is gone: the first screen is real data');
  assert.doesNotMatch(page.body, /示例环境/u);
  assert.doesNotMatch(page.body, /能力进程已连接|返回正式控制台|新版交互预览/u);
  const asset = page.body.match(/\/_next\/static\/[^"']+\.js/u)?.[0];
  assert.ok(asset);
  assert.equal((await request(port, asset)).status, 403, 'assets must remain gated');
  assert.equal((await request(port, asset, { cookie })).status, 200);
  const foreign = await request(port, '/', { cookie, headers: { origin: `http://127.0.0.1:${port + 1}` } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('x-aios-deny'), 'foreign-origin');
  const crossSite = await request(port, '/', { cookie, headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers.get('x-aios-deny'), 'cross-site');

  for (const [pathname, label] of [['/tools', 'Agent 客户端'], ['/routing', '模型路由'], ['/routing/config', '模型路由'], ['/mcp', '资源库'], ['/memory', '记忆'], ['/activity', '活动记录']]) {
    const rendered = await request(port, pathname, { cookie });
    assert.equal(rendered.status, 200, `${pathname} must render`);
    assert.match(rendered.body, new RegExp(`aria-label="${label}"[^>]*aria-current="page"`, 'u'));
    assert.doesNotMatch(rendered.body, /返回正式控制台|能力进程已连接/u);
  }
  assert.equal((await request(port, '/settings', { cookie })).status, 200);
  for (const [pathname, target] of [['/prototype', '/'], ['/overview', '/'], ['/sessions', '/activity'], ['/usage', '/activity'], ['/matrix', '/tools']]) {
    const moved = await request(port, pathname, { cookie });
    assert.equal(moved.status, 307, `${pathname} must redirect`);
    assert.equal(new URL(moved.headers.get('location'), `http://127.0.0.1:${port}`).pathname, target);
  }
  assert.equal((await request(port, '/no-such-console-view', { cookie })).status, 404);

  // Keep the real backend assertion: UI retirement must not delete capability APIs.
  const api = await request(port, '/api/mcp', { cookie });
  assert.equal(api.status, 200);
  const payload = JSON.parse(api.body);
  assert.ok((payload.rows ?? []).length > 0);
  for (const row of payload.rows ?? []) {
    assert.match(String(row.status), /^landing-(verified|unverified|error|unregistered)$/u);
  }

  // 网关启停 API：状态只读可达；启停是副作用——缺 confirm 必须 409、未知动作 400（两者都在真正启停之前拒绝）。
  const gateway = await request(port, '/api/model-routing/gateway', { cookie });
  assert.equal(gateway.status, 200);
  const gatewayStatus = JSON.parse(gateway.body);
  assert.equal(typeof gatewayStatus.running, 'boolean');
  assert.ok(Array.isArray(gatewayStatus.clients));
  const postHeaders = { 'content-type': 'application/json' };
  const noConfirm = await request(port, '/api/model-routing/gateway', { cookie, method: 'POST', headers: postHeaders, body: JSON.stringify({ action: 'start' }) });
  assert.equal(noConfirm.status, 409, '启停缺 confirm 必须被授权门拦下');
  const badAction = await request(port, '/api/model-routing/gateway', { cookie, method: 'POST', headers: postHeaders, body: JSON.stringify({ action: 'nope', confirm: true }) });
  assert.equal(badAction.status, 400, '未知动作必须被白名单拒绝');
  await runGatewayBrowserChecks(t, { baseUrl: `http://127.0.0.1:${port}`, token });
});
