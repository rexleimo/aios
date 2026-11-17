import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpActionService } from '../../../../../apps/shell/ui/src/app/api/mcp/action-service.mjs';
import { createPreviewStore, previewDigest } from '../../../../../apps/shell/ui/src/app/api/mcp/preview-store.mjs';

const input = { action: 'add', client: 'claude', scope: 'home', name: 'aios-search', entry: { type: 'stdio', command: 'node', args: ['/fake/search.mjs'] } };
const revision = 'a'.repeat(64);
const safe = { schema: 'mcp.action.v1', command: 'add', status: 'planned', dryRun: true,
  exitCode: 0, revision, classification: { status: 'absent' }, landing: { file: '/fake/config' } };
function fixture({ preview = safe, exitCode = 0, writeResult, writeExitCode = exitCode, failWrite = false, now = Date.now } = {}) {
  const calls = [];
  const api = createMcpActionService({
    previews: createPreviewStore({ now }), context: ['/fake/project', '/fake/cli'],
    list: async () => ({ ok: true, data: { landings: [{ clientId: 'claude', scope: 'home', writable: true }] } }),
    run: async (argv, expectedRevision) => {
      calls.push({ argv, expectedRevision });
      if (!argv.includes('--dry-run') && failWrite) throw new Error('child vanished');
      return { exitCode: argv.includes('--dry-run') ? exitCode : writeExitCode,
        stdout: JSON.stringify(argv.includes('--dry-run') ? preview
          : writeResult ?? { ...safe, dryRun: false, status: 'installed', classification: { status: 'owned' } }) };
    },
  });
  return { api, calls };
}
async function approve(api) {
  const response = await api.post({ ...input, dryRun: true });
  assert.equal(response.body.ok, true);
  return { ...input, dryRun: false, confirm: true, previewId: response.body.preview.id };
}

test('preview permits exactly one confirmed real add and forwards its revision', async () => {
  const { api, calls } = fixture();
  const request = await approve(api);
  const result = await api.post(request);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.result.status, 'installed');
  assert.equal(result.body.refreshRequired, true);
  assert.equal(calls[1].expectedRevision, revision);
  assert.equal(calls[1].argv.includes('--dry-run'), false);
  assert.equal((await api.post(request)).status, 409);
  assert.equal(calls.length, 2);
});

test('double submit consumes approval synchronously before listing/child execution', async () => {
  const { api, calls } = fixture();
  const request = await approve(api);
  const results = await Promise.all([api.post(request), api.post(request)]);
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
  assert.equal(calls.length, 2);
});

test('add/remove/adopt require explicit confirmation; rejected writes consume their old preview', async () => {
  const { api, calls } = fixture();
  const request = await approve(api);
  for (const action of ['add', 'remove', 'adopt']) {
    const result = await api.post({ ...request, action, confirm: false });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'confirmation-required');
  }
  assert.equal((await api.post(request)).status, 409);
  assert.equal(calls.length, 1);
});

test('changed request, cancellation and expiry each invalidate the original preview', async () => {
  let now = 0;
  const { api, calls } = fixture({ now: () => now });
  for (const change of ['edit', 'cancel', 'expire']) {
    const request = await approve(api);
    if (change === 'cancel') api.cancel(request.previewId);
    if (change === 'expire') now += 300_001;
    const altered = change === 'edit' ? { ...request, entry: { ...request.entry, command: 'other' } } : request;
    assert.equal((await api.post(altered)).status, 409);
    assert.equal((await api.post(request)).status, 409);
  }
  assert.equal(calls.length, 3);
});

for (const [label, patch, exitCode] of [
  ['external', { classification: { status: 'external' } }, 0],
  ['conflict', { status: 'conflict' }, 0],
  ['nonzero process exit', {}, 1],
  ['nonzero payload exit', { exitCode: 1 }, 0],
  ['not dry-run', { dryRun: false }, 0],
  ['no revision', { revision: undefined }, 0],
  ['wrong command', { command: 'adopt' }, 0],
  ['wrong schema', { schema: 'other' }, 0],
]) test(`unsafe preview cannot grant consent: ${label}`, async () => {
  const { api } = fixture({ preview: { ...safe, ...patch }, exitCode });
  const result = await api.post({ ...input, dryRun: true });
  assert.equal(result.body.ok, false);
  assert.equal(result.body.preview, undefined);
});

test('adopt/restore/force preview bypasses never grant approval', async () => {
  const { api } = fixture();
  for (const key of ['adopt', 'restore', 'force']) {
    const result = await api.post({ ...input, dryRun: true, [key]: true });
    assert.equal(result.body.ok, false);
    assert.equal(result.body.preview, undefined);
  }
});

