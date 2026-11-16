import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { connectInplace, disconnectInplace, inplaceStatus, inplaceBackupPath } from '../../../lib/tooling/model-router/connect/inplace.mjs';
import { describeConnect } from '../../../lib/tooling/model-router/lifecycle/daemon.mjs';

const GW = 'http://127.0.0.1:8686';

function seedHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-inplace-test-'));
  const home = path.join(root, 'home');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(home, '.pi', 'agent'), { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({
    model: 'claude-sonnet-5',
    env: { ANTHROPIC_BASE_URL: 'https://user-relay.example', OTHER_VAR: 'keep' },
  }, null, 2));
  fs.writeFileSync(path.join(home, '.codex', 'config.toml'), '# user config\nmodel_provider = "custom"\nmodel = "gpt-6-astra"\n\n[model_providers.custom]\nname = "custom"\nbase_url = "https://user-relay.example/v1"\n');
  fs.writeFileSync(path.join(home, '.pi', 'agent', 'settings.json'), JSON.stringify({ defaultProvider: 'magpie', defaultModel: 'grok/grok-4.7', theme: 'dark' }, null, 2));
  fs.writeFileSync(path.join(home, '.pi', 'agent', 'models.json'), JSON.stringify({ providers: { grok: { api: 'openai-chat', baseUrl: 'https://x.ai', models: [] } } }, null, 2));
  return { root, home, stateDir };
}

function cleanup(root) { fs.rmSync(root, { recursive: true, force: true }); }
const read = (home, rel) => fs.readFileSync(path.join(home, rel), 'utf8');
const CONFIG_FILES = ['.claude/settings.json', '.codex/config.toml', '.pi/agent/settings.json', '.pi/agent/models.json'];
const snapshot = (home) => Object.fromEntries(CONFIG_FILES.map((file) => [file, read(home, file)]));
const noTemporaryFiles = (root) => assert.deepEqual(fs.readdirSync(root, { recursive: true }).filter((file) => String(file).includes('.aios-tmp-')), []);

test('就地接入→改写真实配置+备份原值→还原回到原值，备份删除，无临时文件残留', () => {
  const { root, home, stateDir } = seedHome();
  try {
    const res = connectInplace({ home, gatewayUrl: GW, stateDir });
    assert.equal(res.ok, true);
    assert.deepEqual(res.connected, ['claude', 'codex', 'pi']);
    assert.ok(fs.existsSync(inplaceBackupPath(stateDir)), '备份落盘');

    const claude = JSON.parse(read(home, '.claude/settings.json'));
    assert.equal(claude.env.ANTHROPIC_BASE_URL, GW);
    assert.equal(claude.env.OTHER_VAR, 'keep', '用户其它 env 保留');
    const codex = read(home, '.codex/config.toml');
    assert.match(codex, /model_provider = "aios-gateway"/u);
    assert.match(codex, /\[model_providers\.custom\]/u, '用户 provider 保留');
    const piSettings = JSON.parse(read(home, '.pi/agent/settings.json'));
    assert.equal(piSettings.defaultProvider, 'aios-gateway');
    assert.equal(piSettings.theme, 'dark');

    const status = inplaceStatus({ stateDir });
    assert.equal(status.connected, true);
    assert.deepEqual(status.clients.map((c) => c.connected), [true, true, true]);

    const disc = disconnectInplace({ stateDir });
    assert.equal(disc.disconnected, true);
    assert.ok(!fs.existsSync(inplaceBackupPath(stateDir)), '备份删除');
    const claude2 = JSON.parse(read(home, '.claude/settings.json'));
    assert.equal(claude2.env.ANTHROPIC_BASE_URL, 'https://user-relay.example', '还原用户原 base url');
    assert.ok(!('ANTHROPIC_AUTH_TOKEN' in claude2.env), '原本没有的 key 删除');
    assert.equal(claude2.env.OTHER_VAR, 'keep');
    const codex2 = read(home, '.codex/config.toml');
    assert.match(codex2, /model_provider = "custom"/u, '还原用户原 provider');
    assert.ok(!codex2.includes('aios-gateway'));
    const pi2 = JSON.parse(read(home, '.pi/agent/settings.json'));
    assert.equal(pi2.defaultProvider, 'magpie');
    assert.ok(!('aios-gateway' in JSON.parse(read(home, '.pi/agent/models.json')).providers));
    assert.equal(inplaceStatus({ stateDir }).connected, false);

    const leftovers = fs.readdirSync(home, { recursive: true }).filter((f) => String(f).includes('.aios-tmp-'));
    assert.deepEqual(leftovers, [], '原子写不留临时文件');
  } finally { cleanup(root); }
});

