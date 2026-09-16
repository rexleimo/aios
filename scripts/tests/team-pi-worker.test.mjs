/* 中文注释：pi 的 team worker 路径守卫。真实实跑已在 2026-09-16 验证：
   `aios team --provider pi --workers 1 --live` 在临时工作区里由 `pi -p` 完成
   phase.plan（success=true，19.5s），implement worker 也确实写出了目标文件。
   本文件把这些结论固化成离线断言，避免以后有人绕过平台 spawn 层或误删 team 能力。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildTeamProviderRuntimeClientMap,
  resolveClientTeamProviders,
} from '../lib/clients/registry.mjs';
import { CLIENT_COMMAND } from '../lib/harness/subagent-runtime/constants.mjs';
import { buildOneShotInvocation } from '../lib/harness/subagent-clients/one-shot.mjs';
import {
  commandExists,
  getCommandSpawnSpec,
} from '../lib/platform/process/spawn.mjs';
import { runOneShot } from '../lib/harness/subagent-runtime/one-shot-runner.mjs';

test('pi is declared a team provider and maps to its runtime client id', () => {
  assert.ok(resolveClientTeamProviders('all').includes('pi'));
  assert.equal(buildTeamProviderRuntimeClientMap('all').pi, 'pi-coding-agent');
  assert.equal(CLIENT_COMMAND['pi-coding-agent'], 'pi');
});

test('pi team worker builds a headless one-shot invocation', () => {
  const invocation = buildOneShotInvocation({
    clientId: 'pi-coding-agent',
    systemText: 'You are the implementer.',
    promptText: 'Create marker.txt',
  });
  assert.ok(invocation, 'pi must have a subagent one-shot strategy');
  assert.equal(invocation.runner, 'spawn', 'team worker must run through the shared spawn executor');
  assert.deepEqual(invocation.args.slice(0, 2), ['-p', 'You are the implementer.\n\n## New User Request\nCreate marker.txt']);
});

// Windows ships pi as an extensionless npm shim next to pi.cmd. A bare `spawn('pi')`
// hits CreateProcess and dies with ENOENT, so the team worker path must resolve the
// command through the platform layer instead of assuming the shim is executable.
test('pi resolves through the platform spawn spec on win32', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-team-pi-shim-'));
  fs.writeFileSync(path.join(dir, 'pi'), '#!/bin/sh\nexit 0\n');
  fs.writeFileSync(path.join(dir, 'pi.cmd'), '@echo off\r\n');
  // Keep the real PATH reachable so the win32 `where` probe itself resolves; the
  // shim dir is searched first, exactly like an npm global install on PATH.
  const env = { ...process.env, PATH: [dir, process.env.PATH].join(path.delimiter), PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  try {
    assert.equal(commandExists('pi', { platform: 'win32', env }), true,
      'commandExists must accept the pi shim, otherwise every team worker fails with 127');
    const spec = getCommandSpawnSpec('pi', ['-p', 'ping'], { platform: 'win32', env });
    const bareExtensionless = spec.command === 'pi' && spec.shell !== true;
    assert.equal(bareExtensionless, false,
      `win32 must resolve pi to a real target or use the shell, got command=${spec.command} shell=${spec.shell}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// pending-smoke is the runner's "not verified yet" quarantine; pi left it once the
// live team run above succeeded. Keep that state asserted instead of implicit.
test('pi is not quarantined as pending-smoke in the subagent runner', async () => {
  // An empty PATH dir (not an empty string) makes the lookup deterministic on every
  // platform, so this asserts "past the quarantine gate" without ever spawning pi.
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-team-pi-nopath-'));
  const result = await runOneShot('pi-coding-agent', {
    systemPrompt: '',
    userPrompt: 'probe',
    env: { PATH: emptyDir, SYSTEMROOT: process.env.SYSTEMROOT || '' },
  });
  assert.equal(result.exitCode, 127);
  assert.match(result.error, /Command not found: pi/,
    'pi must reach command lookup, not the pending-smoke gate');
  fs.rmSync(emptyDir, { recursive: true, force: true });
});