test('uncertain child failure never reports success or reuses the preview', async () => {
  const { api } = fixture({ failWrite: true });
  const request = await approve(api);
  const result = await api.post(request);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.refreshRequired, true);
  assert.equal(result.body.error, 'mcp-execution-failed');
  assert.equal((await api.post(request)).status, 409);
});

test('raw entry/env, CLI diagnostic text and arbitrary messages are never reflected', async () => {
  const secret = 'SENTINEL_SECRET_123';
  const api = createMcpActionService({ context: [], list: async () => ({ ok: true, data: { landings: [{ clientId: 'claude', scope: 'home' }] } }),
    run: async () => ({ exitCode: 0, stderr: secret, stdout: JSON.stringify({ ...safe, message: secret, detail: secret, record: { entry: secret }, reason: `bad value ${secret}` }) }),
  });
  const result = await api.post({ ...input, dryRun: true, entry: { ...input.entry, env: { KEY: secret } } });
  assert.equal(result.body.ok, true);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
  assert.equal(result.body.argv[result.body.argv.indexOf('--entry') + 1], '<entry omitted>');
});

test('request digest canonicalizes entry keys but binds runtime, project and entry values', () => {
  const argv = ['mcp', 'add', '--entry', '{"b":2,"a":1}', '--dry-run'];
  const otherOrder = ['mcp', 'add', '--entry', '{"a":1,"b":2}'];
  assert.equal(previewDigest(argv, ['p', 'cli']), previewDigest(otherOrder, ['p', 'cli']));
  assert.notEqual(previewDigest(argv, ['p', 'cli']), previewDigest(argv, ['other', 'cli']));
  assert.notEqual(previewDigest(argv, ['p', 'cli']), previewDigest(argv, ['p', 'other-cli']));
});

test('validation and listing failures consume the supplied preview before any retry', async () => {
  for (const failure of ['invalid-entry', 'serialization', 'list-false', 'list-throws']) {
    let fail = false;
    let writes = 0;
    const api = createMcpActionService({ context: [],
      list: async () => {
        if (fail && failure === 'list-throws') throw new Error('fixture list failure');
        return { ok: !(fail && failure === 'list-false'), data: { landings: [{ clientId: 'claude', scope: 'home' }] } };
      },
      run: async (argv) => { if (!argv.includes('--dry-run')) writes += 1; return { exitCode: 0, stdout: JSON.stringify(safe) }; },
    });
    const request = await approve(api);
    fail = true;
    let entry = request.entry;
    if (failure === 'invalid-entry') entry = null;
    if (failure === 'serialization') { entry = {}; entry.circular = entry; }
    const result = await api.post({ ...request, entry });
    assert.equal(result.status, failure.startsWith('list') ? 502 : 400);
    fail = false;
    assert.equal((await api.post(request)).status, 409);
    assert.equal(writes, 0);
  }
});

test('preview storage is bounded, expires at the deadline and never shares approvals across instances', () => {
  let now = 0;
  const store = createPreviewStore({ now: () => now, limit: 2, ttlMs: 10 });
  const first = store.issue('digest', revision);
  const second = store.issue('digest', revision);
  const third = store.issue('digest', revision);
  assert.equal(store.consume(first.id), null);
  assert.equal(createPreviewStore().consume(third.id), null);
  assert.equal(store.consume(second.id).digest, 'digest');
  assert.equal(store.consume(second.id), null);
  now = 10;
  assert.equal(store.consume(third.id), null);
});

const recoverySecret = 'MCP_RECOVERY_SENTINEL_NEVER_ECHO';
const rawConfig = JSON.stringify({ mcpServers: { private: { env: { TOKEN: recoverySecret } } } });
const recovery = { reason: 'config-changed-after-commit', configPath: '/fake/private profile/settings.json',
  backupPath: '/fake/private profile/backups/settings.json.uuid.bak' };
async function rejectedRecovery(patch = {}, action = 'add') {
  const { api } = fixture({ writeExitCode: 1, writeResult: {
    ...safe, command: action, dryRun: false, status: 'rejected', exitCode: 1, reason: 'ledger-unavailable',
    rolledBack: 'rollback-incomplete', landing: { file: recovery.configPath }, backupPath: recovery.backupPath,
    recovery: { ...recovery, message: recoverySecret, record: { entry: rawConfig }, config: rawConfig },
    message: recoverySecret, detail: rawConfig, record: { entry: rawConfig }, ...patch,
  } });
  const request = { ...await approve(api), action };
  return { api, request, response: await api.post(request) };
}
function assertNoRecoveryLeaks(response) {
  assert.doesNotMatch(JSON.stringify(response), /MCP_RECOVERY_SENTINEL_NEVER_ECHO|mcpServers/u);
}