test('幂等：重复接入沿用原值备份，disconnect 仍还原到接入前的用户原值', () => {
  const { root, home, stateDir } = seedHome();
  try {
    connectInplace({ home, gatewayUrl: GW, stateDir });
    connectInplace({ home, gatewayUrl: GW, stateDir });
    const codex = read(home, '.codex/config.toml');
    assert.equal((codex.match(/# aios-gateway:begin/gu) || []).length, 1, '不堆叠标记块');
    disconnectInplace({ stateDir });
    assert.match(read(home, '.codex/config.toml'), /model_provider = "custom"/u, '还原到最初用户值而非网关值');
    assert.equal(JSON.parse(read(home, '.claude/settings.json')).env.ANTHROPIC_BASE_URL, 'https://user-relay.example');
  } finally { cleanup(root); }
});

test('原本不存在的配置文件：接入时创建，还原时删除', () => {
  const { root, home, stateDir } = seedHome();
  try {
    fs.rmSync(path.join(home, '.codex', 'config.toml'));
    connectInplace({ home, gatewayUrl: GW, stateDir, clients: ['codex'] });
    assert.ok(fs.existsSync(path.join(home, '.codex', 'config.toml')), '接入创建文件');
    disconnectInplace({ stateDir });
    assert.ok(!fs.existsSync(path.join(home, '.codex', 'config.toml')), '原本不存在 → 还原删除');
  } finally { cleanup(root); }
});

test('无备份时 disconnect 如实 not-connected，不擅自改配置', () => {
  const { root, home, stateDir } = seedHome();
  try {
    const before = read(home, '.claude/settings.json');
    const disc = disconnectInplace({ stateDir });
    assert.equal(disc.disconnected, false);
    assert.equal(disc.reason, 'not-connected');
    assert.equal(read(home, '.claude/settings.json'), before, '未接入不动配置');
  } finally { cleanup(root); }
});

test('只接入部分客户端：status 如实区分，disconnect 只还原已接入的', () => {
  const { root, home, stateDir } = seedHome();
  try {
    connectInplace({ home, gatewayUrl: GW, stateDir, clients: ['claude'] });
    const status = inplaceStatus({ stateDir });
    assert.deepEqual(status.clients.map((c) => [c.client, c.connected]), [['claude', true], ['codex', false], ['pi', false]]);
    assert.match(read(home, '.codex/config.toml'), /model_provider = "custom"/u, '未接入的 codex 不动');
    disconnectInplace({ stateDir });
    assert.equal(JSON.parse(read(home, '.claude/settings.json')).env.ANTHROPIC_BASE_URL, 'https://user-relay.example');
  } finally { cleanup(root); }
});

test('网关状态如实反映就地接入：connect→inplace 已接入，disconnect→未接入（describeConnect 单一源）', () => {
  const { root, home, stateDir } = seedHome();
  try {
    connectInplace({ home, gatewayUrl: GW, stateDir });
    const status = describeConnect(stateDir);
    assert.equal(status.mode, 'inplace');
    assert.equal(status.connected, true);
    assert.deepEqual(status.clients.map((c) => c.connected), [true, true, true]);
    assert.equal(status.gatewayUrl, GW);
    disconnectInplace({ stateDir });
    assert.equal(describeConnect(stateDir).connected, false, '还原后状态回到未接入');
  } finally { cleanup(root); }
});

test('部分还原：只 disconnect claude，codex/pi 仍接入，备份保留剩余客户端', () => {
  const { root, home, stateDir } = seedHome();
  try {
    connectInplace({ home, gatewayUrl: GW, stateDir });
    const res = disconnectInplace({ stateDir, clients: ['claude'] });
    assert.deepEqual(res.remainingClients.sort(), ['codex', 'pi']);
    assert.equal(JSON.parse(read(home, '.claude/settings.json')).env.ANTHROPIC_BASE_URL, 'https://user-relay.example');
    assert.match(read(home, '.codex/config.toml'), /model_provider = "aios-gateway"/u, 'codex 仍接入');
    const status = describeConnect(stateDir);
    assert.deepEqual(status.clients.map((c) => [c.client, c.connected]), [['claude', false], ['codex', true], ['pi', true]]);
    assert.ok(fs.existsSync(inplaceBackupPath(stateDir)), '剩余客户端备份保留');
  } finally { cleanup(root); }
});

for (const malformed of ['.pi/agent/settings.json', '.pi/agent/models.json']) {
  test(`preflights every parser before any mutation: malformed later ${malformed}`, (t) => {
    const f = seedHome();
    t.after(() => cleanup(f.root));
    fs.writeFileSync(path.join(f.home, malformed), '{malformed');
    const before = snapshot(f.home);
    let writes = 0;
    const fsImpl = { ...fs, writeFileSync(...args) { writes += 1; return fs.writeFileSync(...args); } };
    assert.throws(() => connectInplace({ ...f, gatewayUrl: GW, fsImpl }), SyntaxError);
    assert.equal(writes, 0, 'not even a journal is written before parsing succeeds');
    assert.deepEqual(snapshot(f.home), before);
    assert.equal(fs.existsSync(inplaceBackupPath(f.stateDir)), false);
    assert.equal(disconnectInplace(f).reason, 'not-connected');
  });
}

test('failed initial journal persistence cannot mutate any client config', (t) => {
  const f = seedHome();
  t.after(() => cleanup(f.root));
  const before = snapshot(f.home);
  const fsImpl = { ...fs, renameSync(from, to) {
    if (to === inplaceBackupPath(f.stateDir)) throw new Error('journal unavailable');
    return fs.renameSync(from, to);
  } };
  assert.throws(() => connectInplace({ ...f, gatewayUrl: GW, fsImpl }), /journal unavailable/);
  assert.deepEqual(snapshot(f.home), before);
  assert.equal(fs.existsSync(inplaceBackupPath(f.stateDir)), false);
  noTemporaryFiles(f.root);
});

for (const recover of ['retry', 'disconnect']) {
  test(`later client write failure retains original ownership for ${recover} recovery`, (t) => {
    const f = seedHome();
    t.after(() => cleanup(f.root));
    const before = snapshot(f.home);
    const failedFile = path.join(f.home, '.pi/agent/settings.json');
    const fsImpl = { ...fs, renameSync(from, to) {
      if (CONFIG_FILES.some((file) => to === path.join(f.home, file))) {
        const journal = JSON.parse(fs.readFileSync(inplaceBackupPath(f.stateDir), 'utf8'));
        assert.equal(journal.entries.length, 4, 'all recovery records are durable before the first config rename');
        assert.equal(journal.entries[0].backup.baseUrl, 'https://user-relay.example');
      }
      if (to === failedFile) throw new Error('later write unavailable');
      return fs.renameSync(from, to);
    } };
    assert.throws(() => connectInplace({ ...f, gatewayUrl: GW, fsImpl }), /later write unavailable/);
    assert.equal(JSON.parse(read(f.home, '.claude/settings.json')).env.ANTHROPIC_BASE_URL, GW);
    assert.equal(read(f.home, '.pi/agent/settings.json'), before['.pi/agent/settings.json']);
    assert.equal(read(f.home, '.pi/agent/models.json'), before['.pi/agent/models.json']);
    noTemporaryFiles(f.root);

    const claude = JSON.parse(read(f.home, '.claude/settings.json'));
    claude.env.USER_LATER = 'preserve';
    fs.writeFileSync(path.join(f.home, '.claude/settings.json'), JSON.stringify(claude));
    if (recover === 'retry') assert.equal(connectInplace({ ...f, gatewayUrl: GW }).ok, true);
    assert.equal(disconnectInplace(f).disconnected, true);
    const restored = JSON.parse(read(f.home, '.claude/settings.json'));
    assert.equal(restored.env.ANTHROPIC_BASE_URL, 'https://user-relay.example');
    assert.equal(restored.env.USER_LATER, 'preserve', 'unrelated external edits survive recovery');
    assert.equal('ANTHROPIC_AUTH_TOKEN' in restored.env, false);
    assert.match(read(f.home, '.codex/config.toml'), /model_provider = "custom"/);
    assert.doesNotMatch(read(f.home, '.codex/config.toml'), /aios-gateway/);
    assert.deepEqual(JSON.parse(read(f.home, '.pi/agent/settings.json')), JSON.parse(before['.pi/agent/settings.json']));
    assert.deepEqual(JSON.parse(read(f.home, '.pi/agent/models.json')), JSON.parse(before['.pi/agent/models.json']));
    assert.equal(fs.existsSync(inplaceBackupPath(f.stateDir)), false);
    noTemporaryFiles(f.root);
  });
}

test('a config replaced after preflight is not overwritten; recovery still rejects external managed-field edits', (t) => {
  const f = seedHome();
  t.after(() => cleanup(f.root));
  const file = path.join(f.home, '.codex/config.toml');
  const originalCodex = fs.readFileSync(file, 'utf8');
  const external = originalCodex.replace('"custom"', '"user-later"');
  const fsImpl = { ...fs, writeFileSync(target, ...args) {
    const result = fs.writeFileSync(target, ...args);
    if (String(target).startsWith(`${file}.aios-tmp-`)) fs.writeFileSync(file, external);
    return result;
  } };
  assert.throws(() => connectInplace({ ...f, gatewayUrl: GW, fsImpl }), { code: 'CLIENT_CONFIG_STALE' });
  assert.equal(fs.readFileSync(file, 'utf8'), external);
  const after = snapshot(f.home);
  const backup = fs.readFileSync(inplaceBackupPath(f.stateDir), 'utf8');
  assert.throws(() => connectInplace({ ...f, gatewayUrl: GW }), { code: 'CLIENT_CONFIG_STALE' });
  assert.throws(() => disconnectInplace(f), { code: 'CLIENT_CONFIG_STALE' });
  assert.deepEqual(snapshot(f.home), after, 'ownership conflicts are found before any recovery mutation');
  assert.equal(fs.readFileSync(inplaceBackupPath(f.stateDir), 'utf8'), backup);
  fs.writeFileSync(file, originalCodex);
  assert.equal(disconnectInplace(f).disconnected, true);
  assert.equal(JSON.parse(read(f.home, '.claude/settings.json')).env.ANTHROPIC_BASE_URL, 'https://user-relay.example');
  noTemporaryFiles(f.root);
});

test('disconnect preserves user additions in a config that connect originally created', (t) => {
  const f = seedHome();
  t.after(() => cleanup(f.root));
  const file = path.join(f.home, '.claude/settings.json');
  fs.rmSync(file);
  connectInplace({ ...f, gatewayUrl: GW, clients: ['claude'] });
  const current = JSON.parse(fs.readFileSync(file, 'utf8'));
  current.permissions = { allow: ['Read'] };
  current.env.USER_LATER = 'keep';
  fs.writeFileSync(file, JSON.stringify(current));
  connectInplace({ ...f, gatewayUrl: GW, clients: ['claude'] });
  disconnectInplace(f);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { permissions: { allow: ['Read'] }, env: { USER_LATER: 'keep' } });
});

test('disconnect write failures remain retryable without replaying an earlier restore', (t) => {
  const f = seedHome();
  t.after(() => cleanup(f.root));
  connectInplace({ ...f, gatewayUrl: GW });
  const failedFile = path.join(f.home, '.pi/agent/settings.json');
  const fsImpl = { ...fs, renameSync(from, to) {
    if (to === failedFile) throw new Error('restore unavailable');
    return fs.renameSync(from, to);
  } };
  assert.throws(() => disconnectInplace({ ...f, fsImpl }), /restore unavailable/);
  assert.equal(fs.existsSync(inplaceBackupPath(f.stateDir)), true);
  const restoredClaude = read(f.home, '.claude/settings.json');
  assert.equal(JSON.parse(restoredClaude).env.ANTHROPIC_BASE_URL, 'https://user-relay.example');
  disconnectInplace(f);
  assert.equal(read(f.home, '.claude/settings.json'), restoredClaude);
  assert.equal(JSON.parse(read(f.home, '.pi/agent/settings.json')).defaultProvider, 'magpie');
  assert.equal(fs.existsSync(inplaceBackupPath(f.stateDir)), false);
  noTemporaryFiles(f.root);
});

test('planned but unwritten new configs remain user-owned after a partial failure', (t) => {
  const f = seedHome();
  t.after(() => cleanup(f.root));
  const settings = path.join(f.home, '.pi/agent/settings.json');
  const models = path.join(f.home, '.pi/agent/models.json');
  fs.rmSync(settings);
  fs.rmSync(models);
  const fsImpl = { ...fs, renameSync(from, to) {
    if (to === settings) throw new Error('new config unavailable');
    return fs.renameSync(from, to);
  } };
  assert.throws(() => connectInplace({ ...f, gatewayUrl: GW, fsImpl }), /new config unavailable/);
  fs.writeFileSync(models, '{"providers":{"user":{"models":[]}}}\n');
  disconnectInplace(f);
  assert.equal(fs.existsSync(settings), false);
  assert.equal(fs.readFileSync(models, 'utf8'), '{"providers":{"user":{"models":[]}}}\n');
});

for (const failure of ['after-client-rename', 'final-journal']) {
  test(`the durable journal recovers a failure at ${failure}`, (t) => {
    const f = seedHome();
    t.after(() => cleanup(f.root));
    const before = snapshot(f.home);
    let journalRenames = 0;
    const fsImpl = { ...fs, renameSync(from, to) {
      if (to === inplaceBackupPath(f.stateDir)) {
        journalRenames += 1;
        if (failure === 'final-journal' && journalRenames === 2) throw new Error('completion unavailable');
      }
      fs.renameSync(from, to);
      if (failure === 'after-client-rename' && to === path.join(f.home, '.pi/agent/settings.json')) throw new Error('completion unavailable');
    } };
    assert.throws(() => connectInplace({ ...f, gatewayUrl: GW, fsImpl }), /completion unavailable/);
    const journal = JSON.parse(fs.readFileSync(inplaceBackupPath(f.stateDir), 'utf8'));
    assert.equal(journal.entries.every((entry) => entry.pending?.before && entry.pending?.after), true);
    assert.equal(disconnectInplace(f).disconnected, true);
    for (const file of CONFIG_FILES.filter((file) => file.endsWith('.json'))) assert.deepEqual(JSON.parse(read(f.home, file)), JSON.parse(before[file]));
    assert.match(read(f.home, '.codex/config.toml'), /model_provider = "custom"/);
    assert.doesNotMatch(read(f.home, '.codex/config.toml'), /aios-gateway/);
    noTemporaryFiles(f.root);
  });
}

test('legacy original backups retain ownership when a different client reconnects to another gateway', (t) => {
  const f = seedHome();
  t.after(() => cleanup(f.root));
  const before = snapshot(f.home);
  connectInplace({ ...f, gatewayUrl: GW });
  const file = inplaceBackupPath(f.stateDir);
  const legacy = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete legacy.schemaVersion;
  for (const entry of legacy.entries) delete entry.applied;
  fs.writeFileSync(file, JSON.stringify(legacy));
  connectInplace({ ...f, clients: ['pi'], gatewayUrl: 'http://127.0.0.1:8687', modelId: 'other' });
  assert.equal(disconnectInplace(f).disconnected, true);
  for (const config of CONFIG_FILES.filter((config) => config.endsWith('.json'))) assert.deepEqual(JSON.parse(read(f.home, config)), JSON.parse(before[config]));
  assert.match(read(f.home, '.codex/config.toml'), /model_provider = "custom"/);
});
