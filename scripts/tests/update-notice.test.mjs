import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkForUpdate,
  readNoticeState,
  dismissUpdateNotice,
  renderUpdateNotice,
  parseSemver,
  compareSemver,
  versionChannel,
  resolveUpdateAction,
  readCurrentVersion,
  UPDATE_STATES,
  DEFAULT_POLICY,
} from '../lib/lifecycle/update-notice.mjs';

async function withWorkspace(prefix, fn) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const aiosRoot = path.join(workspaceRoot, 'aios-install');
  await fs.mkdir(aiosRoot, { recursive: true });
  await fs.writeFile(path.join(aiosRoot, 'VERSION'), '5.7.0\n', 'utf8');
  try {
    await fn(workspaceRoot, aiosRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

// ── Semver utilities ──

test('parseSemver: parses plain version', () => {
  const v = parseSemver('5.7.0');
  assert.equal(v.major, 5);
  assert.equal(v.minor, 7);
  assert.equal(v.patch, 0);
  assert.equal(v.prerelease, '');
});

test('parseSemver: parses prerelease', () => {
  const v = parseSemver('5.8.0-beta.1');
  assert.equal(v.prerelease, 'beta.1');
});

test('parseSemver: rejects garbage', () => {
  assert.equal(parseSemver('not-a-version'), null);
  assert.equal(parseSemver(''), null);
});

test('compareSemver: detects major/minor/patch/equal/older', () => {
  assert.equal(compareSemver('5.7.0', '6.0.0'), 'major');
  assert.equal(compareSemver('5.7.0', '5.8.0'), 'minor');
  assert.equal(compareSemver('5.7.0', '5.7.1'), 'patch');
  assert.equal(compareSemver('5.7.0', '5.7.0'), 'equal');
  assert.equal(compareSemver('5.7.1', '5.7.0'), 'older');
  assert.equal(compareSemver('5.7.0-beta.1', '5.7.0'), 'patch');
});

test('versionChannel: classifies channels', () => {
  assert.equal(versionChannel('5.7.0'), 'stable');
  assert.equal(versionChannel('5.8.0-beta.1'), 'beta');
  assert.equal(versionChannel('5.9.0-dev.3'), 'dev');
});

test('resolveUpdateAction: policy per bump kind', () => {
  assert.equal(resolveUpdateAction('major'), 'notify_only');
  assert.equal(resolveUpdateAction('minor'), 'confirm');
  assert.equal(resolveUpdateAction('patch'), 'notify_only');
  assert.equal(resolveUpdateAction('patch', { ...DEFAULT_POLICY, patch: 'notify_auto_install' }), 'auto_install_eligible');
  assert.equal(resolveUpdateAction('minor', { ...DEFAULT_POLICY, minor: 'notify' }), 'notify_only');
});

// ── checkForUpdate ──

test('checkForUpdate: up to date', async () => {
  await withWorkspace('aios-update-uptodate-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => ({ version: '5.7.0', security: false }),
    });
    assert.equal(notice.status, UPDATE_STATES.UP_TO_DATE);
    assert.equal(notice.shouldNotify, false);
  });
});

test('checkForUpdate: patch update allowed', async () => {
  await withWorkspace('aios-update-patch-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => ({ version: '5.7.1', security: false }),
    });
    assert.equal(notice.status, UPDATE_STATES.ALLOWED);
    assert.equal(notice.bumpKind, 'patch');
    assert.equal(notice.shouldNotify, true);
  });
});

test('checkForUpdate: minor update requires confirmation', async () => {
  await withWorkspace('aios-update-minor-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => ({ version: '5.8.0', security: false }),
    });
    assert.equal(notice.status, UPDATE_STATES.ALLOWED);
    assert.equal(notice.action, 'confirm');
  });
});

test('checkForUpdate: major update is notify-only', async () => {
  await withWorkspace('aios-update-major-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => ({ version: '6.0.0', security: false }),
    });
    assert.equal(notice.status, UPDATE_STATES.ALLOWED);
    assert.equal(notice.action, 'notify_only');
  });
});

test('checkForUpdate: beta build blocked without opt-in', async () => {
  await withWorkspace('aios-update-beta-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => ({ version: '5.8.0-beta.2', security: false }),
    });
    assert.equal(notice.status, UPDATE_STATES.BLOCKED);
    assert.ok(notice.reason.includes('beta'));
  });
});