for (const reason of ['config-changed-after-commit', 'no-rollback-available', 'rollback-io-failed']) {
  test(`incomplete rollback preserves only safe recovery fields: ${reason}`, async () => {
    const { api, request, response } = await rejectedRecovery({ recovery: {
      ...recovery, reason, message: recoverySecret, record: { entry: rawConfig }, config: rawConfig,
    } });
    assert.equal(response.body.ok, false);
    assert.equal(response.body.refreshRequired, true);
    assert.equal(response.body.preview, undefined);
    assert.equal(response.body.result.rolledBack, 'rollback-incomplete');
    assert.deepEqual(response.body.result.recovery, { ...recovery, reason });
    assertNoRecoveryLeaks(response);
    assert.equal((await api.post(request)).status, 409);
  });
}

test('new-config recovery preserves an empty backup path and uninstall recovery remains a failure', async () => {
  for (const action of ['add', 'remove']) {
    const backupPath = action === 'add' ? '' : recovery.backupPath;
    const { response } = await rejectedRecovery({ backupPath, recovery: { ...recovery, backupPath } }, action);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.result.rolledBack, 'rollback-incomplete');
    assert.deepEqual(response.body.result.recovery, { ...recovery, backupPath });
    assert.equal(response.body.result.backupPath, backupPath);
    assertNoRecoveryLeaks(response);
  }
});

test('unknown reasons, malformed recovery envelopes and other rollback statuses never reflect recovery', async () => {
  for (const value of [undefined, null, recoverySecret, [recovery], 1, true,
    { ...recovery, reason: 'unknown-recovery-reason' }, { ...recovery, reason: recoverySecret },
    { ...recovery, reason: { record: rawConfig } }]) {
    const { response } = await rejectedRecovery({ recovery: value });
    assert.equal(response.body.result.recovery, undefined);
    assertNoRecoveryLeaks(response);
  }
  for (const rolledBack of [undefined, false, 'restored-from-backup', 'removed-created-file',
    'no-rollback-available', `rollback-failed: ${recoverySecret}`, { record: rawConfig }]) {
    const { response } = await rejectedRecovery({ rolledBack });
    assert.equal(response.body.result.recovery, undefined);
    if (rolledBack && !['restored-from-backup', 'removed-created-file', 'no-rollback-available'].includes(rolledBack)) {
      assert.equal(response.body.result.rolledBack, 'rollback-failed');
    }
    assertNoRecoveryLeaks(response);
  }
});

test('recovery and existing result path fields reject objects, diagnostics, controls and oversized strings', async () => {
  const invalid = [undefined, null, false, 42, { record: rawConfig }, [rawConfig], recoverySecret, rawConfig,
    `https://example.invalid/${recoverySecret}`, `relative/${recoverySecret}`,
    `/fake/\n${recoverySecret}`, `/fake/\u0000${recoverySecret}`, `/fake/\u007f${recoverySecret}`,
    `/fake/${recoverySecret.repeat(200)}`];
  for (const field of ['configPath', 'backupPath']) {
    for (const value of [...invalid, ...(field === 'configPath' ? [''] : [])]) {
      const patch = { recovery: { ...recovery, [field]: value } };
      if (field === 'configPath') patch.landing = { file: value };
      else patch.backupPath = value;
      const { response } = await rejectedRecovery(patch);
      const projected = JSON.parse(JSON.stringify(response.body.result));
      const expected = { ...recovery };
      delete expected[field];
      assert.deepEqual(projected.recovery, expected);
      assert.equal(field === 'configPath' ? projected.landing.file : projected.backupPath, undefined);
      assertNoRecoveryLeaks(response);
    }
  }
});

test('recovery paths cannot introduce unrelated path-shaped diagnostic text', async () => {
  for (const field of ['configPath', 'backupPath']) {
    const { response } = await rejectedRecovery({ recovery: {
      ...recovery, [field]: `/fake/${recoverySecret}/unrelated.json`,
    } });
    const expected = { ...recovery };
    delete expected[field];
    assert.deepEqual(JSON.parse(JSON.stringify(response.body.result.recovery)), expected);
    assertNoRecoveryLeaks(response);
  }
});

test('safe recovery paths preserve spaces, Unicode, Windows drive paths and UNC paths', async () => {
  for (const configPath of ['/fake/private profile/\u6d4b\u8bd5/settings.json',
    'C:\\Users\\Fake User\\settings.json', '\\\\server\\share\\profile\\settings.json']) {
    const expected = { ...recovery, configPath, backupPath: `${configPath}.bak` };
    const { response } = await rejectedRecovery({ landing: { file: configPath }, backupPath: expected.backupPath,
      recovery: expected });
    assert.deepEqual(response.body.result.recovery, expected);
    assertNoRecoveryLeaks(response);
  }
});
