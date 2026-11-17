import assert from 'node:assert/strict';
import test from 'node:test';
import { clientManagementStatus, loadClients, previewClientUpdate, runClientManagement, updateClient } from '../../../../apps/shell/ui/src/lib/data/clients.mjs';

const revision = 'a'.repeat(64);
function fixture(reply = { ok: true, clients: [] }) {
  const calls = [];
  const options = {
    rootDir: '/project with spaces',
    resolveCli: () => ({ ok: true, script: '/installed runtime/scripts/aios.mjs' }),
    exists: (file) => file === '/installed runtime/scripts/aios-client-management.mjs',
    async run(file, args, options) { calls.push({ file, args, options }); return { stdout: JSON.stringify(reply), stderr: '' }; },
  };
  return { calls, options };
}

test('Next inventory subprocess uses bounded execFile argv, never a shell or direct library import', async () => {
  const f = fixture();
  assert.deepEqual(await loadClients(f.options), { ok: true, clients: [] });
  const [call] = f.calls;
  assert.equal(call.file, process.execPath);
  assert.deepEqual(call.args, ['/installed runtime/scripts/aios-client-management.mjs', 'inventory']);
  assert.equal(call.options.cwd, '/project with spaces');
  assert.equal(call.options.shell, false);
  assert.equal(call.options.timeout, 20_000);
  assert.equal(call.options.maxBuffer, 1_048_576);
  assert.equal(call.options.killSignal, 'SIGKILL');
  assert.equal(call.options.env.AIOS_PROJECT_ROOT, '/project with spaces');
  assert.equal(call.options.env.CI, '1');
  const allowed = new Set(['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP', 'AIOS_PROJECT_ROOT', 'LANG', 'LC_ALL', 'CI', 'NO_COLOR']);
  assert.ok(Object.keys(call.options.env).every((key) => allowed.has(key)));
  assert.equal(call.options.env.NODE_OPTIONS, undefined);
});

test('Next preview and update use exact closed CLI arguments and update-specific timeout', async () => {
  const f = fixture({ ok: true, preview: { client: 'pi', revision } });
  await previewClientUpdate('pi', f.options);
  assert.deepEqual(f.calls[0].args.slice(1), ['preview-update', 'pi']);
  f.options.run = async (file, args, options) => {
    f.calls.push({ file, args, options });
    return { stdout: JSON.stringify({ ok: true, result: { client: 'pi' } }) };
  };
  assert.equal((await updateClient({ client: 'pi', confirm: true, expectedRevision: revision }, f.options)).ok, true);
  assert.deepEqual(f.calls[1].args.slice(1), ['update', 'pi', '--confirm', '--expected-revision', revision]);
  assert.equal(f.calls[1].options.timeout, 145_000);
  assert.equal(f.calls[1].options.shell, false);
});

test('Next rejects unknown actions, command injection, extra fields and unconfirmed updates before spawn', async () => {
  const f = fixture();
  for (const request of [null, [], {}, { action: 'install', client: 'pi' },
    { action: 'inventory', client: 'pi' }, { action: 'preview-update', client: 'pi;touch /tmp/bad' },
    { action: 'preview-update', client: 'pi', confirm: true }, { action: 'preview-update', client: '../pi' },
    { action: 'update', client: 'pi', confirm: 'true', expectedRevision: revision },
    { action: 'update', client: 'pi', confirm: true, expectedRevision: 'bad' },
    { action: 'update', client: 'pi', confirm: true, expectedRevision: revision, args: ['--force'] }]) {
    assert.equal((await runClientManagement(request, f.options)).error.code, 'INVALID_REQUEST');
  }
  assert.equal(f.calls.length, 0);
});

test('Next reports missing runtime without pretending inventory is empty or attempting a process', async () => {
  const f = fixture();
  assert.equal((await loadClients({ ...f.options, resolveCli: () => ({ ok: false }) })).error.code, 'CLI_UNAVAILABLE');
  assert.equal((await loadClients({ ...f.options, exists: () => false })).error.code, 'CLI_UNAVAILABLE');
  assert.equal(f.calls.length, 0);
});

test('Next preserves structured domain errors from exit 1 and maps actionable HTTP statuses', async () => {
  for (const [code, status] of Object.entries({ INVALID_REQUEST: 400, INVALID_CLIENT: 400, CONFIRM_REQUIRED: 400, REVISION_REQUIRED: 400, STALE_REVISION: 409, CLIENTS_LOCKED: 423, UPDATE_UNSUPPORTED: 422, UPDATE_FAILED: 502, READBACK_FAILED: 502 })) {
    const f = fixture();
    const envelope = { ok: false, error: { code, message: 'Safe domain error', lockRetained: true } };
    f.options.run = async () => { throw Object.assign(new Error('DO_NOT_ECHO'), { code: 1, stdout: JSON.stringify(envelope), stderr: 'api_key=hidden' }); };
    const result = await loadClients(f.options);
    assert.deepEqual(result, envelope);
    assert.equal(clientManagementStatus(result), status);
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_ECHO|hidden/);
  }
  assert.equal(clientManagementStatus({ ok: true }), 200);
  assert.equal(clientManagementStatus({ ok: false, error: { code: 'constructor' } }), 502);
});

test('Next suppresses raw timeout, signal, buffer and process diagnostics even with misleading JSON', async () => {
  for (const details of [{ code: 'ETIMEDOUT' }, { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' },
    { code: 'ENOENT' }, { code: 1, killed: true }, { code: 1, signal: 'SIGKILL' }, { code: 2 }, { code: 1 }]) {
    const f = fixture();
    f.options.run = async () => { throw Object.assign(new Error('api_key=hidden'), { stdout: '{"ok":true,"clients":[]}', stderr: 'password=hidden', ...details }); };
    const result = await loadClients(f.options);
    assert.equal(result.error.code, 'CAPABILITY_FAILED', JSON.stringify(details));
    assert.doesNotMatch(JSON.stringify(result), /hidden/);
  }
});

test('Next rejects oversized, malformed, noisy and action-mismatched capability envelopes', async () => {
  for (const stdout of [undefined, 'x'.repeat(1_048_577), 'debug\n{"ok":true,"clients":[]}', 'null', '[]', '{', '{}', '{"ok":true}', '{"ok":true,"clients":{}}', '{"ok":false,"error":"failed"}', '{"ok":false,"error":{"code":1,"message":"bad"}}']) {
    const f = fixture();
    f.options.run = async () => ({ stdout });
    assert.equal((await loadClients(f.options)).error.code, 'CAPABILITY_FAILED');
  }
  for (const [request, payload] of [[{ action: 'preview-update', client: 'pi' }, { ok: true, preview: [] }],
    [{ action: 'update', client: 'pi', confirm: true, expectedRevision: revision }, { ok: true, result: [] }]]) {
    const f = fixture(payload);
    assert.equal((await runClientManagement(request, f.options)).error.code, 'CAPABILITY_FAILED');
  }
});
