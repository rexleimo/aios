import assert from 'node:assert/strict';
import test from 'node:test';
import { CLIENT_IDS } from '../../../lib/tooling/clients/index.mjs';
import { fixture } from './fixtures.mjs';

test('config existence is never executable installation evidence', async () => {
  const fx = fixture();
  fx.json('/home/test/.claude/settings.json', { configured: true });
  fx.file('/home/test/.codex/config.toml', 'configured=true');
  const clients = await fx.manager().inventory();
  assert.deepEqual(clients.map((item) => item.id), CLIENT_IDS);
  assert.deepEqual(clients.slice(0, 3).map((item) => [item.installed, item.source.kind]), [[false, 'missing'], [false, 'missing'], [false, 'missing']]);
  assert.equal(fx.calls.length, 0);
  assert.equal(fx.reads.length, 0);
});

for (const id of ['claude', 'codex', 'pi']) {
  test(`${id}: PATH + symlinks + matching global metadata + bounded version identifies npm source`, async () => {
    const fx = fixture();
    const installed = fx.install(id);
    const client = (await fx.manager().inventory()).find((entry) => entry.id === id);
    assert.equal(client.installed, true);
    assert.equal(client.version, '1.2.3');
    assert.equal(client.source.kind, 'npm-global');
    assert.equal(client.source.prefix, '/tools');
    assert.equal(client.executable.path, installed.link);
    assert.equal(client.executable.realPath, installed.bin);
    assert.equal(client.update.supported, true);
    assert.match(client.revision, /^[a-f0-9]{64}$/);
    const [call] = fx.calls;
    assert.deepEqual(call.args, ['--version']);
    assert.equal(call.options.shell, false);
    assert.equal(call.options.timeout, 2500);
    assert.equal(call.options.maxBuffer, 16384);
    assert.equal(call.options.killSignal, 'SIGKILL');
    assert.equal(call.options.env.OPENAI_API_KEY, undefined);
    assert.equal(call.options.env.NODE_OPTIONS, undefined);
    assert.ok(fx.reads.every((file) => file.endsWith('/package.json')));
  });
}

test('known version formats are accepted without returning arbitrary output', async () => {
  for (const [id, value, expected] of [['claude', '2.4.0 (Claude Code)\n', '2.4.0'], ['codex', 'codex-cli 1.5.0', '1.5.0'], ['pi', 'v0.60.0-beta.1', '0.60.0-beta.1']]) {
    const fx = fixture();
    const { bin } = fx.install(id);
    fx.setVersion(bin, value);
    assert.equal((await fx.manager().previewUpdate(id)).version, expected);
  }
});

test('executable without package evidence is installed, not npm-managed', async () => {
  const fx = fixture();
  fx.file('/tools/bin/claude', 'unidentified binary');
  const preview = await fx.manager().previewUpdate('claude');
  assert.equal(preview.source.kind, 'unknown');
  assert.equal(preview.supported, false);
  assert.equal(preview.command, null);
  assert.match(preview.reason, /unverified/);
});

test('local node_modules, package name mismatch, bin mismatch and missing npm runner cannot update', async () => {
  for (const kind of ['local', 'name', 'bin', 'npm', 'oversize', 'invalid-json', 'linked-root']) {
    const fx = fixture();
    const installed = fx.install('codex', { npm: kind !== 'npm' });
    if (kind === 'local') {
      fx.file('/project/node_modules/@openai/codex/bin/codex.js');
      fx.link(installed.link, '/project/node_modules/@openai/codex/bin/codex.js');
    }
    if (kind === 'name') fx.json(installed.metadata, { name: 'lookalike', version: '1.2.3', bin: { codex: 'bin/cli.js' } });
    if (kind === 'bin') fx.json(installed.metadata, { name: '@openai/codex', version: '1.2.3', bin: { codex: '../../elsewhere' } });
    if (kind === 'oversize') fx.file(installed.metadata, 'x'.repeat(65_537));
    if (kind === 'invalid-json') fx.file(installed.metadata, '{');
    if (kind === 'linked-root') fx.link(installed.root, '/somewhere/else');
    const preview = await fx.manager().previewUpdate('codex');
    assert.equal(preview.supported, false, kind);
    assert.equal(preview.command, null, kind);
  }
});

