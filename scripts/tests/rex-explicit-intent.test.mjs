import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runStart } from '../../rex-harness/src/cli/start.mjs';
import { evaluateAiosSoftwareRequest } from '../lib/workflows/rex-harness-adapter.mjs';
import { runAutoGate } from '../lib/planning/auto-gate.mjs';

function tempRoot(prefix) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('AIOS adapter preserves explicit intent normalization and safe implement routing', () => {
  const result = evaluateAiosSoftwareRequest({
    message: 'Update authentication behavior.',
    explicitIntent: { intent: 'IMPLEMENT' },
  });
  assert.equal(result.decision.capabilityId, 'software.testing.design');
  assert.equal(result.decision.reasonCode, 'explicit-intent-implement');
  assert.equal(result.decision.provider.kind, 'skill');
});

test('auto-gate parses slash intents without creating a plan during dry-run', () => {
  const rootDir = tempRoot('rex-explicit-intent-gate-');
  try {
    const tickets = runAutoGate({
      rootDir,
      message: '/tickets 把登录逻辑改一下。',
      client: 'codex',
      sessionId: 'intent-session',
      dryRun: true,
    });
    assert.equal(tickets.decision.disposition, 'planned');
    assert.equal(tickets.decision.routeHint, 'planning');
    assert.equal(tickets.decision.capabilityDecision.capabilityId, 'software.planning.sequence');
    assert.equal(tickets.created, false);
    assert.equal(tickets.plan, null);

    const review = runAutoGate({
      rootDir,
      message: '/review inspect the current change',
      client: 'codex',
      sessionId: 'intent-session',
      dryRun: true,
    });
    assert.equal(review.decision.disposition, 'blocked');
    assert.equal(review.decision.reason, 'review-requires-diff');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('standalone CLI accepts --intent and persists its normalized request', () => {
  const rootDir = tempRoot('rex-explicit-intent-cli-');
  try {
    const output = runStart([
      '--root', rootDir,
      '--work-item', 'intent-cli',
      '--message', 'Update authentication behavior.',
      '--intent', 'IMPLEMENT',
      '--full',
    ], { cwd: rootDir });
    assert.equal(output.workflow.request.explicitIntent, 'implement');
    assert.equal(output.command.capabilityId, 'software.testing.design');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
