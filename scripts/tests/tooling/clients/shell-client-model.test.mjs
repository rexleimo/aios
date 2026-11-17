import assert from 'node:assert/strict';
import test from 'node:test';
import { clientFailure, clientTargetOptions, connectionMutationBlocked, connectionSummary, installationSummary, updateCommandLabel, updatePreviewSupported } from '../../../../apps/shell/ui/src/components/console/clients/client-management-model.mjs';

test('Agent installation state is independent of configuration landings and probe success', () => {
  assert.match(installationSummary({ installed: null }), /读取异常，不代表未安装/u);
  assert.match(installationSummary({ installed: false }), /PATH 中未检测到/u);
  assert.match(installationSummary({ installed: true, versionStatus: 'failed' }), /已检测到程序 · 版本探测失败/u);
  assert.match(installationSummary({ installed: true, versionStatus: 'unsupported' }), /尚不支持版本探测/u);
  assert.ok(installationSummary({ installed: true, version: '1.2.3' }).includes('1.2.3'));
});

test('Agent target options serialize concrete prefix collisions and filter unusable groups', () => {
  const payload = { models: ['auto', 'group:x', 'model:a/b'].map(id => ({ id, label: id })),
    modelBindings: ['auto', 'group:x', 'model:a/b', 'paused'].map(id => ({ id })),
    editable: { routingGroups: [
      { id: 'a/b', models: ['paused', 'auto'], routing: 'ordered' },
      { id: 'legacy', models: ['group:x'], routing: 'smart' },
      { id: 'weight', models: ['auto'], routing: 'weight' },
      { id: 'missing', models: ['gone', 'auto'], routing: 'ordered' },
      { id: 'paused', models: ['paused'], routing: 'ordered' },
      { id: 'disabled', models: ['auto'], routing: 'ordered', enabled: false },
    ] } };
  assert.deepEqual(clientTargetOptions(payload).map(option => option.value),
    ['auto', 'model:auto', 'model:group%3Ax', 'model:model%3Aa%2Fb', 'group:a%2Fb', 'group:legacy']);
  assert.throws(() => clientTargetOptions({}), /目录返回格式/u);
});

test('update confirmation requires the exact supported preview and displays structured argv', () => {
  const preview = { supported: true, revision: 'a'.repeat(64), command: { file: '/fixture/bin/npm', args: ['install', '-g', '@openai/codex'] } };
  assert.equal(updatePreviewSupported(preview), true);
  assert.equal(updateCommandLabel(preview), [preview.command.file, ...preview.command.args].map(arg => JSON.stringify(arg)).join(' '));
  for (const invalid of [{ ...preview, revision: '' }, { ...preview, supported: false }, { ...preview, command: 'npm install -g' }]) {
    assert.equal(updatePreviewSupported(invalid), false);
    assert.equal(updateCommandLabel(invalid).includes('[object Object]'), false);
  }
});

test('structured API errors remain readable, including HTTP-200 failure envelopes', () => {
  assert.equal(clientFailure({ ok: false, error: { code: 'STALE_REVISION', message: 'installation changed' } }), 'installation changed');
  assert.equal(clientFailure({ error: 'gateway-changed', detail: 'refresh status' }), 'refresh status');
  assert.equal(clientFailure({ error: {} }, 'unknown'), 'unknown');
});

test('connection readback, ownership and recovery never collapse into disconnected', () => {
  for (const status of ['drift', 'unreadable', 'malformed', 'unknown', 'partial']) {
    const client = { connected: false, readback: { status } };
    assert.notEqual(connectionSummary(client), '未接入');
    assert.equal(connectionMutationBlocked(client), true);
  }
  assert.match(connectionSummary({ connected: true, readback: { status: 'drift' } }), /仍观察到网关配置/u);
  assert.match(connectionSummary({ connected: true, mode: 'inplace' }), /配置已接入/u);
  assert.equal(connectionMutationBlocked({ connected: false, readback: { status: 'missing' }, ownership: { status: 'unowned' } }), false);
  assert.equal(connectionMutationBlocked({ connected: true, ownership: { status: 'unknown' } }), true);
});
