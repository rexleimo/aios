// runtime 测试：Result 契约 + fail-open + 能力受限。
import assert from 'node:assert/strict';
import test from 'node:test';

import { runHookFailOpen, runHookInSandbox } from './runtime.mjs';

test('G1: 正常 hook 返回 ok(value)，clone 后非原对象引用', () => {
  const source = 'function onRequest(body){ return {model: body.model, tagged: true}; }';
  const r = runHookInSandbox({ source, hook: 'onRequest', args: [{ model: 'fast' }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { model: 'fast', tagged: true });
});

test('G1: hook 拿不到 fetch / setTimeout / require / process / Buffer', () => {
  for (const forbidden of ['fetch', 'setTimeout', 'require', 'process', 'Buffer']) {
    const source = `function onRequest(){ return typeof ${forbidden}; }`;
    const r = runHookInSandbox({ source, hook: 'onRequest', args: [] });
    assert.equal(r.ok, true);
    assert.equal(r.value, 'undefined', `${forbidden} should be unavailable`);
  }
});

test('G1: hook 抛错 → Result err（不抛异常）', () => {
  const source = 'function onRequest(){ throw new Error("boom"); }';
  const r = runHookInSandbox({ source, hook: 'onRequest', args: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /threw/iu);
});

test('G1: fail-open 包装——错误时返回 fallback 且标记 failed', () => {
  const fallback = { model: 'original' };
  const r = runHookFailOpen({ source: 'function onRequest(){ throw new Error("x"); }', hook: 'onRequest', args: [] }, fallback);
  assert.deepEqual(r.value, fallback);
  assert.equal(r.failed, true);
  assert.match(r.reason, /threw/iu);
});

test('G1: fail-open——正常时不标记 failed', () => {
  const r = runHookFailOpen({ source: 'function onRequest(b){ return b; }', hook: 'onRequest', args: [{ model: 'x' }] }, { model: 'fallback' });
  assert.equal(r.failed, false);
  assert.deepEqual(r.value, { model: 'x' });
});
