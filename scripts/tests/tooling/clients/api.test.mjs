import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const root = new URL('../../../../', import.meta.url);
const routeUrl = new URL('apps/shell/ui/src/app/api/clients/route.ts', root);
const adapterUrl = new URL('apps/shell/ui/src/lib/data/clients.mjs', root);
const cliUrl = new URL('scripts/aios-client-management.mjs', root);
const fixtureUrl = new URL('scripts/tests/tooling/clients/fixtures.mjs', root);
const source = fs.readFileSync(routeUrl, 'utf8');
const dataUrl = (text) => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
let serial = 0;

async function harness() {
  // Real route -> real wrapper -> real CLI -> real manager; only I/O is simulated.
  const bridgeUrl = dataUrl(`
    import { runClientManagement as run, clientManagementStatus } from ${JSON.stringify(adapterUrl.href)};
    import { runClientManagementCli } from ${JSON.stringify(cliUrl.href)};
    import { fixture } from ${JSON.stringify(fixtureUrl.href)};
    export { clientManagementStatus };
    export const fx = fixture();
    export const calls = [];
    export const state = { failure: null };
    const options = {
      rootDir: '/project', exists: () => true,
      resolveCli: () => ({ ok: true, script: '/runtime/scripts/aios.mjs' }),
      async run(file, args, limits) {
        calls.push({ file, args, limits });
        if (state.failure) throw state.failure;
        const result = await runClientManagementCli(args.slice(1), { runtime: fx.options });
        const stdout = JSON.stringify(result);
        if (!result.ok) throw Object.assign(new Error('CLI domain failure'), { code: 1, stdout });
        return { stdout };
      },
    };
    export const loadClients = () => run({ action: 'inventory' }, options);
    export const runClientManagement = (request) => run(request, options);
    // Isolate every test's in-memory state: ${++serial}
  `);
  const bridge = await import(bridgeUrl);
  const importPath = `'../../../lib/data/clients.mjs'`;
  assert.ok(source.includes(importPath));
  const executable = stripTypeScriptTypes(source.replace(importPath, JSON.stringify(bridgeUrl)), { sourceUrl: routeUrl.href });
  return { ...bridge, ...await import(dataUrl(executable)) };
}

async function json(response) {
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, body: await response.json() };
}
const request = (body, headers = {}) => new Request('http://localhost/api/clients', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers },
});
const post = async (f, body) => json(await f.POST(request(body)));

test('GET returns installation/version/source contract through the full offline boundary', async () => {
  const f = await harness();
  const installed = f.fx.install('claude');
  f.fx.file('/home/test/.codex/config.toml', 'configured=true');
  assert.equal(f.runtime, 'nodejs');
  assert.equal(f.dynamic, 'force-dynamic');
  const { status, body } = await json(await f.GET());
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const claude = body.clients.find((client) => client.id === 'claude');
  assert.equal(claude.installed, true);
  assert.equal(claude.versionStatus, 'ok');
  assert.equal(claude.version, '1.2.3');
  assert.equal(claude.executable.path, installed.link);
  assert.equal(claude.executable.realPath, installed.bin);
  assert.equal(claude.source.kind, 'npm-global');
  assert.equal(claude.update.supported, true);
  assert.match(claude.revision, /^[a-f0-9]{64}$/);
  assert.equal(body.clients.find((client) => client.id === 'codex').installed, false);
  assert.deepEqual(f.calls[0].args.slice(1), ['inventory']);
  assert.equal(f.calls[0].limits.shell, false);
  assert.equal(f.fx.calls.filter((call) => call.args.includes('update')).length, 0);
});

test('GET preserves unknown inspection and failed version states without claiming missing installs', async () => {
  for (const kind of ['inspection', 'version']) {
    const f = await harness();
    f.fx.install('codex');
    if (kind === 'inspection') f.fx.options.resolveExecutable = async () => { throw new Error('api_key=hidden'); };
    else f.fx.state.onRun = async () => { throw new Error('password=hidden'); };
    const { status, body } = await json(await f.GET());
    const client = body.clients.find((entry) => entry.id === 'codex');
    assert.equal(status, 200);
    assert.equal(client.installed, kind === 'inspection' ? null : true);
    assert.equal(client.versionStatus, kind === 'inspection' ? 'unknown' : 'failed');
    assert.equal(client.version, null);
    assert.equal(client.update.supported, false);
    assert.doesNotMatch(JSON.stringify(body), /hidden/);
  }
});

test('POST preview is read-only and confirmed update requires its exact revision', async () => {
  const f = await harness();
  f.fx.install('pi');
  const { status, body } = await post(f, { action: 'preview-update', client: 'pi' });
  assert.equal(status, 200);
  const { preview } = body;
  assert.equal(preview.client, 'pi');
  assert.equal(preview.supported, true);
  assert.equal(preview.command.file, '/runtime/node');
  assert.equal(preview.command.args.at(-1), '@mariozechner/pi-coding-agent');
  assert.equal(preview.command.shell, false);
  assert.equal(f.fx.calls.filter((call) => call.args.includes('update')).length, 0);
  for (const confirm of [undefined, false, 'true']) {
    assert.equal((await post(f, { action: 'update', client: 'pi', confirm, expectedRevision: preview.revision })).status, 400);
  }
  const stale = await post(f, { action: 'update', client: 'pi', confirm: true, expectedRevision: 'f'.repeat(64) });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'STALE_REVISION');
  const updated = await post(f, { action: 'update', client: 'pi', confirm: true, expectedRevision: preview.revision });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.result.client, 'pi');
  assert.equal(updated.body.result.changed, false);
  assert.equal(f.fx.calls.filter((call) => call.args.includes('update')).length, 1);
  assert.equal(f.fx.files.has('/locks/client.lock'), false);
});

