// Exercise the real development server through its token gate and current Console routes.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');
const NEXT_BIN = path.join(ROOT, 'apps', 'shell', 'ui', 'node_modules', 'next', 'dist', 'bin', 'next');
const LAUNCHER = path.join(ROOT, 'scripts', 'aios-ui.mjs');

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
async function request(port, pathname, { cookie, headers } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    redirect: 'manual',
    headers: { ...(cookie ? { cookie } : {}), ...headers },
    signal: AbortSignal.timeout(120_000),
  });
  return { status: response.status, headers: response.headers, body: response.status === 200 ? await response.text() : '' };
}

test('the development server serves the current Console through the token gate', { timeout: 300_000 }, async t => {
  if (!fs.existsSync(NEXT_BIN)) {
    t.skip('ui dependencies are not installed (run: npm run ui:setup)');
    return;
  }
  const port = await freePort();
  const child = spawn(process.execPath, [LAUNCHER, 'dev', '--port', String(port)], {
    cwd: ROOT, detached: process.platform !== 'win32', env: { ...process.env, AIOS_UI_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  t.after(() => stopTree(child));
  const tokenFile = path.join(os.tmpdir(), `aios-ui-token-${port}`);
  assert.ok(await waitFor(() => fs.existsSync(tokenFile), 30_000), 'launcher must publish its token');
  const token = fs.readFileSync(tokenFile, 'utf8').trim();
  assert.match(token, /^[0-9a-f]{32}$/u);
  assert.ok(output.includes(`open http://127.0.0.1:${port}/t/${token}/`), 'launcher must print its bootstrap URL');
  assert.ok(await waitFor(async () => {
    try { return (await request(port, '/')).status === 403; } catch { return false; }
  }), 'the gate must answer before serving the page');

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
  assert.equal(page.status, 200);
  assert.match(page.body, /把工具管好，把精力留给创作。/u);
  assert.match(page.body, /示例数据 · 不读取私人文件 · 不修改真实配置/u);
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

  for (const [pathname, label] of [['/tools', 'AI 工具'], ['/mcp', 'MCP 服务'], ['/memory', '记忆'], ['/activity', '活动记录']]) {
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
});
