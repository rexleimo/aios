import assert from 'node:assert/strict';
import test from 'node:test';
import { redactClientOutput } from '../../../lib/tooling/clients/index.mjs';
import { fixture, mutationCalls } from './fixtures.mjs';

test('preview is immutable, source-specific, exact argv and read-only', async () => {
  const fx = fixture();
  fx.install('claude');
  const preview = await fx.manager().previewUpdate('claude');
  assert.equal(preview.supported, true);
  assert.equal(preview.command.file, '/runtime/node');
  assert.deepEqual(preview.command.args, [
    '/tools/lib/node_modules/npm/bin/npm-cli.js', 'update', '--global', '--prefix', '/tools',
    '--userconfig', '/dev/null', '--globalconfig', '/dev/null', '--registry', 'https://registry.npmjs.org', '--', '@anthropic-ai/claude-code',
  ]);
  assert.equal(preview.command.shell, false);
  assert.equal(preview.requiresConfirmation, true);
  assert.match(preview.evidenceHash, /^[a-f0-9]{64}$/);
  assert.ok(preview.evidence.some((entry) => entry.type === 'package-metadata'));
  assert.throws(() => preview.command.args.push('arbitrary'), TypeError);
  assert.throws(() => { preview.source.packageName = 'arbitrary'; }, TypeError);
  assert.equal(mutationCalls(fx).length, 0);
  assert.equal(fx.files.has('/locks/client.lock'), false);
});

test('every npm client maps to its closed package, including nondefault prefix with spaces', async () => {
  for (const [id, pkg] of [['claude', '@anthropic-ai/claude-code'], ['codex', '@openai/codex'], ['pi', '@mariozechner/pi-coding-agent']]) {
    const fx = fixture();
    const prefix = '/node versions/v24';
    fx.install(id, { prefix });
    const preview = await fx.manager({ env: { PATH: `${prefix}/bin` } }).previewUpdate(id);
    assert.equal(preview.supported, true);
    assert.equal(preview.command.args[4], prefix);
    assert.equal(preview.command.args.at(-1), pkg);
  }
});

test('update requires explicit boolean confirmation and exact revision before any process/lock', async () => {
  const fx = fixture();
  fx.install('codex');
  const manager = fx.manager();
  for (const request of [
    { client: 'codex' }, { client: 'codex', confirm: 'true', expectedRevision: 'a'.repeat(64) },
    { client: 'codex', confirm: true }, { client: 'codex', confirm: true, expectedRevision: 'bad' },
    { client: 'codex', confirm: true, expectedRevision: 'a'.repeat(64), command: 'evil' },
    { client: 'codex', confirm: true, expectedRevision: 'a'.repeat(64), source: 'npm-global' },
  ]) await assert.rejects(() => manager.updateClient(request));
  assert.equal(fx.calls.length, 0);
  assert.equal(fx.files.has('/locks/client.lock'), false);
  for (const client of ['__proto__', 'constructor', 'claude;whoami', '/usr/bin/evil']) {
    await assert.rejects(() => manager.previewUpdate(client), { code: 'INVALID_CLIENT' });
  }
});

test('stale executable, metadata, npm runner, node runtime and version invalidate previews', async () => {
  for (const change of ['link', 'binary', 'metadata', 'npm', 'node', 'version']) {
    const fx = fixture();
    const installed = fx.install('codex');
    const manager = fx.manager();
    const preview = await manager.previewUpdate('codex');
    if (change === 'link') fx.link(installed.link, installed.bin);
    if (change === 'binary') fx.file(installed.bin, 'changed binary');
    if (change === 'metadata') fx.json(installed.metadata, { name: '@openai/codex', version: '1.2.4', bin: { codex: 'bin/cli.js' } });
    if (change === 'npm') fx.file('/tools/lib/node_modules/npm/bin/npm-cli.js', 'changed runner');
    if (change === 'node') fx.file('/runtime/node', 'changed node');
    if (change === 'version') fx.setVersion(installed.bin, '2.0.0');
    await assert.rejects(() => manager.updateClient({ client: 'codex', confirm: true, expectedRevision: preview.revision }), { code: 'STALE_REVISION' }, change);
    assert.equal(mutationCalls(fx).length, 0, change);
    assert.equal(fx.files.has('/locks/client.lock'), false, change);
  }
});

