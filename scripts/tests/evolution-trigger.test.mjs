import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  evaluateTrigger,
  countPendingCandidates,
  recordSuccessfulRun,
  readTriggerState,
  updatePendingCount,
  EVOLUTION_TRIGGER_DEFAULTS,
} from '../lib/lifecycle/evolution/trigger.mjs';
import { getEvolutionStatus } from '../lib/lifecycle/evolution/status.mjs';
import { autoMemoSessionClose } from '../lib/lifecycle/session-hooks/close.mjs';
import { resolveContextDbRoot } from '../lib/aios/state-root.mjs';

async function withWorkspace(prefix, fn) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(workspaceRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function seedSessionEvents(rootDir, sessionId, events) {
  const contextDbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  const sessionDir = path.join(contextDbRoot, 'sessions', sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const lines = events.map((e) => JSON.stringify(e)).join('\n');
  await fs.writeFile(eventsPath, lines + '\n', 'utf8');
}

test('evolution trigger: no candidates returns noop', async () => {
  await withWorkspace('aios-evo-trigger-empty-', async (workspaceRoot) => {
    const decision = await evaluateTrigger({ rootDir: workspaceRoot });
    assert.equal(decision.action, 'noop');
    assert.equal(decision.trigger, 'none');
    assert.equal(decision.pendingCandidates, 0);
    assert.ok(decision.reason.includes('No trigger conditions met'));
  });
});

test('evolution trigger: threshold met triggers run', async () => {
  await withWorkspace('aios-evo-trigger-threshold-', async (workspaceRoot) => {
    // Create 5 candidates (default threshold)
    for (let i = 0; i < 5; i++) {
      const sessionId = `session-thresh-${i}`;
      await seedSessionEvents(workspaceRoot, sessionId, [
        { role: 'assistant', text: `Completed task ${i}`, ts: new Date().toISOString() },
      ]);
      await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });
    }

    const decision = await evaluateTrigger({ rootDir: workspaceRoot });
    assert.equal(decision.action, 'run');
    assert.equal(decision.trigger, 'threshold');
    assert.equal(decision.pendingCandidates, 5);
    assert.ok(decision.reason.includes('threshold'));
  });
});

test('evolution trigger: manual force overrides policy', async () => {
  await withWorkspace('aios-evo-trigger-manual-', async (workspaceRoot) => {
    // No candidates, but manual force should trigger run
    const decision = await evaluateTrigger({
      rootDir: workspaceRoot,
      force: 'manual',
    });
    assert.equal(decision.action, 'run');
    assert.equal(decision.trigger, 'manual');
    assert.ok(decision.reason.includes('Manual trigger'));
  });
});

test('evolution trigger: cooldown blocks threshold trigger', async () => {
  await withWorkspace('aios-evo-trigger-cooldown-', async (workspaceRoot) => {
    // Create 5 candidates
    for (let i = 0; i < 5; i++) {
      const sessionId = `session-cool-${i}`;
      await seedSessionEvents(workspaceRoot, sessionId, [
        { role: 'assistant', text: `Completed task ${i}`, ts: new Date().toISOString() },
      ]);
      await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });
    }

    // Record a recent successful run
    await recordSuccessfulRun(workspaceRoot);

    // Now threshold is met but cooldown not elapsed
    const decision = await evaluateTrigger({ rootDir: workspaceRoot });
    assert.equal(decision.action, 'noop');
    assert.equal(decision.trigger, 'cooldown');
    assert.ok(decision.nextEligibleAt);
    assert.ok(decision.reason.includes('cooldown not elapsed'));
  });
});

test('evolution trigger: schedule triggers review after cooldown', async () => {
  await withWorkspace('aios-evo-trigger-schedule-', async (workspaceRoot) => {
    // Record a run that happened 25 hours ago
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const state = { lastRunAt: oldDate, pendingCandidates: 0, lastTrigger: 'run' };
    const statePath = path.join(
      resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true }),
      '..',
      'memo',
      'evolution',
      'trigger-state.json'
    );
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');

    const decision = await evaluateTrigger({ rootDir: workspaceRoot });
    assert.equal(decision.action, 'review');
    assert.equal(decision.trigger, 'schedule');
    assert.ok(decision.reason.includes('Cooldown elapsed'));
  });
});

