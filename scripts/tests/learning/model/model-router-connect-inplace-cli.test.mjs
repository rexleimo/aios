import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runConnectInplace, runConnect, runDisconnect } from '../../../lib/tooling/model-router/connect/command.mjs';
import { parseModelRouterArgs } from '../../../lib/tooling/cli/parse-args/govern/model-router.mjs';

const GW = 'http://127.0.0.1:8686';
const io = { log() {}, error() {} };

function seed() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-inplace-cli-'));
  const home = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  const registryFile = path.join(root, 'memory/specs/model-registry.json');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(home, '.pi', 'agent'), { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(path.dirname(registryFile), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), `${JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://user-relay.example' } }, null, 2)}\n`);
  fs.writeFileSync(path.join(home, '.codex', 'config.toml'), 'model_provider = "custom"\nmodel = "x"\n');
  fs.writeFileSync(path.join(home, '.pi', 'agent', 'settings.json'), `${JSON.stringify({ theme: 'dark' }, null, 2)}\n`);
  fs.writeFileSync(path.join(home, '.pi', 'agent', 'models.json'), `${JSON.stringify({ providers: {} }, null, 2)}\n`);
  fs.writeFileSync(registryFile, JSON.stringify({
    activeModel: 'test-claude',
    models: {
      'test-claude': { source: 'custom', provider: 'test-provider', protocols: ['claude'] },
      'test-response': { source: 'custom', provider: 'test-provider', protocols: ['openai-response'] },
    },
    providers: { 'test-provider': { baseUrl: 'http://127.0.0.1:9', authMode: 'none', protocols: ['claude', 'openai-response'] } },
    clientDefaults: { codex: 'gpt-5.5' },
  }, null, 2));
  return { root, home, stateDir, registryFile };
}
const cleanup = (root) => fs.rmSync(root, { recursive: true, force: true });

const CLIENT_FILES = ['.claude/settings.json', '.codex/config.toml', '.pi/agent/settings.json', '.pi/agent/models.json'];
const clientSnapshot = (home) => Object.fromEntries(CLIENT_FILES.map((relative) => [relative, fs.readFileSync(path.join(home, relative), 'utf8')]));