test('checkForUpdate: beta allowed when channel opted in', async () => {
  await withWorkspace('aios-update-beta-optin-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => ({ version: '5.8.0-beta.2', security: false }),
      policy: { ...DEFAULT_POLICY, channel: 'beta', betaOptIn: true },
    });
    assert.equal(notice.status, UPDATE_STATES.ALLOWED);
  });
});

test('checkForUpdate: local newer than latest -> incompatible', async () => {
  await withWorkspace('aios-update-newer-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => ({ version: '5.6.0', security: false }),
    });
    assert.equal(notice.status, UPDATE_STATES.INCOMPATIBLE);
  });
});

test('checkForUpdate: fetch failure -> check_failed, no block', async () => {
  await withWorkspace('aios-update-fail-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => { throw new Error('network down'); },
    });
    assert.equal(notice.status, UPDATE_STATES.CHECK_FAILED);
    assert.ok(notice.reason.includes('network down'));
  });
});

test('checkForUpdate: no fetcher -> check_failed', async () => {
  await withWorkspace('aios-update-nofetch-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({ aiosRoot, rootDir });
    assert.equal(notice.status, UPDATE_STATES.CHECK_FAILED);
  });
});

test('checkForUpdate: dirty worktree blocks auto-install', async () => {
  await withWorkspace('aios-update-dirty-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => ({ version: '5.7.1', security: false }),
      policy: { ...DEFAULT_POLICY, patch: 'notify_auto_install' },
      workspace: { dirty: true, activeTask: false },
    });
    assert.equal(notice.status, UPDATE_STATES.BLOCKED);
    assert.equal(notice.action, 'notify_only');
    assert.ok(notice.blockers.some((b) => b.includes('uncommitted')));
  });
});

test('checkForUpdate: active task blocks auto-install', async () => {
  await withWorkspace('aios-update-active-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot,
      rootDir,
      fetchLatest: async () => ({ version: '5.7.1', security: false }),
      policy: { ...DEFAULT_POLICY, patch: 'notify_auto_install' },
      workspace: { dirty: false, activeTask: true },
    });
    assert.equal(notice.status, UPDATE_STATES.BLOCKED);
    assert.ok(notice.blockers.some((b) => b.includes('task')));
  });
});

test('checkForUpdate: notification dedup — same version notified once', async () => {
  await withWorkspace('aios-update-dedup-', async (rootDir, aiosRoot) => {
    const fetchLatest = async () => ({ version: '5.7.1', security: false });

    const first = await checkForUpdate({ aiosRoot, rootDir, fetchLatest });
    assert.equal(first.shouldNotify, true);

    const second = await checkForUpdate({ aiosRoot, rootDir, fetchLatest });
    assert.equal(second.shouldNotify, false);
    assert.equal(second.status, UPDATE_STATES.AVAILABLE);
    assert.ok(second.reason.includes('already notified'));
  });
});

test('checkForUpdate: new version re-notifies', async () => {
  await withWorkspace('aios-update-renotify-', async (rootDir, aiosRoot) => {
    const first = await checkForUpdate({
      aiosRoot, rootDir,
      fetchLatest: async () => ({ version: '5.7.1', security: false }),
    });
    assert.equal(first.shouldNotify, true);

    const second = await checkForUpdate({
      aiosRoot, rootDir,
      fetchLatest: async () => ({ version: '5.7.2', security: false }),
    });
    assert.equal(second.shouldNotify, true);
  });
});

test('checkForUpdate: dismissed version suppressed', async () => {
  await withWorkspace('aios-update-dismiss-', async (rootDir, aiosRoot) => {
    await dismissUpdateNotice(rootDir, '5.7.1');

    const notice = await checkForUpdate({
      aiosRoot, rootDir,
      fetchLatest: async () => ({ version: '5.7.1', security: false }),
    });
    assert.equal(notice.shouldNotify, false);
    assert.ok(notice.reason.includes('dismissed'));
  });
});