test('evolution trigger: custom config overrides defaults', async () => {
  await withWorkspace('aios-evo-trigger-custom-', async (workspaceRoot) => {
    // Create 3 candidates
    for (let i = 0; i < 3; i++) {
      const sessionId = `session-custom-${i}`;
      await seedSessionEvents(workspaceRoot, sessionId, [
        { role: 'assistant', text: `Completed task ${i}`, ts: new Date().toISOString() },
      ]);
      await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });
    }

    // With default config (min=5), should be noop
    const defaultDecision = await evaluateTrigger({ rootDir: workspaceRoot });
    assert.equal(defaultDecision.action, 'noop');

    // With custom config (min=3), should trigger
    const customDecision = await evaluateTrigger({
      rootDir: workspaceRoot,
      config: { minCandidates: 3, cooldownHours: 24 },
    });
    assert.equal(customDecision.action, 'run');
    assert.equal(customDecision.trigger, 'threshold');
  });
});

test('evolution trigger: countPendingCandidates returns correct count', async () => {
  await withWorkspace('aios-evo-count-', async (workspaceRoot) => {
    assert.equal(await countPendingCandidates(workspaceRoot), 0);

    for (let i = 0; i < 3; i++) {
      const sessionId = `session-count-${i}`;
      await seedSessionEvents(workspaceRoot, sessionId, [
        { role: 'assistant', text: `Task ${i}`, ts: new Date().toISOString() },
      ]);
      await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });
    }

    assert.equal(await countPendingCandidates(workspaceRoot), 3);
  });
});

test('evolution trigger: recordSuccessfulRun updates state', async () => {
  await withWorkspace('aios-evo-record-', async (workspaceRoot) => {
    const before = await readTriggerState(workspaceRoot);
    assert.equal(before.lastRunAt, null);

    const after = await recordSuccessfulRun(workspaceRoot);
    assert.ok(after.lastRunAt);
    assert.ok(new Date(after.lastRunAt).getTime() > 0);

    const persisted = await readTriggerState(workspaceRoot);
    assert.equal(persisted.lastRunAt, after.lastRunAt);
  });
});

test('evolution trigger: updatePendingCount reflects current state', async () => {
  await withWorkspace('aios-evo-update-', async (workspaceRoot) => {
    await updatePendingCount(workspaceRoot);
    let state = await readTriggerState(workspaceRoot);
    assert.equal(state.pendingCandidates, 0);

    const sessionId = 'session-update-001';
    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Done', ts: new Date().toISOString() },
    ]);
    await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    await updatePendingCount(workspaceRoot);
    state = await readTriggerState(workspaceRoot);
    assert.equal(state.pendingCandidates, 1);
  });
});

test('evolution status: returns structured report', async () => {
  await withWorkspace('aios-evo-status-', async (workspaceRoot) => {
    const report = await getEvolutionStatus({ rootDir: workspaceRoot, format: 'json' });

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.kind, 'evolution-status');
    assert.equal(typeof report.pendingCandidates, 'number');
    assert.equal(typeof report.action, 'string');
    assert.equal(typeof report.trigger, 'string');
    assert.ok(Array.isArray(report.candidates));
    assert.ok(report.config.minCandidates > 0);
  });
});

test('evolution status: human format includes rendered string', async () => {
  await withWorkspace('aios-evo-status-human-', async (workspaceRoot) => {
    const report = await getEvolutionStatus({ rootDir: workspaceRoot, format: 'human' });

    assert.ok(report.rendered, 'should have rendered field');
    assert.ok(typeof report.rendered === 'string');
    assert.ok(report.rendered.includes('Evolution Pipeline Status'));
    assert.ok(report.rendered.includes('Pending candidates'));
  });
});

test('evolution status: shows candidates when present', async () => {
  await withWorkspace('aios-evo-status-candidates-', async (workspaceRoot) => {
    const sessionId = 'session-status-001';
    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Completed API refactor', ts: new Date().toISOString() },
    ]);
    await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    const report = await getEvolutionStatus({ rootDir: workspaceRoot, format: 'json' });
    assert.equal(report.pendingCandidates, 1);
    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0].sessionId, sessionId);
  });
});
