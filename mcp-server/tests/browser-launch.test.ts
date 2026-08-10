import test from 'node:test';
import assert from 'node:assert/strict';

import { tools } from '../src/browser/index.js';
import {
  BrowserLauncher,
  isUserDataDirLockedError,
  resolveLaunchHeadless,
  resolveRequireCdp,
} from '../src/browser/launcher.js';

test('resolveLaunchHeadless defaults to visible browser', () => {
  const result = resolveLaunchHeadless({}, { name: 'default' }, undefined);

  assert.equal(result.headless, false);
  assert.equal(result.visible, true);
  assert.equal(result.source, 'default-visible');
});

test('resolveLaunchHeadless prefers visible over headless when both are provided', () => {
  const result = resolveLaunchHeadless({ visible: true, headless: true }, { name: 'default' }, 'true');

  assert.equal(result.headless, false);
  assert.equal(result.visible, true);
  assert.equal(result.source, 'arg-visible');
});

test('browser_launch schema exposes visible toggle for agents', () => {
  const launchTool = tools.find((tool) => tool.name === 'browser_launch');

  assert.ok(launchTool);
  assert.equal(typeof launchTool?.description, 'string');
  assert.match(launchTool?.description ?? '', /visible|headful/i);
  assert.equal('visible' in ((launchTool?.inputSchema as any)?.properties ?? {}), true);
});

test('resolveRequireCdp prefers profile setting over environment', () => {
  assert.equal(resolveRequireCdp({ name: 'default', requireCdp: true }, 'false'), true);
  assert.equal(resolveRequireCdp({ name: 'default', requireCdp: false }, 'true'), false);
});

test('resolveRequireCdp falls back to environment flag when profile omits it', () => {
  assert.equal(resolveRequireCdp({ name: 'default' }, 'true'), true);
  assert.equal(resolveRequireCdp({ name: 'default' }, undefined), false);
});

test('isUserDataDirLockedError detects common chrome singleton lock messages', () => {
  assert.equal(
    isUserDataDirLockedError(new Error('Opening in existing browser session.')),
    true
  );
  assert.equal(
    isUserDataDirLockedError(new Error('Profile appears to be in use by another process.')),
    true
  );
  assert.equal(
    isUserDataDirLockedError(new Error('ProcessSingleton: could not create lock file')),
    true
  );
  assert.equal(
    isUserDataDirLockedError(new Error('正在现有的浏览器会话中打开。')),
    true
  );
});

test('isUserDataDirLockedError ignores unrelated launch errors', () => {
  assert.equal(
    isUserDataDirLockedError(new Error('connect ECONNREFUSED 127.0.0.1:9222')),
    false
  );
  assert.equal(
    isUserDataDirLockedError(new Error('net::ERR_NAME_NOT_RESOLVED')),
    false
  );
});

test('BrowserLauncher closes stale profiles and removes them from state', async () => {
  const launcher = new BrowserLauncher();
  const closed: string[] = [];
  const fakeState = {
    browser: {
      close: async () => { closed.push('browser'); },
      isConnected: () => true,
    },
    context: {
      close: async () => { closed.push('context'); },
    },
    pages: new Map(),
    activePageId: null,
    connectedOverCdp: false,
    isolated: false,
    lastUsedAt: 1_000,
  };
  (launcher as any).state.set('stale', fakeState);

  const profiles = await launcher.closeIdle(500, 2_000);

  assert.deepEqual(profiles, ['stale']);
  assert.deepEqual(closed, ['context', 'browser']);
  assert.equal(launcher.getState('stale'), undefined);
});

test('BrowserLauncher removes profile state when a close step fails', async () => {
  const launcher = new BrowserLauncher();
  let browserCloseAttempted = false;
  const fakeState = {
    browser: {
      close: async () => { browserCloseAttempted = true; },
      isConnected: () => true,
    },
    context: {
      close: async () => { throw new Error('context close failed'); },
    },
    pages: new Map(),
    activePageId: null,
    connectedOverCdp: false,
    isolated: false,
    lastUsedAt: 1_000,
  };
  (launcher as any).state.set('broken', fakeState);

  await assert.rejects(launcher.close('broken'), /context close failed/u);

  assert.equal(browserCloseAttempted, true);
  assert.equal(launcher.getState('broken'), undefined);
});
