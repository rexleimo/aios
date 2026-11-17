import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { syncBuiltinESMExports } from 'node:module';
import { actionWrites } from '../../../../../apps/shell/ui/src/lib/data/mcp.mjs';
import { installServer, uninstallServer } from '../../../../lib/clients/mcp/install-policy.mjs';
import { readMcpLedger, writeMcpLedger, recordOwnership, releaseOwnership, touchVerified } from '../../../../lib/clients/mcp/ledger.mjs';
import { runMcpCommand } from '../../../../lib/clients/mcp/cli.mjs';
import { createMcpActionService } from '../../../../../apps/shell/ui/src/app/api/mcp/action-service.mjs';

export function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = { clientId: 'claude', scope: 'home', serverName: 'aios-search',
    entry: { type: 'stdio', command: 'node', args: ['/fake/aios-search-mcp.mjs'] },
    filePath: path.join(root, 'settings.json'), ledgerDir: path.join(root, 'ledger'), backupDir: path.join(root, 'backups') };
  fs.writeFileSync(options.filePath, '{"keep":true,"mcpServers":{}}\n');
  return options;
}

test('all config and ownership mutations require API confirmation', () => {
  for (const action of ['add', 'remove', 'adopt']) assert.equal(actionWrites(action), true, action);
  assert.equal(actionWrites('doctor'), false);
});

test('approved installation uses the existing writer, records ownership and preserves an original backup', async (t) => {
  const options = fixture(t);
  const original = fs.readFileSync(options.filePath, 'utf8');
  const preview = await installServer({ ...options, dryRun: true });
  const result = await installServer({ ...options, expectedRevision: preview.revision });
  assert.equal(result.status, 'installed');
  assert.equal(result.classification.status, 'owned');
  assert.equal(fs.readFileSync(result.backupPath, 'utf8'), original);
  const config = JSON.parse(fs.readFileSync(options.filePath, 'utf8'));
  assert.deepEqual(config.mcpServers['aios-search'], options.entry);
  assert.equal(Object.hasOwn(config.mcpServers['aios-search'], 'env'), false);
  assert.equal((await installServer({ ...options, expectedRevision: preview.revision })).status, 'stale-preview');
});

test('owned previews, including no desired entry, do not touch ledger verification timestamps', async (t) => {
  const options = fixture(t);
  await installServer(options);
  const file = path.join(options.ledgerDir, 'claude.json');
  const before = fs.readFileSync(file, 'utf8');
  const mtime = fs.statSync(file).mtimeMs;
  for (const entry of [options.entry, undefined]) {
    const preview = await installServer({ ...options, entry, dryRun: true });
    assert.equal(preview.status, 'unchanged');
    assert.equal(preview.dryRun, true);
    assert.match(preview.revision, /^[a-f0-9]{64}$/u);
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(fs.statSync(file).mtimeMs, mtime);
});

test('ledger-only changes invalidate a preview without touching config or creating backups', async (t) => {
  const options = fixture(t);
  const preview = await installServer({ ...options, dryRun: true });
  fs.mkdirSync(options.ledgerDir);
  fs.writeFileSync(path.join(options.ledgerDir, 'claude.json'), '{}\n');
  const result = await installServer({ ...options, expectedRevision: preview.revision });
  assert.equal(result.status, 'stale-preview');
  assert.equal(fs.existsSync(options.backupDir), false);
});

test('edits during asynchronous backup are detected before rename and are never overwritten', async (t) => {
  const options = fixture(t);
  const original = fs.readFileSync(options.filePath, 'utf8');
  const external = '{"external":"changed during backup","mcpServers":{}}\n';
  const writeFile = fs.promises.writeFile;
  t.mock.method(fs.promises, 'writeFile', async (file, ...rest) => {
    await writeFile.call(fs.promises, file, ...rest);
    if (String(file).endsWith('.bak')) fs.writeFileSync(options.filePath, external);
  });
  const preview = await installServer({ ...options, dryRun: true });
  const result = await installServer({ ...options, expectedRevision: preview.revision });
  assert.equal(result.status, 'stale-preview');
  assert.equal(fs.readFileSync(options.filePath, 'utf8'), external);
  assert.equal(fs.readFileSync(result.backupPath, 'utf8'), original);
  assert.equal(fs.existsSync(options.ledgerDir), false);
});

test('ledger write failure rolls back both an existing config and a newly created config', async (t) => {
  for (const fresh of [false, true]) {
    const options = fixture(t);
    const original = fs.readFileSync(options.filePath, 'utf8');
    if (fresh) fs.unlinkSync(options.filePath);
    const result = await installServer({ ...options, writeImpl: async () => { throw new Error('fake disk full'); } });
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, 'ledger-unavailable');
    assert.equal(result.rolledBack, fresh ? 'removed-created-file' : 'restored-from-backup');
    assert.equal(Boolean(result.backupPath), !fresh);
    if (fresh) assert.equal(fs.existsSync(options.filePath), false);
    else assert.equal(fs.readFileSync(options.filePath, 'utf8'), original);
  }
});

