import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveSetupGuide } from '../../../../../apps/shell/ui/src/lib/gateway-setup-guide.mjs';

const status = (patch = {}) => ({
  running: false, managed: true, stale: false, ready: false,
  configuredModelCount: 0, port: 49171,
  clients: [{ client: 'claude', connected: false }, { client: 'codex', connected: false }],
  ...patch,
});

const stateOf = (guide, key) => guide.steps.find((step) => step.key === key).state;

test('guide steps are in dependency order: start, models, connect', () => {
  const guide = deriveSetupGuide(status());
  assert.deepEqual(guide.steps.map((step) => step.key), ['start', 'models', 'connect']);
});

test('pending read shows a loading action without claiming any state', () => {
  const guide = deriveSetupGuide(null, { pending: true });
  assert.equal(guide.kind, 'loading');
  assert.equal(guide.nextAction.label, '读取状态中');
  assert.ok(guide.steps.every((step) => step.state === 'todo'), 'nothing is claimed done before the read resolves');
});

test('cold start guides to start the gateway first', () => {
  const guide = deriveSetupGuide(status());
  assert.equal(guide.kind, 'start');
  assert.equal(guide.nextAction.label, '立即启动网关');
  assert.equal(stateOf(guide, 'start'), 'next');
  assert.equal(stateOf(guide, 'models'), 'todo');
  assert.equal(stateOf(guide, 'connect'), 'todo');
});

test('running but no configured models guides to providers', () => {
  const guide = deriveSetupGuide(status({ running: true, ready: false, configuredModelCount: 0 }));
  assert.equal(guide.kind, 'providers');
  assert.equal(stateOf(guide, 'start'), 'done');
  assert.equal(stateOf(guide, 'models'), 'next');
  assert.equal(stateOf(guide, 'connect'), 'todo');
});

test('models saved but not loaded (e.g. missing credentials) still points to providers, not connect', () => {
  const guide = deriveSetupGuide(status({ running: true, ready: false, code: 'PROVIDER_CREDENTIALS_MISSING', configuredModelCount: 1 }));
  assert.equal(guide.kind, 'providers');
  assert.equal(guide.nextAction.label, '配置模型来源');
  assert.match(guide.steps.find((step) => step.key === 'models').detail, /尚未加载/u);
  assert.equal(stateOf(guide, 'connect'), 'todo', 'never connect clients before the gateway can route');
});

test('ready with loaded models but no clients guides to connection', () => {
  const guide = deriveSetupGuide(status({ running: true, ready: true, configuredModelCount: 2 }));
  assert.equal(guide.kind, 'connect');
  assert.equal(guide.nextAction.label, '接入第一个客户端');
  assert.equal(stateOf(guide, 'start'), 'done');
  assert.equal(stateOf(guide, 'models'), 'done');
  assert.equal(stateOf(guide, 'connect'), 'next');
});

test('everything loaded and connected reports ready with all steps done', () => {
  const guide = deriveSetupGuide(status({
    running: true, ready: true, configuredModelCount: 2,
    clients: [{ client: 'claude', connected: true }, { client: 'codex', connected: false }],
  }));
  assert.equal(guide.kind, 'ready');
  assert.equal(guide.nextAction.label, '');
  assert.ok(guide.steps.every((step) => step.state === 'done'));
  assert.equal(guide.connected, 1);
});

test('stale process is treated as not running, so the guide does not claim the gateway is up', () => {
  const guide = deriveSetupGuide(status({ running: true, stale: true, ready: true, configuredModelCount: 1 }));
  assert.equal(guide.kind, 'start');
  assert.equal(guide.nextAction.label, '立即启动网关');
  assert.equal(stateOf(guide, 'start'), 'next');
});
