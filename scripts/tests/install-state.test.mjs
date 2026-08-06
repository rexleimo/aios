// scripts/tests/install-state.test.mjs — install-state 幂等 marker 单元测试
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { markComponentCompleted, readInstallState, writeInstallState } from '../lib/lifecycle/install-state.mjs';

function makeTemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('readInstallState returns empty state when no marker exists', () => {
  const root = makeTemp('install-state-empty-');
  const { statePath, completed } = readInstallState(root);
  assert.ok(statePath.endsWith(path.join('.aios', 'install-state.json')));
  assert.equal(completed.size, 0);
});

test('write then read round-trips completed components', () => {
  const root = makeTemp('install-state-roundtrip-');
  const { statePath, completed } = readInstallState(root);
  writeInstallState(statePath, new Set(['browser', 'skills']));
  const reread = readInstallState(root);
  assert.deepEqual([...reread.completed].sort(), ['browser', 'skills']);
});

test('markComponentCompleted appends without losing prior entries', () => {
  const root = makeTemp('install-state-mark-');
  const { statePath, completed } = readInstallState(root);
  markComponentCompleted(statePath, completed, 'browser');
  markComponentCompleted(statePath, completed, 'shell');
  const reread = readInstallState(root);
  assert.deepEqual([...reread.completed].sort(), ['browser', 'shell']);
});

test('corrupt marker file degrades to empty state', () => {
  const root = makeTemp('install-state-corrupt-');
  const { statePath } = readInstallState(root);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, '{not json', 'utf8');
  const { completed } = readInstallState(root);
  assert.equal(completed.size, 0);
});