test('PATH precedence changes after preview cannot silently target another install', async () => {
  const fx = fixture();
  const original = fx.install('pi');
  const other = fx.install('pi', { prefix: '/other' });
  let candidate = original.link;
  const manager = fx.manager({ resolveExecutable: async (name) => name === 'pi' ? candidate : null });
  const preview = await manager.previewUpdate('pi');
  candidate = other.link;
  await assert.rejects(() => manager.updateClient({ client: 'pi', confirm: true, expectedRevision: preview.revision }), { code: 'STALE_REVISION' });
  assert.equal(mutationCalls(fx).length, 0);
});

test('confirmed update uses preview argv, bounded execution, sanitized env, and readback', async () => {
  const fx = fixture();
  fx.install('pi');
  const manager = fx.manager();
  const preview = await manager.previewUpdate('pi');
  fx.state.onRun = async ({ args }) => {
    if (args[1] === 'update') {
      fx.install('pi', { version: '1.3.0' });
      return { stdout: 'updated api_key=hidden-value', stderr: 'Authorization: Bearer private-value' };
    }
  };
  const result = await manager.updateClient({ client: 'pi', confirm: true, expectedRevision: preview.revision });
  assert.equal(result.before.version, '1.2.3');
  assert.equal(result.after.version, '1.3.0');
  assert.equal(result.changed, true);
  assert.notEqual(result.after.revision, result.before.revision);
  const [mutation] = mutationCalls(fx);
  assert.deepEqual({ file: mutation.file, args: mutation.args }, { file: preview.command.file, args: preview.command.args });
  assert.equal(mutation.options.shell, false);
  assert.equal(mutation.options.timeout, 120000);
  assert.equal(mutation.options.maxBuffer, 262144);
  assert.equal(mutation.options.killSignal, 'SIGKILL');
  assert.equal(mutation.options.env.NODE_OPTIONS, undefined);
  assert.equal(mutation.options.env.OPENAI_API_KEY, undefined);
  assert.doesNotMatch(JSON.stringify(result), /hidden-value|private-value/);
  assert.equal(fx.files.has('/locks/client.lock'), false);
});

test('unchanged version readback is up-to-date, not a fabricated upgrade', async () => {
  const fx = fixture();
  fx.install('codex');
  const manager = fx.manager();
  const { revision } = await manager.previewUpdate('codex');
  const result = await manager.updateClient({ client: 'codex', confirm: true, expectedRevision: revision });
  assert.equal(result.changed, false);
  assert.equal(result.after.version, '1.2.3');
});

test('same-manager and cross-manager updates fail closed using one global disk lock', async () => {
  const fx = fixture();
  fx.install('codex');
  fx.install('pi');
  const manager = fx.manager();
  const other = fx.manager();
  const { revision } = await manager.previewUpdate('codex');
  const pi = await other.previewUpdate('pi');
  let started;
  let release;
  const running = new Promise((resolve) => { started = resolve; });
  const finish = new Promise((resolve) => { release = resolve; });
  fx.state.onRun = async ({ args }) => {
    if (args[1] === 'update') { started(); await finish; return { stdout: 'ok' }; }
  };
  const request = { client: 'codex', confirm: true, expectedRevision: revision };
  const first = manager.updateClient(request);
  await running;
  await assert.rejects(() => manager.updateClient(request), { code: 'CLIENTS_LOCKED' });
  await assert.rejects(() => other.updateClient(request), { code: 'CLIENTS_LOCKED' });
  await assert.rejects(() => other.updateClient({ client: 'pi', confirm: true, expectedRevision: pi.revision }), { code: 'CLIENTS_LOCKED' });
  assert.equal(mutationCalls(fx).length, 1);
  release();
  await first;
  assert.equal(fx.files.has('/locks/client.lock'), false);
});

test('pre-existing locks, including unknown stale locks, are never reclaimed', async () => {
  const fx = fixture();
  fx.install('codex');
  const manager = fx.manager();
  const { revision } = await manager.previewUpdate('codex');
  fx.file('/locks/client.lock', 'unknown lock');
  const beforeCalls = fx.calls.length;
  await assert.rejects(() => manager.updateClient({ client: 'codex', confirm: true, expectedRevision: revision }), { code: 'CLIENTS_LOCKED' });
  assert.equal(fx.calls.length, beforeCalls);
  assert.equal(fx.files.has('/locks/client.lock'), true);
});