test('Homebrew, stores and native-layout-only installs never guess npm or claude update', async () => {
  for (const [target, source] of [['/opt/homebrew/Cellar/claude/1.2.3/claude', 'homebrew'], ['/snap/codex/current/codex', 'store'], ['/home/test/.local/share/claude/versions/1.2.3', 'claude-native']]) {
    const fx = fixture();
    fx.file(target, 'binary');
    fx.link('/tools/bin/claude', target);
    const preview = await fx.manager().previewUpdate('claude');
    assert.equal(preview.source.kind, source);
    assert.equal(preview.supported, false);
    assert.equal(preview.command, null);
    assert.ok(preview.reason);
  }
});

test('declared other clients expose unsupported update capability without executing them', async () => {
  const fx = fixture();
  fx.file('/tools/bin/codebuddy', 'binary');
  const client = (await fx.manager().inventory()).find((entry) => entry.id === 'workbuddy');
  assert.equal(client.installed, true);
  assert.equal(client.version, null);
  assert.equal(client.inventorySupported, false);
  assert.equal(client.update.supported, false);
  assert.equal(fx.calls.length, 0);
});

test('PATH resolver skips project-controlled paths and rejects nonexecutables and dangling links', async () => {
  const fx = fixture();
  fx.file('/tools/bin/claude', 'not executable', 0o644);
  fx.file('/project/claude', 'should not resolve');
  fx.link('/tools/bin/codex', '/does/not/exist');
  const clients = await fx.manager({ env: { PATH: '.::relative:/tools/bin' } }).inventory();
  assert.equal(clients.find((item) => item.id === 'claude').installed, false);
  assert.equal(clients.find((item) => item.id === 'codex').installed, false);
  assert.equal(fx.calls.length, 0);
});

test('injectable resolver must return an absolute executable, not a command or config file', async () => {
  const fx = fixture();
  const clients = await fx.manager({ resolveExecutable: async () => 'claude;bad' }).inventory();
  assert.equal(clients[0].installed, null);
  assert.equal(clients[0].update.supported, false);
  assert.equal(fx.calls.length, 0);
});

test('version failure, excessive output and credential-bearing output fail closed', async () => {
  for (const result of [new Error('secret'), { stdout: 'x'.repeat(16_385) }, { stdout: '1.2.3\napi_key=supersecret' }]) {
    const fx = fixture();
    fx.install('pi');
    fx.state.onRun = async () => { if (result instanceof Error) throw result; return result; };
    const preview = await fx.manager().previewUpdate('pi');
    assert.equal(preview.supported, false);
    assert.equal(preview.version, null);
    assert.doesNotMatch(JSON.stringify(preview), /supersecret/);
  }
});

test('concurrent symlink changes during --version invalidate an otherwise supported source', async () => {
  const fx = fixture();
  const { link } = fx.install('claude');
  fx.state.onRun = async () => { fx.file('/other/claude'); fx.link(link, '/other/claude'); return { stdout: '1.2.3' }; };
  const preview = await fx.manager().previewUpdate('claude');
  assert.equal(preview.supported, false);
  assert.match(preview.reason, /changed during inspection/);
});

test('inspection failures and torn observations report unknown, never missing or installed', async () => {
  for (const kind of ['resolver', 'readback']) {
    const fx = fixture();
    const { link } = fx.install('claude');
    const options = kind === 'resolver' ? { resolveExecutable: async () => { throw new Error('unreadable'); } } : {};
    if (kind === 'readback') fx.state.onRun = async () => { fx.files.delete(link); return { stdout: '1.2.3' }; };
    const client = (await fx.manager(options).inventory()).find((entry) => entry.id === 'claude');
    assert.equal(client.installed, null, kind);
    assert.equal(client.versionStatus, 'unknown', kind);
    assert.equal(client.version, null, kind);
    assert.equal(client.update.supported, false, kind);
  }
});

test('unreadable npm metadata keeps executable installed but source unknown', async () => {
  const fx = fixture();
  const { metadata } = fx.install('codex');
  fx.state.onRead = (file) => { if (file === metadata) throw Object.assign(new Error('denied'), { code: 'EACCES' }); };
  const client = (await fx.manager().inventory()).find((entry) => entry.id === 'codex');
  assert.equal(client.installed, true);
  assert.equal(client.versionStatus, 'ok');
  assert.equal(client.source.kind, 'unknown');
  assert.equal(client.update.supported, false);
});