const exec = promisify(execFile);
const installUrl = new URL('../../../../lib/clients/mcp/install-policy.mjs', import.meta.url).href;
async function childInstall(options) {
  const source = `import { installServer } from ${JSON.stringify(installUrl)}; console.log(JSON.stringify(await installServer(JSON.parse(process.argv[1]))));`;
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', source, JSON.stringify(options)], {
    env: { ...process.env, HOME: path.dirname(options.filePath), AIOS_HOME: path.join(path.dirname(options.filePath), 'state') },
  });
  return JSON.parse(stdout);
}

test('separate cooperating processes serialize a consumed config+ledger revision', async (t) => {
  const options = fixture(t);
  const preview = await installServer({ ...options, dryRun: true });
  const results = await Promise.all([1, 2].map(() => childInstall({ ...options, expectedRevision: preview.revision })));
  assert.deepEqual(results.map((result) => result.status).sort(), ['installed', 'stale-preview']);
  assert.equal(fs.readdirSync(options.backupDir).length, 1);
});

test('separate configs sharing a client ledger do not lose one another\'s ownership records', async (t) => {
  const first = fixture(t);
  const second = { ...first, scope: 'project', serverName: 'second', filePath: path.join(path.dirname(first.filePath), 'project.json') };
  const results = await Promise.all([childInstall(first), childInstall(second)]);
  assert.deepEqual(results.map((result) => result.status), ['installed', 'installed']);
  const ledger = await readMcpLedger('claude', { ledgerDir: first.ledgerDir });
  assert.deepEqual(Object.keys(ledger.entries).sort(), ['home/aios-search', 'project/second']);
});

test('preview is read-only and a changed file rejects the consumed revision', async (t) => {
  const options = fixture(t);
  const original = fs.readFileSync(options.filePath, 'utf8');
  const preview = await installServer({ ...options, dryRun: true });
  assert.equal(preview.status, 'planned');
  assert.match(preview.revision, /^[a-f0-9]{64}$/u);
  assert.equal(fs.readFileSync(options.filePath, 'utf8'), original);
  assert.equal(fs.existsSync(options.ledgerDir), false);
  const external = '{"keep":"external edit","mcpServers":{}}\n';
  fs.writeFileSync(options.filePath, external);
  const rejected = await installServer({ ...options, expectedRevision: preview.revision });
  assert.equal(rejected.status, 'stale-preview');
  assert.equal(fs.readFileSync(options.filePath, 'utf8'), external);
  assert.equal(fs.existsSync(options.backupDir), false);
});

test('CLI add/list/doctor resolve the same private ledger from the supplied environment', async (t) => {
  const options = fixture(t);
  const root = path.dirname(options.filePath);
  const env = { HOME: root, AIOS_HOME: path.join(root, 'private-state') };
  const context = { homeDir: root, env, projectRoot: root, stdout: { write() {} } };
  const args = { client: 'claude', scope: 'home', file: options.filePath, json: true };
  const added = await runMcpCommand({ ...args, subcommand: 'add', name: options.serverName, entry: options.entry }, context);
  assert.equal(added.status, 'installed');
  const listed = await runMcpCommand({ ...args, subcommand: 'list' }, context);
  assert.equal(listed.landings[0].servers[0].ownership, 'owned');
  // Locate the actual path through doctor rather than relying on process.env defaults.
  const healthy = await runMcpCommand({ ...args, subcommand: 'doctor' }, context);
  const actual = healthy.ledger[0].path;
  assert.ok(actual.startsWith(env.AIOS_HOME + path.sep));
  assert.equal(healthy.ledger[0].missing, false);
  fs.writeFileSync(actual, '{not-json');
  const broken = await runMcpCommand({ ...args, subcommand: 'doctor' }, context);
  assert.notEqual(broken.exitCode, 0);
  assert.ok(broken.ledger[0].corrupt);
});

