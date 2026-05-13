import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSoloHarnessCommand,
  checkSoloHarnessProfileReadiness,
  resolveSoloHarnessProfile,
  validateSoloHarnessExtraArgs,
} from '../lib/harness/solo-profiles.mjs';

test('resolveSoloHarnessProfile maps codex and opencode providers', () => {
  const codex = resolveSoloHarnessProfile({ provider: 'codex' });
  assert.equal(codex.clientId, 'codex-cli');
  assert.equal(codex.command, 'codex');

  const opencode = resolveSoloHarnessProfile({ provider: 'opencode' });
  assert.equal(opencode.clientId, 'opencode-cli');
  assert.equal(opencode.command, 'opencode');

  const kiro = resolveSoloHarnessProfile({ provider: 'kiro' });
  assert.equal(kiro.clientId, 'kiro-cli');
  assert.equal(kiro.command, 'kiro-cli');
});

test('validateSoloHarnessExtraArgs rejects reserved harness flags', () => {
  assert.throws(
    () => validateSoloHarnessExtraArgs(['--session', 'x']),
    /reserved harness flag/i
  );
});

test('checkSoloHarnessProfileReadiness reports missing provider binaries clearly', async () => {
  const readiness = await checkSoloHarnessProfileReadiness({
    provider: 'codex',
    commandExistsImpl: async () => false,
  });

  assert.equal(readiness.ok, false);
  assert.match(readiness.reason, /codex/i);
});

test('checkSoloHarnessProfileReadiness requires KIRO_API_KEY for kiro', async () => {
  const readiness = await checkSoloHarnessProfileReadiness({
    provider: 'kiro',
    env: {},
    commandExistsImpl: async () => true,
  });

  assert.equal(readiness.ok, false);
  assert.match(readiness.reason, /KIRO_API_KEY/i);
});

test('checkSoloHarnessProfileReadiness accepts kiro when command and key are present', async () => {
  const readiness = await checkSoloHarnessProfileReadiness({
    provider: 'kiro',
    env: { KIRO_API_KEY: 'test-key' },
    commandExistsImpl: async () => true,
  });

  assert.equal(readiness.ok, true);
  assert.equal(readiness.profile.clientId, 'kiro-cli');
});

test('buildSoloHarnessCommand routes one-shot runs through ctx-agent', () => {
  const built = buildSoloHarnessCommand({
    rootDir: '/tmp/aios',
    sessionId: 'session-1',
    objective: 'Ship checklist',
    provider: 'codex',
    prompt: 'return json',
    extraArgs: ['--model', 'gpt-5'],
  });

  assert.equal(typeof built.command, 'string');
  assert.ok(built.args.includes('--agent'));
  assert.ok(built.args.includes('codex-cli'));
  assert.ok(built.args.includes('--session'));
  assert.ok(built.args.includes('session-1'));
  assert.ok(built.args.includes('--prompt'));
});

test('buildSoloHarnessCommand separates AIOS install root from target workspace', () => {
  const built = buildSoloHarnessCommand({
    rootDir: '/tmp/project',
    aiosRootDir: '/opt/aios',
    workspaceRoot: '/tmp/project/.aios-worktrees/session-1',
    sessionId: 'session-1',
    objective: 'Ship checklist',
    provider: 'codex',
    prompt: 'return json',
  });

  assert.equal(built.args[0], '/opt/aios/scripts/ctx-agent.mjs');
  assert.equal(built.cwd, '/tmp/project/.aios-worktrees/session-1');
  assert.deepEqual(
    built.args.slice(built.args.indexOf('--workspace'), built.args.indexOf('--workspace') + 2),
    ['--workspace', '/tmp/project/.aios-worktrees/session-1']
  );
  assert.deepEqual(
    built.args.slice(built.args.indexOf('--project'), built.args.indexOf('--project') + 2),
    ['--project', 'session-1']
  );
});
