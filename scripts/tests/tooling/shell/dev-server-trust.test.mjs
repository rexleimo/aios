// The development server, on the wire.
//
// Every other shell test asserts text: a config value, a source shape, a decision
// table. None of them prove that `npm run ui` — the flow the README tells a human to
// use — actually serves a page through the token gate, and the manual curl matrix from
// S2 was evidence that disappears after the session it was typed in.
//
// So this test starts the real development server and asks it the same questions.
// It skips with a named reason when the UI dependencies are absent, because a check
// that passes without asking anything is the failure mode this file exists to avoid.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const NEXT_BIN = path.join(ROOT, 'apps', 'shell', 'ui', 'node_modules', 'next', 'dist', 'bin', 'next');
const LAUNCHER = path.join(ROOT, 'scripts', 'aios-ui.mjs');

const dependenciesInstalled = fs.existsSync(NEXT_BIN);

/** A port chosen by the OS, then released. The window of reuse is small and retried. */
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

async function waitFor(predicate, { timeoutMs = 90_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Kill the launcher and everything it spawned; the launcher owns a `next dev` child. */
function stopTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // Already gone.
    }
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
}

async function request(port, pathname, { cookie, headers } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    // `redirect: 'manual'` keeps the token exchange observable instead of followed.
    redirect: 'manual',
    headers: { ...(cookie ? { cookie } : {}), ...headers },
    signal: AbortSignal.timeout(120_000),
  });
  const body = response.status === 200 ? await response.text() : '';
  return { status: response.status, headers: response.headers, body };
}

test('the development server serves the page through the token gate', { timeout: 300_000 }, async (t) => {
  if (!dependenciesInstalled) {
    t.skip('ui dependencies are not installed (run: npm run ui:setup)');
    return;
  }

  const port = await freePort();
  const child = spawn(process.execPath, [LAUNCHER, 'dev', '--port', String(port)], {
    cwd: ROOT,
    // A group of its own so the whole tree can be stopped on POSIX.
    detached: process.platform !== 'win32',
    env: { ...process.env, AIOS_UI_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // The launcher prints the tokenized URL on stderr (it is a status line, not output
  // to be piped), so both streams are collected before the line is looked for.
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });

  t.after(() => stopTree(child));

  const tokenFile = path.join(os.tmpdir(), `aios-ui-token-${port}`);
  const published = await waitFor(() => fs.existsSync(tokenFile), { timeoutMs: 30_000 });
  assert.ok(published, `the launcher published no token at ${tokenFile}; output: ${output.trim()}`);

  const token = fs.readFileSync(tokenFile, 'utf8').trim();
  assert.match(token, /^[0-9a-f]{32}$/u);
  assert.match(output, new RegExp(`open http://127\\.0\\.0\\.1:${port}/t/${token}/`, 'u'));

  // Ready means "the gate answers", not "the socket accepts": a bare request must be
  // refused, and a refused request proves both that the server is up and that the gate
  // is in front of it.
  const up = await waitFor(async () => {
    try {
      const response = await request(port, '/');
      return response.status === 403;
    } catch {
      return false;
    }
  });
  assert.ok(up, 'the development server never answered with a refused request');

  const bare = await request(port, '/');
  assert.equal(bare.status, 403);
  assert.equal(bare.headers.get('x-aios-deny'), 'missing-token');

  const exchange = await request(port, `/t/${token}/`);
  // Next collapses the trailing slash before the gate runs, so both a 307 from the gate
  // and a 308 from the router are acceptable — what matters is that no cookie is handed
  // out without a matching token.
  assert.ok([307, 308].includes(exchange.status), `exchange status ${exchange.status}`);
  const setCookie = exchange.headers.get('set-cookie') ?? '';
  if (exchange.status === 307) {
    assert.match(setCookie, /aios_ui_token=/u);
    assert.match(setCookie, /HttpOnly/u);
    assert.match(setCookie, /SameSite=strict/iu);
  }

  const cookie = `aios_ui_token=${token}`;
  // The first render compiles the route on demand; this is the slow assertion.
  const page = await request(port, '/', { cookie });
  assert.equal(page.status, 200);
  assert.match(page.body, /AIOS 接入矩阵/u, 'the matrix must render, not just return 200');

  const asset = page.body.match(/\/_next\/static\/[^"']+\.js/u)?.[0];
  assert.ok(asset, 'the rendered page must reference a script');
  assert.equal((await request(port, asset)).status, 403, 'assets are gated too');
  assert.equal((await request(port, asset, { cookie })).status, 200);

  const foreign = await request(port, '/', { cookie, headers: { origin: `http://127.0.0.1:${port + 1}` } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('x-aios-deny'), 'foreign-origin');

  const crossSite = await request(port, '/', { cookie, headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers.get('x-aios-deny'), 'cross-site');
});