const externalConfig = '{"external":"must survive","mcpServers":{"other":{"command":"external"}}}\n';
for (const kind of ['existing', 'new', 'uninstall']) {
  test(`ledger failure preserves post-commit external edits: ${kind}`, async (t) => {
    const options = fixture(t);
    if (kind === 'new') fs.unlinkSync(options.filePath);
    if (kind === 'uninstall') assert.equal((await installServer(options)).status, 'installed');
    const operation = kind === 'uninstall' ? uninstallServer : installServer;
    const result = await operation({ ...options, writeImpl: async () => {
      fs.writeFileSync(options.filePath, externalConfig);
      throw new Error('injected ledger disk full');
    } });
    assert.equal(fs.readFileSync(options.filePath, 'utf8'), externalConfig);
    assert.equal(result.reason, 'ledger-unavailable');
    assert.equal(result.rolledBack, 'rollback-incomplete');
    assert.deepEqual(result.recovery, { reason: 'config-changed-after-commit', configPath: options.filePath, backupPath: result.backupPath });
    assert.match(result.message, /rollback incomplete/i);
    if (kind !== 'new') assert.ok(fs.existsSync(result.backupPath));
  });
}

test('rollback rechecks after preparing restore bytes, preserving a late external edit and backup', async (t) => {
  const options = fixture(t);
  const original = fs.readFileSync(options.filePath, 'utf8');
  const writeFile = fs.promises.writeFile;
  let writes = 0;
  t.mock.method(fs.promises, 'writeFile', async (file, ...args) => {
    await writeFile.call(fs.promises, file, ...args);
    if (String(file).endsWith('.tmp') && path.dirname(String(file)) === path.dirname(options.filePath) && ++writes === 2) {
      fs.writeFileSync(options.filePath, externalConfig);
    }
  });
  const result = await installServer({ ...options, writeImpl: async () => { throw new Error('disk full'); } });
  assert.equal(writes, 2, 'rollback must prepare a private temp, not copy over the live config');
  assert.equal(fs.readFileSync(options.filePath, 'utf8'), externalConfig);
  assert.equal(fs.readFileSync(result.backupPath, 'utf8'), original);
  assert.equal(result.rolledBack, 'rollback-incomplete');
  assert.equal(fs.readdirSync(path.dirname(options.filePath)).some((name) => name.endsWith('.tmp')), false);
});

