import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGaiaClientInvocation } from '../lib/gaia-ab-eval/client-adapters.mjs';

const task = {
  taskId: 'level-1-task',
  level: 1,
  prompt: 'Find the requested local answer.',
  expected: 'must-not-reach-client',
};

test('Codex invocation pins the model and withholds the expected answer', () => {
  const invocation = buildGaiaClientInvocation({
    client: 'codex',
    model: 'gpt-5.6-terra',
    arm: 'baseline',
    policy: 'Use the common tools and return only the final answer.',
    task,
    timeoutSeconds: 120,
    remainingSpendUsd: 5,
    usagePath: 'artifacts/codex-usage.json',
  });

  assert.equal(invocation.executable, 'codex');
  assert.deepEqual(invocation.args, [
    'exec',
    '--model',
    'gpt-5.6-terra',
    '--sandbox',
    'read-only',
    '--json',
    '-',
  ]);
  assert.match(invocation.input, /level-1-task/u);
  assert.match(invocation.input, /baseline/u);
  assert.match(invocation.input, /120/u);
  assert.match(invocation.input, /5/u);
  assert.doesNotMatch(invocation.input, /must-not-reach-client/u);
  assert.doesNotMatch(invocation.input, /expected/u);
});

test('Claude invocation pins the model and keeps the common rules enabled', () => {
  const invocation = buildGaiaClientInvocation({
    client: 'claude',
    model: 'claude-sonnet-5',
    arm: 'optimized',
    policy: 'Use the common tools and return only the final answer.',
    task,
    timeoutSeconds: 120,
    remainingSpendUsd: 5,
    usagePath: 'artifacts/claude-usage.json',
  });

  assert.equal(invocation.executable, 'claude');
  assert.deepEqual(invocation.args, [
    '--print',
    '--model',
    'claude-sonnet-5',
    '--output-format',
    'json',
    '--max-budget-usd',
    '5',
  ]);
  assert.doesNotMatch(invocation.args.join(' '), /safe-mode|ignore-rules/u);
  assert.match(invocation.input, /optimized/u);
  assert.doesNotMatch(invocation.input, /must-not-reach-client/u);
});

test('Hermes invocation pins the model and records usage locally', () => {
  const invocation = buildGaiaClientInvocation({
    client: 'hermes',
    model: 'deepseek-v4-pro',
    arm: 'baseline',
    policy: 'Use the common tools and return only the final answer.',
    task,
    timeoutSeconds: 120,
    remainingSpendUsd: 5,
    usagePath: 'artifacts/hermes-usage.json',
  });

  assert.equal(invocation.executable, 'hermes');
  assert.deepEqual(invocation.args.slice(0, 6), [
    '--oneshot',
    invocation.input,
    '--model',
    'deepseek-v4-pro',
    '--usage-file',
    'artifacts/hermes-usage.json',
  ]);
  assert.doesNotMatch(invocation.args.join(' '), /safe-mode|ignore-rules/u);
  assert.doesNotMatch(invocation.input, /must-not-reach-client/u);
});