test('unsupported sources refuse confirmed updates with current revisions', async () => {
  const fx = fixture();
  fx.file('/tools/bin/claude', 'unknown binary');
  const manager = fx.manager();
  const { revision } = await manager.previewUpdate('claude');
  await assert.rejects(() => manager.updateClient({ client: 'claude', confirm: true, expectedRevision: revision }), { code: 'UPDATE_UNSUPPORTED' });
  assert.equal(mutationCalls(fx).length, 0);
});

for (const failure of ['timeout', 'buffer', 'nonzero']) {
  test(`${failure} update failure retains lock, redacts diagnostics and prevents retries`, async () => {
    const fx = fixture();
    fx.install('codex');
    const manager = fx.manager();
    const { revision } = await manager.previewUpdate('codex');
    fx.state.onRun = async ({ args }) => {
      if (args[1] !== 'update') return;
      if (failure === 'buffer') return { stdout: 'x'.repeat(262_145) };
      if (failure === 'nonzero') return { code: 3, stdout: 'failed' };
      throw Object.assign(new Error('DO_NOT_ECHO_ERROR'), { killed: true, signal: 'SIGKILL',
        stdout: 'api_key=hidden-value', stderr: 'Authorization: Bearer private-value' });
    };
    const request = { client: 'codex', confirm: true, expectedRevision: revision };
    await assert.rejects(() => manager.updateClient(request), (error) => {
      assert.equal(error.code, 'UPDATE_FAILED');
      assert.equal(error.lockRetained, true);
      assert.doesNotMatch(JSON.stringify(error), /hidden-value|private-value|DO_NOT_ECHO_ERROR/);
      return true;
    });
    assert.equal(fx.files.has('/locks/client.lock'), true);
    await assert.rejects(() => fx.manager().updateClient(request), { code: 'CLIENTS_LOCKED' });
    assert.equal(mutationCalls(fx).length, 1);
  });
}

test('failed post-update readback retains lock rather than reporting success', async () => {
  const fx = fixture();
  const { link } = fx.install('pi');
  const manager = fx.manager();
  const { revision } = await manager.previewUpdate('pi');
  fx.state.onRun = async ({ args }) => {
    if (args[1] === 'update') { fx.files.delete(link); return { stdout: 'done' }; }
  };
  await assert.rejects(() => manager.updateClient({ client: 'pi', confirm: true, expectedRevision: revision }), { code: 'READBACK_FAILED', lockRetained: true });
  assert.equal(fx.files.has('/locks/client.lock'), true);
});

test('drift on the final prelaunch observation never executes the update', async () => {
  const fx = fixture();
  const { bin } = fx.install('claude');
  const manager = fx.manager();
  const { revision } = await manager.previewUpdate('claude');
  let observations = 0;
  fx.state.onRun = async () => {
    if (++observations === 2) fx.setVersion(bin, '1.2.4');
  };
  await assert.rejects(() => manager.updateClient({ client: 'claude', confirm: true, expectedRevision: revision }), { code: 'STALE_REVISION' });
  assert.equal(mutationCalls(fx).length, 0);
  assert.equal(fx.files.has('/locks/client.lock'), false);
});

test('lock creation and release failures are explicit and fail closed', async () => {
  for (const operation of ['mkdir', 'rmdir']) {
    const fx = fixture();
    fx.install('codex');
    const manager = fx.manager({ fs: { ...fx.fs, async [operation]() { throw new Error('denied'); } } });
    const { revision } = await manager.previewUpdate('codex');
    await assert.rejects(() => manager.updateClient({ client: 'codex', confirm: true, expectedRevision: revision }), { code: operation === 'mkdir' ? 'CLIENTS_LOCKED' : 'LOCK_RELEASE_FAILED' });
    assert.equal(mutationCalls(fx).length, operation === 'mkdir' ? 0 : 1);
  }
});

test('redaction covers tokens, headers, quoted values, URLs and private keys', () => {
  const output = redactClientOutput([
    'api_key=hidden-one token=hidden-two secret="hidden three" password=hidden-four',
    'Authorization: Bearer hidden-five', 'Cookie: sid=hidden-six',
    'https://hidden-user:hidden-pass@example.invalid/?token=hidden-seven',
    'sk-hiddeneight123 github_pat_hiddennine npm_hiddenten',
    '-----BEGIN PRIVATE KEY-----\nhidden-eleven\n-----END PRIVATE KEY-----',
    'eyJhidden.twelve.thirteen',
  ].join('\n'));
  assert.doesNotMatch(output, /hidden/i);
  assert.match(output, /REDACTED/);
});