function installCli(f) {
  const sourceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  // Copy the real entrypoint/module tree so registry paths cannot resolve into the checkout.
  fs.mkdirSync(path.join(f.root, 'scripts'), { recursive: true });
  fs.cpSync(path.join(sourceRoot, 'scripts/lib'), path.join(f.root, 'scripts/lib'), { recursive: true });
  fs.cpSync(path.join(sourceRoot, 'src'), path.join(f.root, 'src'), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, 'scripts/aios.mjs'), path.join(f.root, 'scripts/aios.mjs'));
  fs.copyFileSync(path.join(sourceRoot, 'package.json'), path.join(f.root, 'package.json'));
  fs.symlinkSync(path.join(sourceRoot, 'node_modules'), path.join(f.root, 'node_modules'), 'dir');
  fs.symlinkSync(path.join(sourceRoot, 'rex-harness'), path.join(f.root, 'rex-harness'), 'dir');
  const guard = path.join(f.root, 'forbid-network.mjs');
  fs.writeFileSync(guard, 'globalThis.fetch = () => { throw new Error("network forbidden in connect CLI tests"); };\n');
  return (...args) => {
    const result = spawnSync(process.execPath, [path.join(f.root, 'scripts/aios.mjs'), 'model-router', ...args], {
      cwd: f.root,
      env: {
        ...process.env,
        HOME: f.home,
        AIOS_PROJECT_ROOT: f.root,
        AIOS_GATEWAY_STATE_DIR: f.stateDir,
        CODEX_HOME: path.join(f.home, '.codex'),
        CLAUDE_CONFIG_DIR: path.join(f.home, '.claude'),
        PI_CODING_AGENT_DIR: path.join(f.home, '.pi/agent'),
        XDG_CONFIG_HOME: path.join(f.home, '.config'),
        XDG_STATE_HOME: path.join(f.home, '.local/state'),
        XDG_CACHE_HOME: path.join(f.home, '.cache'),
        NODE_OPTIONS: `--import=${pathToFileURL(guard).href}`,
      },
      encoding: 'utf8', timeout: 30_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return result;
  };
}

test('model-router parser preserves --dry-run without leaking it to later invocations', () => {
  const preview = parseModelRouterArgs(['model-router', 'connect', '--dry-run', '--isolated', '--client', 'claude']);
  assert.equal(preview.mode, 'command');
  assert.equal(preview.options.dryRun, true);
  assert.equal(preview.options.isolated, true);
  assert.equal(preview.options.client, 'claude');
  assert.equal(parseModelRouterArgs(['model-router', 'connect']).options.dryRun, undefined);
});

for (const isolated of [false, true]) {
  test(`real file CLI --dry-run leaves clients, registry and state unchanged (isolated=${isolated})`, (t) => {
    const f = seed();
    t.after(() => cleanup(f.root));
    const cli = installCli(f);
    const before = clientSnapshot(f.home);
    const registryBefore = fs.readFileSync(f.registryFile, 'utf8');
    fs.writeFileSync(path.join(f.stateDir, 'gateway.pid.json'), '{"pid":123,"port":8686}\n');
    const preview = cli('connect', '--dry-run', '--json', '--home', f.home, '--gateway-url', GW,
      '--state-dir', f.stateDir, '--codex-model', 'test-response', ...(isolated ? ['--isolated'] : []));
    assert.equal(preview.status, 0, preview.stderr || preview.stdout);
    const result = JSON.parse(preview.stdout);
    assert.equal(result.dryRun, true);
    assert.equal(result.ok, true);
    assert.deepEqual(clientSnapshot(f.home), before);
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), registryBefore);
    assert.deepEqual(fs.readdirSync(f.stateDir), ['gateway.pid.json']);
    assert.equal(fs.readFileSync(path.join(f.stateDir, 'gateway.pid.json'), 'utf8'), '{"pid":123,"port":8686}\n');
    assert.equal(fs.existsSync(`${f.registryFile}.write-lock`), false);

    const unsupported = cli('disconnect', '--dry-run', '--json', '--state-dir', f.stateDir);
    assert.equal(unsupported.status, 1, unsupported.stderr || unsupported.stdout);
    assert.equal(JSON.parse(unsupported.stdout).error, 'unsupported_dry_run');
    assert.deepEqual(clientSnapshot(f.home), before);
    assert.equal(fs.readFileSync(f.registryFile, 'utf8'), registryBefore);
    assert.deepEqual(fs.readdirSync(f.stateDir), ['gateway.pid.json']);

    fs.rmSync(f.registryFile);
    fs.rmSync(f.stateDir, { recursive: true });
    const rejected = cli('connect', '--dry-run', '--json', '--home', f.home, '--state-dir', f.stateDir,
      ...(isolated ? ['--isolated'] : []));
    assert.equal(rejected.status, 1, rejected.stderr || rejected.stdout);
    assert.equal(JSON.parse(rejected.stdout).dryRun, true);
    assert.equal(JSON.parse(rejected.stdout).error, 'gateway_not_ready');
    assert.deepEqual(clientSnapshot(f.home), before);
    assert.equal(fs.existsSync(f.registryFile), false);
    assert.equal(fs.existsSync(f.stateDir), false);
  });
}

test('就地接入 CLI：改写真实配置 + 设 codex 路由默认 + 备份；disconnect 还原配置/registry 且不删网关 pidfile', async () => {
  const { root, home, stateDir, registryFile } = seed();
  try {
    // 网关 pidfile 先存在——disconnect 绝不能把它一起删掉（隔离模式旧 bug 会 rmSync 整个 stateDir）。
    fs.writeFileSync(path.join(stateDir, 'gateway.pid.json'), JSON.stringify({ pid: 123, port: 8686 }));
    const res = await runConnectInplace({ home, gatewayUrl: GW, stateDir, registryFile, clients: ['claude', 'codex', 'pi'], codexModel: 'test-response', io });
    assert.equal(res.exitCode, 0);
    assert.equal(res.mode, 'inplace');
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8')).env.ANTHROPIC_BASE_URL, GW);
    assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).clientDefaults.codex, 'test-response');
    assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir, 'connect-state.json'), 'utf8')).mode, 'inplace');
    assert.ok(fs.existsSync(path.join(stateDir, 'connect-backup.json')));

    const disc = await runDisconnect({ stateDir, registryFile, io });
    assert.equal(disc.exitCode, 0);
    assert.equal(disc.mode, 'inplace');
    assert.equal(JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8')).env.ANTHROPIC_BASE_URL, 'https://user-relay.example');
    assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).clientDefaults.codex, 'gpt-5.5', '还原用户原 codex 默认');
    assert.ok(!fs.existsSync(path.join(stateDir, 'connect-state.json')));
    assert.ok(!fs.existsSync(path.join(stateDir, 'connect-backup.json')));
    assert.ok(fs.existsSync(path.join(stateDir, 'gateway.pid.json')), '网关 pidfile 必须保留');
  } finally { cleanup(root); }
});

