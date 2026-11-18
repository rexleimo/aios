/**
 * Test scope contract — Claude Code global statusLine (home scope)
 *
 * User goal:
 *   The status line AIOS configures must actually render in Claude Code, which reads
 *   only the top-level `statusLine` of `$CLAUDE_CONFIG_DIR/settings.json`. Nothing has
 *   ever written it there, so the slot stayed empty.
 *
 * In-scope behavior:
 *   H1  Missing file -> created with the command baked to the install root.
 *   H2  Existing unrelated keys survive untouched.
 *   H3  A user-owned statusLine is never overwritten (skipped/user-owned).
 *   H4  Re-running is idempotent (reused), not a rewrite.
 *   H5  Invalid JSON is skipped, never reset — this file is the user's global config.
 *   H6  Volatile AIOS root never writes into a permanent home config.
 *   H7  Uninstall removes only a statusLine AIOS still owns.
 *   H8  CLAUDE_CONFIG_DIR is honoured over ~/.claude.
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildClaudeStatuslineFragment,
  checkClaudeHomeStatusline,
  removeClaudeHomeStatusline,
  resolveClaudeConfigDir,
  resolveStatuslineRoot,
  syncClaudeHomeStatusline,
} from '../../../lib/clients/native/distribution/emitters/claude-home.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function withScope(run) {
  const configDir = await makeTemp('aios-claude-home-');
  const rootDir = await makeTemp('aios-claude-root-');
  try {
    await run({ configDir, rootDir, env: { CLAUDE_CONFIG_DIR: configDir } });
  } finally {
    await rm(configDir, { recursive: true, force: true });
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('H1: creates settings.json with the statusline command pointing at the install root', async () => {
  await withScope(async ({ configDir, rootDir, env }) => {
    const result = await syncClaudeHomeStatusline({ rootDir, env });
    assert.equal(result.status, 'created');

    const settings = await readJson(path.join(configDir, 'settings.json'));
    assert.equal(settings.statusLine.type, 'command');
    const cli = `node ${path.resolve(rootDir)}/scripts/aios.mjs`;
    // 首次尝试新子命令，失败降级到所有版本都有的 `plan status`；整组吞掉 stderr。
    assert.equal(settings.statusLine.command, `(${cli} plan statusline || ${cli} plan status) 2>/dev/null`);
    assert.match(settings.statusLine.command, / plan statusline\b/u);
  });
});

test('H2: unrelated settings keys are preserved', async () => {
  await withScope(async ({ configDir, rootDir, env }) => {
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'settings.json'), JSON.stringify({
      theme: 'auto',
      env: { SOME_FLAG: '1' },
      permissions: { allow: ['Bash(git:*)'] },
    }), 'utf8');

    const result = await syncClaudeHomeStatusline({ rootDir, env });
    assert.equal(result.status, 'updated');

    const settings = await readJson(path.join(configDir, 'settings.json'));
    assert.equal(settings.theme, 'auto');
    assert.equal(settings.env.SOME_FLAG, '1');
    assert.deepEqual(settings.permissions.allow, ['Bash(git:*)']);
    assert.equal(settings.statusLine.type, 'command');
  });
});

test('H3: a user-owned statusLine is never overwritten', async () => {
  await withScope(async ({ configDir, rootDir, env }) => {
    await mkdir(configDir, { recursive: true });
    const userStatusLine = { type: 'command', command: 'bash ~/mine.sh' };
    await writeFile(path.join(configDir, 'settings.json'), JSON.stringify({ statusLine: userStatusLine }), 'utf8');

    const result = await syncClaudeHomeStatusline({ rootDir, env });
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'user-owned');

    const settings = await readJson(path.join(configDir, 'settings.json'));
    assert.deepEqual(settings.statusLine, userStatusLine);
  });
});

test('H4: re-running is idempotent', async () => {
  await withScope(async ({ configDir, rootDir, env }) => {
    await syncClaudeHomeStatusline({ rootDir, env });
    const first = await readFile(path.join(configDir, 'settings.json'), 'utf8');
    const second = await syncClaudeHomeStatusline({ rootDir, env });
    const again = await readFile(path.join(configDir, 'settings.json'), 'utf8');
    assert.equal(second.status, 'reused');
    assert.equal(again, first);
  });
});

test('H5: invalid JSON is skipped, not reset', async () => {
  await withScope(async ({ configDir, rootDir, env }) => {
    await mkdir(configDir, { recursive: true });
    const broken = '{ not json at all';
    await writeFile(path.join(configDir, 'settings.json'), broken, 'utf8');

    const result = await syncClaudeHomeStatusline({ rootDir, env });
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'invalid-json');
    assert.equal(await readFile(path.join(configDir, 'settings.json'), 'utf8'), broken);
  });
});

test('H6: a volatile AIOS root never writes into a permanent home config', async () => {
  const tmpdir = await makeTemp('aios-claude-volatile-');
  const configDir = await makeTemp('aios-claude-volatile-home-');
  try {
    const volatileRoot = path.join(tmpdir, 'aios-install');
    await mkdir(volatileRoot, { recursive: true });
    const result = await syncClaudeHomeStatusline({
      rootDir: volatileRoot,
      env: { CLAUDE_CONFIG_DIR: configDir },
      tmpdir,
    });
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'volatile-root');
    await assert.rejects(readFile(path.join(configDir, 'settings.json'), 'utf8'));
  } finally {
    await rm(tmpdir, { recursive: true, force: true });
    await rm(configDir, { recursive: true, force: true });
  }
});

test('H7: uninstall removes only an AIOS-owned statusLine', async () => {
  await withScope(async ({ configDir, rootDir, env }) => {
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'settings.json'), JSON.stringify({ theme: 'auto' }), 'utf8');
    await syncClaudeHomeStatusline({ rootDir, env });

    const result = await removeClaudeHomeStatusline({ rootDir, env });
    assert.equal(result.status, 'removed');
    const settings = await readJson(path.join(configDir, 'settings.json'));
    assert.equal(Object.hasOwn(settings, 'statusLine'), false);
    assert.equal(settings.theme, 'auto');

    // 用户改写过之后，卸载不动它。
    await writeFile(path.join(configDir, 'settings.json'), JSON.stringify({
      statusLine: { type: 'command', command: 'bash ~/mine.sh' },
    }), 'utf8');
    const kept = await removeClaudeHomeStatusline({ rootDir, env });
    assert.equal(kept.status, 'reused');
    assert.equal((await readJson(path.join(configDir, 'settings.json'))).statusLine.command, 'bash ~/mine.sh');
  });
});

test('H8: CLAUDE_CONFIG_DIR wins over the home default', () => {
  const resolved = resolveClaudeConfigDir({ env: { CLAUDE_CONFIG_DIR: '/tmp/custom-claude' }, homeDir: '/home/x' });
  assert.equal(resolved, path.resolve('/tmp/custom-claude'));
  assert.equal(resolveClaudeConfigDir({ env: {}, homeDir: '/home/x' }), path.join('/home/x', '.claude'));
});

test('H9: doctor probe reports missing before sync and ok after', async () => {
  await withScope(async ({ configDir, rootDir, env }) => {
    const before = await checkClaudeHomeStatusline({ rootDir, env });
    assert.equal(before.ok, false);
    assert.match(before.issue, /\[missing\]/u);

    await syncClaudeHomeStatusline({ rootDir, env });
    const after = await checkClaudeHomeStatusline({ rootDir, env });
    assert.equal(after.ok, true);
    assert.equal(after.owned, true);
  });
});

test('H10: the fragment carries no secret material', () => {
  const fragment = buildClaudeStatuslineFragment({ rootDir: '/opt/aios', env: {} });
  assert.deepEqual(Object.keys(fragment), ['statusLine']);
  assert.deepEqual(Object.keys(fragment.statusLine).sort(), ['command', 'type']);
});

test('H11: root preference — an AIOS root that has the statusline module beats the caller root', async () => {
  const callerRoot = await makeTemp('aios-claude-caller-');
  const installRoot = await makeTemp('aios-claude-install-');
  const oldRoot = await makeTemp('aios-claude-old-');
  try {
    // 三个候选都像 AIOS 根，只有 installRoot 带 statusline 模块。
    for (const root of [callerRoot, installRoot, oldRoot]) {
      await mkdir(path.join(root, 'scripts'), { recursive: true });
      await writeFile(path.join(root, 'scripts', 'aios.mjs'), '', 'utf8');
    }
    await mkdir(path.join(installRoot, 'scripts', 'lib', 'foundation', 'planning', 'ops'), { recursive: true });
    await writeFile(path.join(installRoot, 'scripts', 'lib', 'foundation', 'planning', 'ops', 'statusline.mjs'), '', 'utf8');

    assert.equal(resolveStatuslineRoot({
      rootDir: callerRoot,
      env: { AIOS_ROOT_DIR: oldRoot, AIOS_ROOT: installRoot },
    }), path.resolve(installRoot));

    // 没有带模块的根时退回第一个可用根，不猜 cwd。
    assert.equal(resolveStatuslineRoot({
      rootDir: '',
      env: { AIOS_ROOT_DIR: oldRoot },
    }), path.resolve(oldRoot));

    // 一个候选都不像 AIOS 根：退回调用方给的根（保持可预期的失败面）。
    assert.equal(resolveStatuslineRoot({ rootDir: callerRoot, env: {} }), path.resolve(callerRoot));
  } finally {
    await rm(callerRoot, { recursive: true, force: true });
    await rm(installRoot, { recursive: true, force: true });
    await rm(oldRoot, { recursive: true, force: true });
  }
});

test('H12: a statusLine owned by AIOS but pointing at another root is re-pointed, not skipped', async () => {
  await withScope(async ({ configDir, rootDir, env }) => {
    await mkdir(configDir, { recursive: true });
    const stale = { type: 'command', command: '(node /old/place/scripts/aios.mjs plan statusline || node /old/place/scripts/aios.mjs plan status) 2>/dev/null' };
    await writeFile(path.join(configDir, 'settings.json'), JSON.stringify({ statusLine: stale }), 'utf8');

    const before = await checkClaudeHomeStatusline({ rootDir, env });
    assert.equal(before.ok, false);
    assert.match(before.issue, /\[drift\]/u);

    const result = await syncClaudeHomeStatusline({ rootDir, env });
    assert.equal(result.status, 'updated');
    const settings = await readJson(path.join(configDir, 'settings.json'));
    assert.match(settings.statusLine.command, new RegExp(path.resolve(rootDir).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  });
});