for (const kind of ['existing-ledger', 'new-ledger', 'config-and-ledger']) {
  test(`ledger temp-write conflict preserves external records and compensates safely: ${kind}`, async (t) => {
    const options = fixture(t);
    const original = fs.readFileSync(options.filePath, 'utf8');
    const ledgerFile = path.join(options.ledgerDir, 'claude.json');
    const externalLedger = JSON.stringify({ schemaVersion: 1, clientId: 'claude', entries: { 'project/external': { fingerprint: 'f'.repeat(64) } } });
    if (kind !== 'new-ledger') { fs.mkdirSync(options.ledgerDir); fs.writeFileSync(ledgerFile, '{"schemaVersion":1,"entries":{}}'); }
    const writeFile = fs.promises.writeFile;
    let injected = false;
    t.mock.method(fs.promises, 'writeFile', async (file, ...args) => {
      await writeFile.call(fs.promises, file, ...args);
      if (path.dirname(String(file)) === options.ledgerDir && String(file).endsWith('.tmp')) {
        injected = true;
        fs.writeFileSync(ledgerFile, externalLedger);
        if (kind === 'config-and-ledger') fs.writeFileSync(options.filePath, externalConfig);
      }
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    const result = await installServer(options);
    assert.equal(injected, true);
    assert.equal(fs.readFileSync(ledgerFile, 'utf8'), externalLedger);
    assert.equal(result.status, 'conflict');
    assert.equal(result.reason, 'ledger-revision-changed');
    assert.equal(result.rolledBack, kind === 'config-and-ledger' ? 'rollback-incomplete' : 'restored-from-backup');
    assert.equal(fs.readFileSync(options.filePath, 'utf8'), kind === 'config-and-ledger' ? externalConfig : original);
    assert.deepEqual(fs.readdirSync(options.ledgerDir), ['claude.json']);
  });
}

test('a ledger read snapshot cannot save over an edit made before temp creation', async (t) => {
  const options = fixture(t);
  assert.equal((await installServer(options)).status, 'installed');
  const ledger = await readMcpLedger('claude', options);
  const file = path.join(options.ledgerDir, 'claude.json');
  const external = fs.readFileSync(file, 'utf8') + ' \n';
  fs.writeFileSync(file, external);
  await assert.rejects(writeMcpLedger('claude', ledger, options), { code: 'MCP_LEDGER_CHANGED' });
  assert.equal(fs.readFileSync(file, 'utf8'), external);
});

test('successful config and ledger renames do not clean up no-longer-owned temp names', async (t) => {
  const options = fixture(t);
  const rm = fs.promises.rm;
  t.mock.method(fs.promises, 'rm', async (file, ...args) => {
    if (String(file).endsWith('.tmp')) throw new Error('cleanup must not run after commit');
    return rm.call(fs.promises, file, ...args);
  });
  assert.equal((await installServer(options)).status, 'installed');
  assert.equal((await uninstallServer(options)).status, 'uninstalled');
});

test('all config backups are private and unique even in the same timestamp', async (t) => {
  const options = fixture(t);
  fs.chmodSync(options.filePath, 0o600);
  const mask = process.umask(0o022);
  t.after(() => process.umask(mask));
  t.mock.method(Date.prototype, 'toISOString', () => '2026-11-17T00:00:00.000Z');
  const added = await installServer(options);
  const restored = await installServer({ ...options, entry: { ...options.entry, args: ['/fake/v2.mjs'] }, restore: true });
  const removed = await uninstallServer(options);
  const backups = [added, restored, removed].map((result) => result.backupPath);
  assert.equal(new Set(backups).size, 3);
  for (const file of backups) assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

for (const symlink of [false, true]) {
  test(`backup collision never writes or chmods an unowned ${symlink ? 'symlink target' : 'file'}`, async (t) => {
    const options = fixture(t);
    const original = fs.readFileSync(options.filePath, 'utf8');
    const target = path.join(path.dirname(options.filePath), 'unowned');
    fs.writeFileSync(target, 'external private bytes', { mode: 0o644 });
    const mode = fs.statSync(target).mode;
    const writeFile = fs.promises.writeFile;
    let collision;
    t.mock.method(fs.promises, 'writeFile', async (file, ...args) => {
      if (String(file).endsWith('.bak')) {
        collision = String(file);
        if (symlink) fs.symlinkSync(target, file);
        else fs.copyFileSync(target, file);
      }
      return writeFile.call(fs.promises, file, ...args);
    });
    const result = await installServer(options);
    assert.equal(fs.readFileSync(symlink ? target : collision, 'utf8'), 'external private bytes');
    assert.equal(fs.statSync(symlink ? target : collision).mode, mode);
    assert.equal(result.status, 'rejected');
    assert.equal(fs.readFileSync(options.filePath, 'utf8'), original);
  });
}

function actionBridge(options) {
  const root = path.dirname(options.filePath);
  const input = { action: 'add', client: 'claude', scope: 'home', name: options.serverName, entry: options.entry };
  const revisions = [];
  const cli = (args, revision = '', stdout = { write() {} }) => runMcpCommand({ client: 'claude', scope: 'home', name: options.serverName,
    entry: options.entry, json: true, file: options.filePath, ledgerDir: options.ledgerDir, backupDir: options.backupDir, ...args,
  }, { homeDir: root, projectRoot: root, env: { HOME: root, AIOS_HOME: path.join(root, 'state'), AIOS_MCP_EXPECTED_REVISION: revision }, stdout });
  const api = createMcpActionService({ context: [root, 'actual-cli'],
    list: async () => ({ ok: true, data: { landings: [{ clientId: 'claude', scope: 'home' }] } }),
    run: async (argv, revision) => {
      revisions.push(revision);
      let stdout = '';
      const result = await cli({ subcommand: argv[1], entry: JSON.parse(argv[argv.indexOf('--entry') + 1]), dryRun: argv.includes('--dry-run') }, revision,
        { write(text) { stdout += text; } });
      return { exitCode: result.exitCode, stdout };
    },
  });
  return { api, cli, input, revisions };
}

test('action service uses the actual CLI revision contract and fresh approval after stale rejection', async (t) => {
  const options = fixture(t);
  const { api, input, revisions } = actionBridge(options);
  const first = await api.post({ ...input, dryRun: true });
  assert.equal(first.body.ok, true);
  const request = { ...input, confirm: true, previewId: first.body.preview.id };
  fs.writeFileSync(options.filePath, externalConfig);
  const stale = await api.post(request);
  assert.equal(stale.body.ok, false);
  assert.equal(stale.body.result.status, 'stale-preview');
  assert.equal((await api.post(request)).status, 409);
  const second = await api.post({ ...input, dryRun: true });
  const installed = await api.post({ ...input, confirm: true, previewId: second.body.preview.id });
  assert.equal(installed.body.ok, true);
  assert.match(revisions[1], /^[a-f0-9]{64}$/u);
  assert.equal(JSON.parse(fs.readFileSync(options.filePath, 'utf8')).external, 'must survive');
});

const invalidLedgers = [
  ['malformed', '{not-json\n'], ['future', '{"schemaVersion":2,"entries":{"home/old":{"provenance":"keep"}}}\n'],
  ['entries-array', '{"schemaVersion":1,"entries":[]}'],
  ...[null, [], 'unsupported', {}, { fingerprint: 'f'.repeat(64), rootKeysCreated: 'unsafe' }]
    .map((record, i) => [`record-${i}`, JSON.stringify({ schemaVersion: 1, entries: { 'home/old': record } })]),
];
function invalidFixture(t, bytes) {
  const options = fixture(t), file = path.join(options.ledgerDir, 'claude.json'), original = fs.readFileSync(options.filePath);
  fs.mkdirSync(options.ledgerDir); fs.writeFileSync(file, bytes);
  const unchanged = (config = original) => {
    assert.deepEqual(fs.readFileSync(file), Buffer.from(bytes));
    assert.deepEqual(fs.existsSync(options.filePath) ? fs.readFileSync(options.filePath) : null, config);
    assert.equal(fs.existsSync(options.backupDir), false);
    assert.deepEqual(fs.readdirSync(options.ledgerDir), ['claude.json']);
  };
  return { options, unchanged };
}
for (const [kind, bytes] of invalidLedgers) {
  test(`invalid ledger blocks policy previews and all config mutations: ${kind}`, async (t) => {
    const { options, unchanged } = invalidFixture(t, bytes);
    for (const present of [false, true, null]) {
      const config = present === null ? null : JSON.stringify({ keep: true, mcpServers: present ? { [options.serverName]: options.entry } : {} });
      if (config === null) fs.unlinkSync(options.filePath); else fs.writeFileSync(options.filePath, config);
      for (const dryRun of [true, false]) for (const flags of [{}, { adopt: true }, { restore: true, force: true }]) {
        for (const operation of [installServer, uninstallServer]) {
          const result = await operation({ ...options, ...flags, dryRun });
          unchanged(config === null ? null : Buffer.from(config));
          assert.equal(result.reason, 'ledger-invalid');
          assert.ok(['rejected', 'refused-external'].includes(result.status));
        }
      }
    }
  });
  test(`invalid ledger cannot be reset by ownership helpers or direct saves: ${kind}`, async (t) => {
    const { options, unchanged } = invalidFixture(t, bytes);
    const ledger = await readMcpLedger('claude', options);
    assert.ok(ledger.corrupt); assert.equal(ledger.missing, false);
    ledger.corrupt = ''; ledger.entries = {}; options.writeImpl = () => assert.fail('invalid ledger must not reach the writer');
    for (const save of [() => recordOwnership(options, options), () => releaseOwnership(options, options), () => touchVerified(options, options),
      () => writeMcpLedger('claude', ledger, options), () => writeMcpLedger('claude', { schemaVersion: 1, entries: {} }, options)]) {
      await assert.rejects(save(), { code: 'MCP_LEDGER_INVALID' }); unchanged();
    }
  });
  test(`actual API/CLI denies approval and unpreviewed writes, retains diagnostics: ${kind}`, async (t) => {
    const { options, unchanged } = invalidFixture(t, bytes), { api, cli, input } = actionBridge(options);
    const preview = await api.post({ ...input, dryRun: true });
    assert.equal(preview.body.ok, false); assert.equal(preview.body.preview, undefined);
    assert.equal(preview.body.result.reason, 'ledger-invalid');
    assert.equal((await api.post({ ...input, confirm: true })).status, 409);
    for (const subcommand of ['add', 'adopt', 'remove']) {
      const result = await cli({ subcommand, adopt: true, force: true });
      assert.notEqual(result.exitCode, 0); assert.equal(result.reason, 'ledger-invalid'); unchanged();
    }
    assert.ok((await cli({ subcommand: 'list' })).landings[0].ledgerCorrupt);
    const doctor = await cli({ subcommand: 'doctor' });
    assert.notEqual(doctor.exitCode, 0); assert.ok(doctor.ledger[0].corrupt); unchanged();
  });
}

test('direct saves reject unsupported in-memory payloads without replacing a valid ledger', async (t) => {
  const options = fixture(t); assert.equal((await installServer(options)).status, 'installed');
  const file = path.join(options.ledgerDir, 'claude.json'), original = fs.readFileSync(file);
  for (const ledger of [{ schemaVersion: 2, entries: {} }, { schemaVersion: 1, entries: [] }, { schemaVersion: 1, entries: { bad: [] } }]) {
    await assert.rejects(writeMcpLedger('claude', ledger, options), { code: 'MCP_LEDGER_INVALID' });
    assert.deepEqual(fs.readFileSync(file), original);
  }
});
