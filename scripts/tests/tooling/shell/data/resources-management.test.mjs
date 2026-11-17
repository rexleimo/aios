import assert from 'node:assert/strict';
import test from 'node:test';
import { buildManagementArgv, executeManagement, loadManagementResource } from '../../../../../apps/shell/ui/src/lib/data/management.mjs';

const inventory = { ok: true, schema: 'skill.inventory.v1', clients: [{ id: 'claude' }, { id: 'pi' }], skills: [], available: [], warnings: [] };
const revision = 'a'.repeat(64);
const request = { resource: 'skills', action: 'install', name: 'hello', kind: 'external', scope: 'global', clients: ['claude'], source: '/fixture/hello' };
function injected(responses = []) {
  const calls = [];
  return { calls, options: { rootDir: '/fixture', cliImpl: '/fixture/cli.mjs', runImpl: async (_node, argv) => {
    calls.push(argv.slice(1));
    const response = responses.shift() ?? inventory;
    if (response instanceof Error) throw response;
    return { stdout: JSON.stringify(response), stderr: '' };
  } } };
}

test('resource reads are closed CLI mappings, with unknown resources rejected before execution', async () => {
  const { calls, options } = injected();
  for (const resource of ['skills', 'agents', 'integrations']) await loadManagementResource(resource, options);
  assert.equal(loadManagementResource('--live', options), null);
  assert.deepEqual(calls, [['skill', 'list', '--json'], ['agents', 'list', '--json'], ['integration', 'list', '--json']]);
});

test('agent doctor is read-only and independent of skill inventory or client selection; no CRUD/live actions', async () => {
  const { calls, options } = injected([{ kind: 'aios.agent-catalogue.v1', strict: { blocked: true }, agents: [] }]);
  const result = await executeManagement({ resource: 'agents', action: 'doctor', argv: ['smoke', '--live'] }, options);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.strict.blocked, true);
  assert.deepEqual(calls, [['agents', 'doctor', '--json']]);
  for (const action of ['install', 'sync', 'remove', 'probe', 'smoke', 'custom']) {
    assert.equal((await executeManagement({ resource: 'agents', action }, options)).status, 400);
  }
  assert.equal(calls.length, 1);
});

test('a nonzero doctor exit with valid blocked JSON is not a transport failure', async () => {
  const report = { kind: 'aios.agent-catalogue.v1', strict: { blocked: true }, agents: [] };
  const blocked = injected([Object.assign(new Error('fixture blocked verdict'), { code: 1, stdout: JSON.stringify(report), stderr: '' })]);
  const result = await executeManagement({ resource: 'agents', action: 'doctor' }, blocked.options);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.exitCode, 1);
  assert.deepEqual(result.body.data, report);
  assert.deepEqual(blocked.calls, [['agents', 'doctor', '--json']]);
  const unreadable = injected([Object.assign(new Error('fixture unreadable output'), { code: 1, stdout: 'not JSON', stderr: '' })]);
  const failed = await executeManagement({ resource: 'agents', action: 'doctor' }, unreadable.options);
  assert.equal(failed.status, 502);
  assert.equal(failed.body.ok, false);
});

test('all skill writes require confirmation and a valid preview revision before any action command', async () => {
  for (const action of ['install', 'sync', 'remove']) {
    const { calls, options } = injected();
    assert.equal((await executeManagement({ ...request, action }, options)).status, 409);
    assert.equal((await executeManagement({ ...request, action, confirm: true }, options)).body.error, 'preview-required');
    for (const expectedRevision of ['', 'old', true, '../escape']) {
      assert.equal((await executeManagement({ ...request, action, confirm: true, expectedRevision }, options)).status, 400);
    }
    assert.ok(calls.every(argv => argv[1] === 'list'));
    await executeManagement({ ...request, action, dryRun: true }, options);
    assert.ok(calls.at(-1).includes('--dry-run'));
    await executeManagement({ ...request, action, confirm: true, expectedRevision: revision }, options);
    assert.deepEqual(calls.at(-1), ['skill', action, 'hello', '--client', 'claude', '--scope', 'global', '--kind', 'external', '--json', '--source', '/fixture/hello', '--expected-revision', revision]);
  }
});

test('invalid targets, names and flag-looking sources cannot become arbitrary argv', () => {
  for (const patch of [{ clients: [] }, { clients: ['unknown'] }, { name: '../escape' }, { kind: 'custom' }, { scope: 'all' }, { source: '--live' }, { action: 'exec' }]) {
    assert.ok(buildManagementArgv({ ...request, ...patch }, inventory).error);
  }
  assert.deepEqual(buildManagementArgv({ ...request, clients: ['claude', 'claude', 'pi'], argv: ['--force'], dryRun: true }, inventory).argv,
    ['skill', 'install', 'hello', '--client', 'claude,pi', '--scope', 'global', '--kind', 'external', '--json', '--source', '/fixture/hello', '--dry-run']);
});

test('inventory failure blocks writes and domain stale-preview verdicts survive the transport envelope', async () => {
  const failed = injected([{ ok: false, error: 'inventory unavailable' }]);
  assert.equal((await executeManagement({ ...request, confirm: true, expectedRevision: revision }, failed.options)).status, 502);
  assert.equal(failed.calls.length, 1);
  const stale = injected([inventory, { ok: false, error: 'preview-stale', revision: 'b'.repeat(64), results: [] }]);
  const result = await executeManagement({ ...request, confirm: true, expectedRevision: revision }, stale.options);
  assert.equal(result.body.ok, true, 'valid JSON is transport success, not action success');
  assert.equal(result.body.data.ok, false);
  assert.equal(result.body.data.error, 'preview-stale');
});