test('POST rejects invalid JSON, shapes, actions, fields and streamed oversized bodies before spawning', async () => {
  const f = await harness();
  for (const body of [null, [], {}, { action: 'inventory' }, { action: 'install', client: 'pi' },
    { action: 'preview-update', client: 'pi', command: 'arbitrary' },
    { action: 'preview-update', client: 'pi;arbitrary' },
    { action: 'update', client: 'pi', confirm: true },
    { action: 'update', client: 'pi', confirm: true, expectedRevision: 'bad' }]) {
    const result = await post(f, body);
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, 'INVALID_REQUEST');
  }
  for (const body of ['', '{', 'x'.repeat(4097)]) {
    const result = await json(await f.POST(new Request('http://localhost/api/clients', { method: 'POST', body })));
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, 'INVALID_REQUEST');
  }
  assert.equal((await json(await f.POST(new Request('http://localhost/api/clients', { method: 'POST' })))).status, 400);
  assert.equal((await json(await f.POST(request({ action: 'preview-update', client: 'pi' }, { 'content-length': '4097' })))).status, 400);
  let cancelled = false;
  let pulls = 0;
  const body = new ReadableStream({
    pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(2048)); },
    cancel() { cancelled = true; },
  });
  const streamed = new Request('http://localhost/api/clients', { method: 'POST', body, duplex: 'half' });
  assert.equal((await json(await f.POST(streamed))).status, 400);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 4);
  assert.equal(f.calls.length, 0);
  assert.equal(f.fx.calls.length, 0);
});

test('POST rejects undeclared client IDs with structured CLI errors, not arbitrary execution', async () => {
  const f = await harness();
  const result = await post(f, { action: 'preview-update', client: 'undeclared-client' });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'INVALID_CLIENT');
  assert.equal(f.fx.calls.length, 0);
});

test('POST unsupported sources remain previewable but cannot update even with confirmation', async () => {
  const f = await harness();
  f.fx.file('/tools/bin/claude', 'unattributed executable');
  const { body } = await post(f, { action: 'preview-update', client: 'claude' });
  assert.equal(body.preview.supported, false);
  assert.equal(body.preview.command, null);
  assert.equal(typeof body.preview.reason, 'string');
  const result = await post(f, { action: 'update', client: 'claude', confirm: true, expectedRevision: body.preview.revision });
  assert.equal(result.status, 422);
  assert.equal(result.body.error.code, 'UPDATE_UNSUPPORTED');
  assert.equal(f.fx.calls.filter((call) => call.args.includes('update')).length, 0);
  assert.equal(f.fx.files.has('/locks/client.lock'), false);
});

test('POST retained update and readback failures return redacted 502, then fail closed with 423', async () => {
  for (const mode of ['process', 'readback']) {
    const f = await harness();
    const installed = f.fx.install('codex');
    const { body } = await post(f, { action: 'preview-update', client: 'codex' });
    f.fx.state.onRun = async (call) => {
      if (!call.args.includes('update')) return undefined;
      if (mode === 'process') throw Object.assign(new Error('password=hidden'), { stdout: 'api_key=hidden', stderr: 'Authorization: Bearer hidden-secret' });
      f.fx.files.delete(installed.bin);
      return { stdout: 'finished', stderr: '' };
    };
    const update = { action: 'update', client: 'codex', confirm: true, expectedRevision: body.preview.revision };
    const failed = await post(f, update);
    assert.equal(failed.status, 502);
    assert.equal(failed.body.error.code, mode === 'process' ? 'UPDATE_FAILED' : 'READBACK_FAILED');
    assert.equal(failed.body.error.lockRetained, true);
    assert.doesNotMatch(JSON.stringify(failed.body), /hidden/);
    assert.equal(f.fx.files.has('/locks/client.lock'), true);
    const retry = await post(f, update);
    assert.equal(retry.status, 423);
    assert.equal(retry.body.error.code, 'CLIENTS_LOCKED');
    assert.equal(f.fx.calls.filter((call) => call.args.includes('update')).length, 1);
  }
});

test('GET subprocess timeout and output-limit failures never masquerade as empty inventory', async () => {
  for (const code of ['ETIMEDOUT', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'ENOENT']) {
    const f = await harness();
    f.state.failure = Object.assign(new Error('api_key=hidden'), { code, stdout: 'password=hidden', stderr: 'hidden' });
    const result = await json(await f.GET());
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { ok: false, error: { code: 'CAPABILITY_FAILED', message: 'Client capability failed or exceeded its time/output limit.' } });
    assert.equal(result.body.clients, undefined);
    assert.doesNotMatch(JSON.stringify(result.body), /hidden/);
  }
});
