import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ensurePlanForRuntime,
  markPlanTaskInProgress,
  syncPlanWithIterationOutcome,
  attachPlanVerificationEvidence,
} from '../lib/planning/plan-runtime.mjs';
import { startPlan, readActivePlan, evaluateDoneGate } from '../lib/planning/contract.mjs';

async function makeTemp() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-plan-runtime-'));
}

test('runtime plan helpers never create a plan outside policy persistence', async () => {
  const root = await makeTemp();
  try {
    const result = ensurePlanForRuntime({
      rootDir: root,
      objective: 'implement feature X',
      client: 'solo-harness',
    });
    assert.equal(result.action, 'none');
    assert.equal(result.plan, null);
    assert.equal(readActivePlan(root), null);

    const sync = syncPlanWithIterationOutcome({
      rootDir: root,
      objective: 'implement feature X',
      iteration: 1,
      outcome: { outcome: 'success', ok: true },
    });
    assert.equal(sync.ok, false);
    assert.equal(readActivePlan(root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('solo iteration success advances an explicitly persisted plan task and adds evidence', async () => {
  const root = await makeTemp();
  try {
    startPlan({
      rootDir: root,
      title: 'implement feature X',
      objective: 'implement feature X',
      client: 'solo-harness',
    });
    markPlanTaskInProgress(root);
    const before = readActivePlan(root);
    const openBefore = before.tasks.filter((t) => t.status !== 'done').length;

    const sync = syncPlanWithIterationOutcome({
      rootDir: root,
      objective: 'implement feature X',
      iteration: 1,
      outcome: {
        outcome: 'success',
        ok: true,
        summary: 'landed core change',
        evidence: ['edited src/foo.ts'],
      },
      client: 'solo-harness',
      taskId: before.tasks.find((t) => t.status === 'in_progress')?.id,
    });

    assert.equal(sync.ok, true);
    const after = readActivePlan(root);
    const doneAfter = after.tasks.filter((t) => t.status === 'done').length;
    assert.ok(doneAfter >= 1);
    assert.ok(after.evidence.length >= 1);
    assert.ok(openBefore >= doneAfter || after.tasks.some((t) => t.status === 'done'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('hard fail marks current task blocked', async () => {
  const root = await makeTemp();
  try {
    startPlan({ rootDir: root, title: 'fix crash', objective: 'fix crash', client: 'solo' });
    markPlanTaskInProgress(root);
    syncPlanWithIterationOutcome({
      rootDir: root,
      objective: 'fix crash',
      iteration: 2,
      outcome: {
        outcome: 'failed',
        failureClass: 'runtime-error',
        summary: 'tool crashed',
      },
    });
    const plan = readActivePlan(root);
    assert.ok(plan.tasks.some((t) => t.status === 'blocked'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('quality-gate evidence attaches to plan', async () => {
  const root = await makeTemp();
  try {
    startPlan({ rootDir: root, title: 'verify suite', objective: 'verify suite', client: 'quality-gate' });
    const result = attachPlanVerificationEvidence({
      rootDir: root,
      artifactPath: '.aios/context-db/sessions/s1/artifacts/quality-gate-1.json',
      report: { ok: true, mode: 'full', results: [{ label: 'typecheck', status: 'PASS' }] },
    });
    assert.equal(result.ok, true);
    const plan = readActivePlan(root);
    assert.ok(plan.evidence.some((e) => e.kind === 'path'));
    assert.ok(plan.evidence.some((e) => e.kind === 'test' && /passed/.test(e.value)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('multiple successful iterations can complete all tasks and gate opens after evidence', async () => {
  const root = await makeTemp();
  try {
    startPlan({ rootDir: root, title: 'ship small fix', objective: 'ship small fix', client: 'solo' });
    let plan = readActivePlan(root);
    const n = plan.tasks.length;
    for (let i = 0; i < n; i += 1) {
      const currentTask = plan.tasks.find((t) => t.status === 'in_progress') || plan.tasks.find((t) => t.status === 'pending');
      syncPlanWithIterationOutcome({
        rootDir: root,
        objective: 'ship small fix',
        iteration: i + 1,
        taskId: currentTask?.id,
        outcome: {
          outcome: 'success',
          ok: true,
          summary: `step ${i + 1}`,
          evidence: [`step-${i + 1}`],
        },
      });
      plan = readActivePlan(root);
    }
    plan = readActivePlan(root);
    const open = plan.tasks.filter((t) => t.status !== 'done' && t.status !== 'skipped');
    assert.equal(open.length, 0);
    const gate = evaluateDoneGate(plan);
    assert.equal(gate.ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
