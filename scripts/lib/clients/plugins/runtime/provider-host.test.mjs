import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { accountRef, callProviderHost, ProviderHostError } from './provider-host.mjs';

function fakeChild({ reply, failExit } = {}) {
  const child = new EventEmitter();
  child.stdin = { write() {}, end() {} };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  process.nextTick(() => {
    if (failExit) child.emit('exit', 1);
    else child.stdout.emit('data', Buffer.from(`${JSON.stringify(reply)}\n`));
  });
  return child;
}

test('G2: 子进程 JSON-RPC 往返', async () => {
  const result = await callProviderHost({
    entry: '/fake/plugin.mjs',
    method: 'models',
    spawnImpl: () => fakeChild({ reply: { ok: true, models: ['a', 'b'] } }),
  });
  assert.deepEqual(result, { ok: true, models: ['a', 'b'] });
});

test('G2: 子进程崩溃 → ProviderHostError', async () => {
  await assert.rejects(
    callProviderHost({ entry: '/fake', method: 'models', spawnImpl: () => fakeChild({ failExit: true }) }),
    ProviderHostError,
  );
});

test('G2: 反射令牌稳定且不泄漏 email', () => {
  const a = accountRef('plugin-1', 'user@example.com');
  const b = accountRef('plugin-1', 'user@example.com');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{32}$/u);
  assert.ok(!a.includes('example'));
  assert.notEqual(accountRef('plugin-1', 'user@example.com'), accountRef('plugin-2', 'user@example.com'));
});
