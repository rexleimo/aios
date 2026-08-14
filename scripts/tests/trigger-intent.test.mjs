import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent } from '../lib/contextdb/trigger/intent.mjs';

test('detects recall keywords', () => {
  const r = detectIntent('Do you remember what we did last time?');
  assert.equal(r.shouldLoad, true);
  assert.equal(r.reason, 'intent:recall');
});

test('detects Chinese continuation intent', () => {
  const r = detectIntent('继续工作');
  assert.equal(r.shouldLoad, true);
  assert.equal(r.reason, 'intent:continuation');
});

test('detects extra continuation and recall phrases', () => {
  assert.equal(detectIntent('接着改登录逻辑').reason, 'intent:continuation');
  assert.equal(detectIntent('往下做').reason, 'intent:continuation');
  assert.equal(detectIntent('keep going with the patch').reason, 'intent:continuation');
  assert.equal(detectIntent('刚才说的那个方案').reason, 'intent:recall');
  assert.equal(detectIntent('我们讨论过验收标准').reason, 'intent:recall');
});

test('detects reference intent', () => {
  const r = detectIntent('Update the file we edited yesterday');
  assert.equal(r.shouldLoad, true);
  assert.equal(r.reason, 'intent:reference');
});

test('detects meta memory intent', () => {
  const r = detectIntent('Show me my session history');
  assert.equal(r.shouldLoad, true);
  assert.equal(r.reason, 'intent:meta');
});

test('ignores neutral prompts', () => {
  const r = detectIntent('Write a hello world script');
  assert.equal(r.shouldLoad, false);
  assert.equal(r.reason, 'intent:none');
});

test('negative intent suppresses load', () => {
  const r = detectIntent('Start from scratch, ignore history');
  assert.equal(r.shouldLoad, false);
  assert.equal(r.reason, 'intent:negative');
});