test('--isolated 兜底：仍生成隔离工件 + connect.sh，不碰真实配置', async () => {
  const { root, home, stateDir, registryFile } = seed();
  try {
    const before = fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8');
    const res = await runConnect({ gatewayUrl: GW, stateDir, registryFile, clients: ['claude'], io });
    assert.equal(res.mode, 'isolated');
    assert.ok(fs.existsSync(path.join(stateDir, 'claude-settings.json')));
    assert.ok(fs.existsSync(path.join(stateDir, 'connect.sh')));
    assert.equal(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'), before, '隔离模式不碰真实配置');
    await runDisconnect({ stateDir, registryFile, io });
    assert.ok(!fs.existsSync(path.join(stateDir, 'claude-settings.json')));
  } finally { cleanup(root); }
});

test('real file CLI uses an explicit ready registry under temporary HOME and restores clients even after models are removed', (t) => {
  const f = seed();
  t.after(() => cleanup(f.root));
  const cli = installCli(f);
  const before = clientSnapshot(f.home);
  const pidFile = path.join(f.stateDir, 'gateway.pid.json');
  fs.writeFileSync(pidFile, '{"pid":123,"port":8686}\n');
  const connected = cli('connect', '--json', '--home', f.home, '--gateway-url', GW, '--state-dir', f.stateDir, '--codex-model', 'test-response');
  assert.equal(connected.status, 0, connected.stderr || connected.stdout);
  assert.equal(JSON.parse(connected.stdout).mode, 'inplace');
  assert.equal(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')).clientDefaults.codex, 'test-response');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.home, '.claude/settings.json'), 'utf8')).env.ANTHROPIC_BASE_URL, GW);

  const edited = JSON.parse(fs.readFileSync(f.registryFile, 'utf8'));
  edited.models = {};
  edited.providers = {};
  fs.writeFileSync(f.registryFile, JSON.stringify(edited));
  const disconnected = cli('disconnect', '--json', '--state-dir', f.stateDir);
  assert.equal(disconnected.status, 0, disconnected.stderr || disconnected.stdout);
  assert.equal(JSON.parse(disconnected.stdout).mode, 'inplace');
  assert.deepEqual(clientSnapshot(f.home), before);
  assert.equal(JSON.parse(fs.readFileSync(f.registryFile, 'utf8')).clientDefaults.codex, 'gpt-5.5');
  assert.equal(fs.readFileSync(pidFile, 'utf8'), '{"pid":123,"port":8686}\n');
  const repeated = cli('disconnect', '--json', '--state-dir', f.stateDir);
  assert.equal(repeated.status, 0, repeated.stderr || repeated.stdout);
  assert.equal(fs.readFileSync(pidFile, 'utf8'), '{"pid":123,"port":8686}\n');
  assert.deepEqual(clientSnapshot(f.home), before);
});

test('real file CLI keeps the empty bundled seed separate from native aliases and rejects before client edits', (t) => {
  const f = seed();
  t.after(() => cleanup(f.root));
  const cli = installCli(f);
  fs.rmSync(f.registryFile);
  const before = clientSnapshot(f.home);
  const catalog = cli('models', '--json');
  assert.equal(catalog.status, 0, catalog.stderr || catalog.stdout);
  assert.deepEqual(JSON.parse(catalog.stdout), { models: [] });
  for (const mode of [[], ['--isolated']]) {
    const rejected = cli('connect', '--json', '--home', f.home, '--state-dir', f.stateDir, ...mode);
    assert.equal(rejected.status, 1, rejected.stderr || rejected.stdout);
    assert.equal(JSON.parse(rejected.stdout).error, 'gateway_not_ready');
    assert.deepEqual(clientSnapshot(f.home), before);
    assert.deepEqual(fs.readdirSync(f.stateDir), []);
    assert.equal(fs.existsSync(f.registryFile), false);
  }
});
