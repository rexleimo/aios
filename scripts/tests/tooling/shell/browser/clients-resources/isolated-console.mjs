import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatedConsoleFacts } from './console-facts.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../../../..');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function startIsolatedConsole(t) {
  const originalUi = path.join(ROOT, 'apps/shell/ui');
  assert.ok(fs.existsSync(path.join(originalUi, 'node_modules/next/dist/bin/next')), 'real Next dependencies are required');
  const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-browser-home-'));
  // Keep the copied app within Turbopack's root; never share the original dev build or lock.
  const copies = path.join(ROOT, '.cache/aios-ui-acceptance');
  fs.mkdirSync(copies, { recursive: true });
  const sandbox = fs.mkdtempSync(path.join(copies, 'clients-resources-'));
  const ui = path.join(sandbox, 'apps/shell/ui');
  fs.mkdirSync(ui, { recursive: true });
  let child;
  let output = '';
  const log = process.env.AIOS_BROWSER_SERVER_LOG || '/tmp/gateway-clients-resources-server.log';
  fs.writeFileSync(log, '');
  const cleanup = () => {
    if (child?.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Our isolated child already exited. */ }
    }
    fs.writeFileSync(log, output);
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(privateRoot, { recursive: true, force: true });
  };
  const interrupted = () => { cleanup(); process.exit(143); };
  process.once('SIGTERM', interrupted);
  process.once('SIGINT', interrupted);
  t.after(() => {
    process.removeListener('SIGTERM', interrupted);
    process.removeListener('SIGINT', interrupted);
    cleanup();
  });
  for (const entry of fs.readdirSync(originalUi)) {
    if (['.next', 'node_modules', 'tsconfig.tsbuildinfo'].includes(entry) || entry.startsWith('.env')) continue;
    fs.cpSync(path.join(originalUi, entry), path.join(ui, entry), { recursive: true });
  }
  fs.symlinkSync(path.join(originalUi, 'node_modules'), path.join(ui, 'node_modules'), 'dir');
  // ESM import specifiers need file:// URLs: a bare Windows path like E:\... is
  // parsed as protocol "e:" and next.config.mjs fails to load. pathToFileURL is
  // a no-op shape change on POSIX, so CI behaviour is identical.
  const originalConfigUrl = pathToFileURL(path.join(originalUi, 'next.config.mjs')).href;
  fs.writeFileSync(path.join(ui, 'next.config.mjs'), `import config from ${JSON.stringify(originalConfigUrl)};\nexport default { ...config, turbopack: { ...config.turbopack, root: ${JSON.stringify(ROOT)} } };\n`);
  // Substitute only the copied server-side facts boundary, not any rendered component.
  fs.writeFileSync(path.join(ui, 'src/lib/console-facts-request.mjs'), `const facts = ${JSON.stringify(isolatedConsoleFacts(sandbox))};\nexport async function collectForRequest(searchParams = {}) { return { facts: structuredClone(facts), selection: { requested: searchParams.ws || '', ok: true } }; }\n`);
  const port = await freePort();
  assert.notEqual(port, 3126);
  const token = 'ab'.repeat(16);
  const env = { PATH: [path.dirname(process.execPath), process.env.SystemRoot && path.join(process.env.SystemRoot, 'System32'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].filter(Boolean).join(path.delimiter), HOME: privateRoot, USERPROFILE: privateRoot,
    TMPDIR: privateRoot, TEMP: privateRoot, TMP: privateRoot, AIOS_HOME: path.join(privateRoot, 'aios'),
    AIOS_GATEWAY_STATE_DIR: path.join(privateRoot, 'gateway'), AIOS_CLI: '/usr/bin/false',
    AIOS_PROJECT_ROOT: sandbox, AIOS_UI_PORT: String(port), AIOS_UI_TOKEN: token, AIOS_UI_NO_WARM: '1',
    NEXT_TELEMETRY_DISABLED: '1', NO_COLOR: '1' };
  child = spawn(process.execPath, [path.join(ROOT, 'scripts/aios-ui.mjs'), 'dev', '--root', sandbox, '--port', String(port)],
    { cwd: privateRoot, detached: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const capture = chunk => { output += String(chunk); fs.appendFileSync(log, String(chunk)); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, output);
    let response;
    try {
      response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
    } catch { /* Wait for this newly spawned isolated server only. */ }
    if (response?.status === 403) {
      // Compile the actual views before the fixture's short interaction timeout starts.
      for (const pathname of ['/tools', '/mcp', '/routing']) {
        const rendered = await fetch(`${baseUrl}${pathname}`, { headers: { cookie: `aios_ui_token=${token}` }, signal: AbortSignal.timeout(120_000) });
        const html = await rendered.text();
        assert.equal(rendered.status, 200, `${pathname} failed to compile\n${html.slice(-2000)}\n${output}`);
      }
      return { baseUrl, token };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail(`isolated Console did not become ready\n${output}`);
}
