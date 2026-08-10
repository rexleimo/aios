import test from 'node:test';
import assert from 'node:assert/strict';

import { tools } from '../src/browser/index.js';
import { buildBrowserHealth } from '../src/browser/health.js';
import type { ProfileState } from '../src/browser/types.js';

test('browser_health is exposed without requiring a browser launch', () => {
  const healthTool = tools.find((tool) => tool.name === 'browser_health');

  assert.ok(healthTool);
  assert.match(healthTool?.description ?? '', /health/i);
});

test('buildBrowserHealth reports configured profiles and running state', () => {
  const state = {
    browser: {
      isConnected: () => true,
    },
    connectedOverCdp: true,
    launchMode: 'cdp',
  } as unknown as ProfileState;

  const result = buildBrowserHealth({
    platform: 'win32',
    nodeVersion: 'v24.0.0',
    workspaceRoot: 'E:/coding/aios',
    profiles: [
      ['default', {
        name: 'default',
        cdpPort: 9222,
        userDataDir: '.browser-profiles/default',
      }],
    ],
    states: new Map([['default', state]]),
  });

  assert.equal(result.ok, true);
  assert.equal(result.browserReady, true);
  assert.equal(result.runtime.platform, 'win32');
  assert.equal(result.profiles[0].cdpEndpoint, 'http://127.0.0.1:9222');
  assert.equal(result.profiles[0].connectedOverCdp, true);
  assert.equal(result.profiles[0].launchMode, 'cdp');
  assert.deepEqual(result.recommendations, []);
});

test('buildBrowserHealth recommends launching an unavailable CDP profile', () => {
  const result = buildBrowserHealth({
    profiles: [['default', { name: 'default', cdpUrl: 'http://127.0.0.1:9222' }]],
  });

  assert.equal(result.browserReady, false);
  assert.match(result.recommendations.join('\n'), /CDP profile/i);
});