test('successful executable detection is distinct from version probe failure', async () => {
  const fx = fixture();
  fx.install('pi');
  fx.state.onRun = async () => { throw Object.assign(new Error('timeout'), { killed: true, signal: 'SIGKILL' }); };
  const client = (await fx.manager().inventory()).find((entry) => entry.id === 'pi');
  assert.equal(client.installed, true);
  assert.equal(client.version, null);
  assert.equal(client.versionStatus, 'failed');
  assert.equal(client.update.supported, false);
});

test('npm attribution does not authorize an unverified npm or Node runner', async () => {
  for (const kind of ['npm-name', 'npm-version', 'npm-bin', 'npm-executable', 'node-executable']) {
    const fx = fixture();
    fx.install('codex');
    const metadata = { name: 'npm', version: '10.0.0', bin: { npm: 'bin/npm-cli.js' } };
    if (kind === 'npm-name') metadata.name = 'not-npm';
    if (kind === 'npm-version') metadata.version = 'unrecognized';
    if (kind === 'npm-bin') metadata.bin.npm = '../different-runner.js';
    fx.json('/tools/lib/node_modules/npm/package.json', metadata);
    if (kind === 'npm-executable') fx.file('/tools/lib/node_modules/npm/bin/npm-cli.js', 'runner', 0o644);
    if (kind === 'node-executable') fx.file('/runtime/node', 'node', 0o644);
    const preview = await fx.manager().previewUpdate('codex');
    assert.equal(preview.source.kind, 'npm-global', kind);
    assert.equal(preview.supported, false, kind);
    assert.equal(preview.command, null, kind);
    assert.match(preview.reason, /runner/, kind);
  }
});

test('metadata changing during a bounded read cannot establish installer evidence', async () => {
  const fx = fixture();
  const { metadata } = fx.install('pi');
  const open = fx.fs.open;
  fx.fs.open = async (file, mode) => {
    const handle = await open(file, mode);
    if (file !== metadata) return handle;
    return {
      ...handle,
      async read(...args) {
        const result = await handle.read(...args);
        fx.file(metadata, fx.files.get(metadata).text);
        return result;
      },
    };
  };
  const client = (await fx.manager().inventory()).find((entry) => entry.id === 'pi');
  assert.equal(client.installed, true);
  assert.equal(client.source.kind, 'unknown');
  assert.equal(client.update.supported, false);
  assert.match(client.update.reason, /changing/);
});

test('excessive executable symlink chains yield unknown state without process execution', async () => {
  const fx = fixture();
  fx.link('/tools/bin/pi', '/links/0');
  for (let index = 0; index < 13; index += 1) fx.link(`/links/${index}`, `/links/${index + 1}`);
  fx.file('/links/13', 'binary');
  const client = (await fx.manager().inventory()).find((entry) => entry.id === 'pi');
  assert.equal(client.installed, null);
  assert.equal(client.versionStatus, 'unknown');
  assert.equal(client.update.supported, false);
  assert.equal(fx.calls.length, 0);
});

test('Windows command shims are detected but never probed through a shell or auto-updated', async () => {
  const fx = fixture();
  const executable = 'C:\\tools\\codex.cmd';
  const backing = '/windows/codex.cmd';
  fx.file(backing, '@echo off');
  const manager = fx.manager({
    platform: 'win32', home: 'C:\\Users\\test',
    resolveExecutable: async (name) => name === 'codex' ? executable : null,
    fs: {
      ...fx.fs,
      lstat: async () => fx.fs.lstat(backing),
      access: async () => fx.fs.access(backing, 0),
      realpath: async () => executable,
    },
  });
  const client = (await manager.inventory()).find((entry) => entry.id === 'codex');
  assert.equal(client.installed, true);
  assert.equal(client.executable.path, executable);
  assert.equal(client.versionStatus, 'unsupported');
  assert.equal(client.source.kind, 'unknown');
  assert.equal(client.update.supported, false);
  assert.match(client.update.reason, /Windows shims/);
  assert.equal(fx.calls.length, 0);
});
