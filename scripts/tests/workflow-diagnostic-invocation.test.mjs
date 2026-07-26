import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWorkflowDiagnosticInvocation } from '../lib/workflow-diagnostic/invocation.mjs';

const SENTINEL = 'SENTINEL-EXPECTED-ANSWER-MUST-NOT-LEAK';

const task = {
  taskId: 'diagnostic-001',
  category: 'reasoning',
  prompt: 'Report the number of distinct workflow modes named in the guidance.',
  expected: SENTINEL,
  normalization: 'exact',
};

const BASELINE_POLICY = 'Guidance revision one. Follow the recorded workflow policy.';
const OPTIMIZED_POLICY = 'Guidance revision two. Follow the recorded workflow policy.';

function inertLauncher() {
  const launched = [];
  return {
    launched,
    launch(invocation) {
      launched.push({
        executable: invocation.executable,
        argv: invocation.args.join(' '),
        stdin: invocation.input,
      });
      return { stdout: '', stderr: '', status: 0 };
    },
  };
}

function build(policyText) {
  return buildWorkflowDiagnosticInvocation({
    client: 'codex',
    model: 'gpt-5.6-terra',
    policyText,
    task,
    timeoutSeconds: 60,
    remainingSpendUsd: 1,
    toolPolicy: 'no-browser-no-network-tools',
  });
}

test('no client-visible payload carries the sentinel expected answer', () => {
  const launcher = inertLauncher();
  launcher.launch(build(BASELINE_POLICY));
  launcher.launch(build(OPTIMIZED_POLICY));

  assert.equal(launcher.launched.length, 2);
  for (const payload of launcher.launched) {
    assert.equal(payload.executable, 'codex');
    assert.doesNotMatch(payload.stdin, new RegExp(SENTINEL, 'u'));
    assert.doesNotMatch(payload.argv, new RegExp(SENTINEL, 'u'));
    assert.doesNotMatch(payload.stdin, /normalization|expected/iu);
    assert.match(payload.stdin, /diagnostic-001/u);
    assert.match(payload.stdin, /no-browser-no-network-tools/u);
  }
});

test('the two arms differ only in the rendered policy and carry no arm label', () => {
  const baseline = build(BASELINE_POLICY);
  const optimized = build(OPTIMIZED_POLICY);

  assert.deepEqual(baseline.args, optimized.args);
  assert.equal(
    baseline.input.replace(BASELINE_POLICY, ''),
    optimized.input.replace(OPTIMIZED_POLICY, ''),
  );
  assert.doesNotMatch(baseline.input, /baseline|optimized/iu);
  assert.doesNotMatch(optimized.input, /baseline|optimized/iu);
});

test('a prompt that embeds the expected answer fails closed before any launch', () => {
  assert.throws(
    () => buildWorkflowDiagnosticInvocation({
      client: 'codex',
      model: 'gpt-5.6-terra',
      policyText: BASELINE_POLICY,
      task: { ...task, prompt: `Restate ${SENTINEL} exactly.` },
      timeoutSeconds: 60,
      remainingSpendUsd: 1,
      toolPolicy: 'no-browser-no-network-tools',
    }),
    /must not contain the expected answer/u,
  );
});

test('an unconfigured client, model, or tool policy is rejected', () => {
  const base = {
    client: 'codex',
    model: 'gpt-5.6-terra',
    policyText: BASELINE_POLICY,
    task,
    timeoutSeconds: 60,
    remainingSpendUsd: 1,
    toolPolicy: 'no-browser-no-network-tools',
  };

  assert.throws(
    () => buildWorkflowDiagnosticInvocation({ ...base, client: 'hermes' }),
    /not configured for hermes/u,
  );
  assert.throws(
    () => buildWorkflowDiagnosticInvocation({ ...base, model: 'gpt-4o' }),
    /model must equal gpt-5\.6-terra/u,
  );
  assert.throws(
    () => buildWorkflowDiagnosticInvocation({ ...base, toolPolicy: 'browser' }),
    /toolPolicy must equal no-browser-no-network-tools/u,
  );
});
