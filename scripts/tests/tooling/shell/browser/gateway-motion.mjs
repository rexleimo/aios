// Explicit acceptance command: film the real production UI through a GET-only authenticated relay.
// No authentication bypass is added to the product, and no mutation can reach its backend.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const root = path.resolve(import.meta.dirname, '../../../../..');
const exec = promisify(execFile);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-gateway-motion-'));
const outputDir = process.env.AIOS_GATEWAY_TEST_ARTIFACTS || temporary;
fs.mkdirSync(outputDir, { recursive: true });
const token = randomBytes(16).toString('hex');
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const upstream = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(root, 'apps/shell/ui/node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: path.join(root, 'apps/shell/ui'), detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, AIOS_UI_TOKEN: token, AIOS_UI_PORT: String(port), AIOS_PROJECT_ROOT: root,
    AIOS_HOME: path.join(temporary, 'home'), AIOS_GATEWAY_STATE_DIR: path.join(temporary, 'gateway') },
});
let log = '';
child.stdout.on('data', chunk => { log += chunk; });
child.stderr.on('data', chunk => { log += chunk; });
const relay = http.createServer(async (request, response) => {
  if (request.method !== 'GET') {
    response.writeHead(405).end();
    return;
  }
  try {
    const result = await fetch(`${upstream}${request.url}`, { headers: { cookie: `aios_ui_token=${token}` }, redirect: 'manual' });
    response.writeHead(result.status, { 'content-type': result.headers.get('content-type') || 'text/plain' });
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    response.writeHead(502).end(String(error));
  }
});

try {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try { if ((await fetch(upstream)).status === 403) break; } catch { /* Starting. */ }
    assert.ok(Date.now() < deadline && child.exitCode === null, `production server did not start: ${log}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${relay.address().port}`;
  let failures = 0;
  for (const [name, pathname, width] of [
    ['overview-desktop', '/routing', 1440],
    ['providers-mobile', '/routing?section=providers', 390],
    ['policy-desktop', '/routing/config', 1440],
    ['requests-desktop', '/routing?section=requests', 1440],
  ]) {
    const args = ['scripts/check-motion-frame.mjs', '--page', `${base}${pathname}`, '--selector', '#console-content', '--duration', '1800', '--width', String(width), '--height', '1000', '--json'];
    let stdout;
    try {
      ({ stdout } = await exec(process.execPath, args, { cwd: root, timeout: 90_000, maxBuffer: 4 * 1024 * 1024 }));
    } catch (error) {
      stdout = error.stdout || '';
      failures += 1;
      fs.writeFileSync(path.join(outputDir, `motion-${name}.stderr.txt`), error.stderr || String(error));
    }
    const reportPath = path.join(outputDir, `motion-${name}.json`);
    fs.writeFileSync(reportPath, stdout);
    try {
      const report = JSON.parse(stdout);
      assert.ok(report.frames > 0 && report.measured.maxItems > 0);
      assert.deepEqual(report.pageErrors, []);
      console.log(`[gateway motion] ${name}: frames=${report.frames} items=${report.measured.minItems}..${report.measured.maxItems} findings=${report.findings.length} errors=${report.recorderErrors.length}; ${reportPath}`);
    } catch (error) {
      failures += 1;
      console.error(`[gateway motion] ${name}: invalid recording: ${error.message}; ${reportPath}`);
    }
  }
  process.exitCode = failures ? 1 : 0;
} finally {
  relay.closeAllConnections();
  await new Promise(resolve => relay.close(resolve));
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ }
  if (outputDir !== temporary) fs.rmSync(temporary, { recursive: true, force: true });
}
