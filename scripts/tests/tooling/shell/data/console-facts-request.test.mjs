import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseDefaultRoot } from '../../../../../apps/shell/ui/src/lib/console-facts-request.mjs';

test('no registered workspaces falls back to the supplied root', () => {
  assert.equal(chooseDefaultRoot('D:\\install\\runtime'), 'D:\\install\\runtime');
});

test('the most recently active registered workspace wins', () => {
  const workspaces = [
    { path: 'D:\\old', lastActivityAt: '2026-01-01T00:00:00Z' },
    { path: 'E:\\coding\\active', lastActivityAt: '2026-11-23T00:00:00Z' },
    { path: 'E:\\coding\\newer-registered', registeredLastSeenAt: '2026-11-20T00:00:00Z' },
  ];
  assert.equal(chooseDefaultRoot('D:\\install\\runtime', workspaces), 'E:\\coding\\active');
});

test('missing and pathless entries never become the default root', () => {
  const workspaces = [
    { path: 'D:\\gone', missing: true, lastActivityAt: '2026-12-01T00:00:00Z' },
    { lastActivityAt: '2026-12-02T00:00:00Z' },
    { path: 'E:\\coding\\present', lastActivityAt: '2026-01-01T00:00:00Z' },
  ];
  assert.equal(chooseDefaultRoot('D:\\install\\runtime', workspaces), 'E:\\coding\\present');
});
