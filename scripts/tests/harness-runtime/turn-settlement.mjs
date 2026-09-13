import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTurnEnvelope,
  mapIterationToTurnContract,
  settleTurnEnvelope,
  verifyTurnEnvelope,
} from '../../lib/harness/turn-settlement.mjs';

function fakeRexRunner(script = []) {
  const calls = [];
  const runCommand = (command, args, options) => {
    calls.push({ command, args, options });
    const subcommand = args[1];
    return script.find((entry) => entry.subcommand === subcommand)?.response
      || { status: 0, stdout: '{}', stderr: '' };
  };
  return { calls, runCommand };
}

test('iteration contract maps only success to material turn outcomes', () => {
  assert.deepEqual(
    mapIterationToTurnContract({ outcome: 'success', shouldStop: false }),
    { turnOutcome: 'validated_progress', failureKind: 'none' },
  );
  assert.deepEqual(
    mapIterationToTurnContract({ outcome: 'success', shouldStop: true }),
    { turnOutcome: 'validated_completion', failureKind: 'none' },
  );
  // 失败/阻塞轮一律 blocked：失败轮不得自证进展。
  for (const outcome of ['noop', 'blocked', 'infra-retry', 'human-gate', 'stopped', 'failed']) {
    const mapped = mapIterationToTurnContract({ outcome, failureClass: 'none' });
    assert.equal(mapped.turnOutcome, 'blocked', `${outcome} must map to blocked`);
  }
  assert.equal(mapIterationToTurnContract({ outcome: 'infra-retry', failureClass: 'rate-limited' }).failureKind, 'rate_limited');
  assert.equal(mapIterationToTurnContract({ outcome: 'infra-retry', failureClass: 'provider-overloaded' }).failureKind, 'provider_overloaded');
  assert.equal(mapIterationToTurnContract({ outcome: 'human-gate', failureClass: 'safety-gate' }).failureKind, 'safety_gate');
  assert.equal(mapIterationToTurnContract({ outcome: 'blocked', failureClass: 'host-unsupported' }).failureKind, 'host_unsupported');
});

test('buildTurnEnvelope produces a normalized envelope bound to the execution token', () => {
  const envelope = buildTurnEnvelope({
    activationId: 'workflow-checkout',
    executionToken: 'token-1',
    iteration: 2,
    outcome: 'blocked',
    failureClass: 'rate-limited',
    summary: 'provider 429',
    blockedReason: 'provider returned 429',
  });
  assert.equal(envelope.outcome, 'blocked');
  assert.equal(envelope.failureKind, 'rate_limited');
  assert.equal(envelope.turnKey.iteration, 2);
  assert.match(envelope.effectRef, /^effect:[0-9a-f]{64}$/u);
});

test('buildTurnEnvelope refuses material claims without structured evidence', () => {
  assert.throws(
    () => buildTurnEnvelope({
      activationId: 'workflow-checkout',
      executionToken: 'token-1',
      iteration: 1,
      outcome: 'success',
      evidence: [],
    }),
    /requires evidence/u,
  );
});

test('verify gate is fail-closed: settle is never called unless verify exits 0', () => {
  const envelope = buildTurnEnvelope({
    activationId: 'workflow-checkout',
    executionToken: 'token-1',
    iteration: 1,
    outcome: 'blocked',
    summary: 'no safe step',
  });

  // verify 拒绝（exit 1）→ settle 不得被调用。
  const rejected = fakeRexRunner([
    { subcommand: 'verify', response: { status: 1, stdout: JSON.stringify({ status: 'rejected', rejections: ['stale_command_token'] }), stderr: '' } },
  ]);
  const blocked = settleTurnEnvelope({ rootDir: '/tmp/x', envelope, runCommand: rejected.runCommand });
  assert.equal(blocked.gate, 'blocked');
  assert.deepEqual(blocked.verify.rejections, ['stale_command_token']);
  assert.equal(rejected.calls.filter((call) => call.args[1] === 'settle').length, 0);

  // verify 放行（exit 0）→ settle 被调用且结果透传。
  const accepted = fakeRexRunner([
    { subcommand: 'verify', response: { status: 0, stdout: JSON.stringify({ status: 'accepted', rejections: [] }), stderr: '' } },
    { subcommand: 'settle', response: { status: 0, stdout: JSON.stringify({ settlement: { decision: 'accepted' } }), stderr: '' } },
  ]);
  const settled = settleTurnEnvelope({ rootDir: '/tmp/x', envelope, runCommand: accepted.runCommand });
  assert.equal(settled.gate, 'passed');
  assert.equal(settled.settlement.settlement.decision, 'accepted');
  assert.equal(accepted.calls.filter((call) => call.args[1] === 'settle').length, 1);
});

test('verifyTurnEnvelope surfaces process failures as rejections', () => {
  const envelope = buildTurnEnvelope({
    activationId: 'workflow-checkout',
    executionToken: 'token-1',
    iteration: 1,
    outcome: 'blocked',
    summary: 'no safe step',
  });
  const broken = fakeRexRunner([
    { subcommand: 'verify', response: { status: 1, stdout: '', stderr: 'spawn boom' } },
  ]);
  const result = verifyTurnEnvelope({ rootDir: '/tmp/x', envelope, runCommand: broken.runCommand });
  assert.equal(result.passed, false);
  assert.match(result.rejections[0], /verify_process_failed/u);
});
