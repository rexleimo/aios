import assert from 'node:assert/strict';
import test from 'node:test';

import { interpolate } from '../src/i18n/interpolate.mjs';

test('fills every named token from values', () => {
  assert.equal(
    interpolate('数据 {seconds}s 前', { seconds: 5 }),
    '数据 5s 前',
  );
  assert.equal(
    interpolate('读回 {read} / 共 {total} 条记忆', { read: 3, total: 9 }),
    '读回 3 / 共 9 条记忆',
  );
});

test('leaves unknown tokens intact and is idempotent', () => {
  assert.equal(interpolate('会话 {count} 条（{skipped} 未计入）', { count: 4 }), '会话 4 条（{skipped} 未计入）');
  const done = interpolate('读回 {read} 条', { read: 3 });
  assert.equal(interpolate(done, { read: 3 }), done);
});

test('no values means the message is returned unchanged', () => {
  assert.equal(interpolate('正在读取…'), '正在读取…');
});