test('checkForUpdate: security update overrides dismissal', async () => {
  await withWorkspace('aios-update-security-', async (rootDir, aiosRoot) => {
    await dismissUpdateNotice(rootDir, '5.7.1');

    const notice = await checkForUpdate({
      aiosRoot, rootDir,
      fetchLatest: async () => ({ version: '5.7.1', security: true }),
    });
    assert.equal(notice.shouldNotify, true);
    assert.equal(notice.security, true);
  });
});

test('checkForUpdate: cooldown expiry re-notifies', async () => {
  await withWorkspace('aios-update-cooldown-', async (rootDir, aiosRoot) => {
    const fetchLatest = async () => ({ version: '5.7.1', security: false });
    const t0 = new Date('2026-08-01T00:00:00Z');

    const first = await checkForUpdate({ aiosRoot, rootDir, fetchLatest, now: t0 });
    assert.equal(first.shouldNotify, true);

    // Within cooldown
    const soon = await checkForUpdate({
      aiosRoot, rootDir, fetchLatest,
      now: new Date('2026-08-01T12:00:00Z'),
    });
    assert.equal(soon.shouldNotify, false);

    // After cooldown (24h default)
    const later = await checkForUpdate({
      aiosRoot, rootDir, fetchLatest,
      now: new Date('2026-08-02T12:00:00Z'),
    });
    assert.equal(later.shouldNotify, true);
  });
});

// ── Notice state persistence ──

test('readNoticeState: default empty state', async () => {
  await withWorkspace('aios-update-state-', async (rootDir) => {
    const state = await readNoticeState(rootDir);
    assert.equal(state.notifiedVersion, null);
    assert.equal(state.dismissedVersion, null);
  });
});

test('notice state persists across checks', async () => {
  await withWorkspace('aios-update-persist-', async (rootDir, aiosRoot) => {
    await checkForUpdate({
      aiosRoot, rootDir,
      fetchLatest: async () => ({ version: '5.7.1', security: false }),
    });
    const state = await readNoticeState(rootDir);
    assert.equal(state.notifiedVersion, '5.7.1');
    assert.ok(state.lastNotifiedAt);
    assert.ok(state.lastCheckAt);
  });
});

// ── Rendering ──

test('renderUpdateNotice: renders allowed patch update', async () => {
  await withWorkspace('aios-update-render-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot, rootDir,
      fetchLatest: async () => ({ version: '5.7.1', security: false }),
    });
    const text = renderUpdateNotice(notice);
    assert.ok(text.includes('AIOS update available'));
    assert.ok(text.includes('5.7.0 -> 5.7.1'));
    assert.ok(text.includes('aios update --check'));
  });
});

test('renderUpdateNotice: empty when not notifying', () => {
  assert.equal(renderUpdateNotice({ shouldNotify: false }), '');
  assert.equal(renderUpdateNotice(null), '');
});

test('renderUpdateNotice: marks security updates', async () => {
  await withWorkspace('aios-update-render-sec-', async (rootDir, aiosRoot) => {
    const notice = await checkForUpdate({
      aiosRoot, rootDir,
      fetchLatest: async () => ({ version: '5.7.1', security: true }),
    });
    const text = renderUpdateNotice(notice);
    assert.ok(text.includes('[SECURITY]'));
  });
});

// ── Version reading ──

test('readCurrentVersion: reads VERSION file', async () => {
  await withWorkspace('aios-update-readver-', async (rootDir, aiosRoot) => {
    const version = await readCurrentVersion(aiosRoot);
    assert.equal(version, '5.7.0');
  });
});

test('readCurrentVersion: empty when no VERSION file', async () => {
  await withWorkspace('aios-update-nover-', async (rootDir) => {
    const emptyDir = path.join(rootDir, 'empty');
    await fs.mkdir(emptyDir, { recursive: true });
    const version = await readCurrentVersion(emptyDir);
    assert.equal(version, '');
  });
});

test('checkForUpdate: unknown current version -> check_failed', async () => {
  await withWorkspace('aios-update-nocur-', async (rootDir) => {
    const emptyDir = path.join(rootDir, 'empty');
    await fs.mkdir(emptyDir, { recursive: true });
    const notice = await checkForUpdate({
      aiosRoot: emptyDir,
      rootDir,
      fetchLatest: async () => ({ version: '5.7.1' }),
    });
    assert.equal(notice.status, UPDATE_STATES.CHECK_FAILED);
    assert.ok(notice.reason.includes('current version unknown'));
  });
});
