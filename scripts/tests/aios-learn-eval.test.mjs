import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseArgs } from '../lib/cli/parse-args.mjs';
import { buildLearnEvalReport, renderLearnEvalReport } from '../lib/harness/learn-eval.mjs';
import { planLearnEval, runLearnEval } from '../lib/lifecycle/learn-eval.mjs';

async function makeRootDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'aios-learn-eval-'));
}

async function writeSession(rootDir, sessionId, metaOverrides = {}, checkpoints = []) {
  const sessionDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const meta = {
    schemaVersion: 1,
    sessionId,
    agent: 'codex-cli',
    project: 'rex-ai-boot',
    goal: 'Ship orchestrator blueprints',
    tags: [],
    status: 'running',
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:10:00.000Z',
    ...metaOverrides,
  };

  await fs.writeFile(path.join(sessionDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(sessionDir, 'l2-events.jsonl'), '', 'utf8');
  await fs.writeFile(
    path.join(sessionDir, 'l1-checkpoints.jsonl'),
    checkpoints.map((item) => JSON.stringify(item)).join('\n') + (checkpoints.length > 0 ? '\n' : ''),
    'utf8'
  );
}

async function writeDispatchEvidence(rootDir, sessionId, {
  seq = 1,
  ts = '2026-03-09T01:06:00.000Z',
  ok = true,
  executors = ['local-phase', 'local-merge-gate'],
  blockedJobs = 0,
  finalOutputs = 2,
  artifactName = 'dispatch-run-20260309T010600Z.json',
  workItemTelemetry = null,
  jobRuns = null,
} = {}) {
  const artifactPath = path.join('.aios', 'context-db', 'sessions', sessionId, 'artifacts', artifactName);
  const artifactAbsPath = path.join(rootDir, artifactPath);
  await fs.mkdir(path.dirname(artifactAbsPath), { recursive: true });
  await fs.writeFile(
    artifactAbsPath,
    `${JSON.stringify({
      schemaVersion: 1,
      kind: 'orchestration.dispatch-run',
      sessionId,
      persistedAt: ts,
      dispatchRun: {
        mode: 'dry-run',
        ok,
        executorRegistry: executors,
        jobRuns: Array.isArray(jobRuns)
          ? jobRuns
          : [
            { jobId: 'phase.plan', status: 'simulated', output: { outputType: 'handoff' } },
            ...(blockedJobs > 0 ? [{ jobId: 'merge.final-checks', status: 'blocked', output: { outputType: 'merged-handoff' } }] : [{ jobId: 'merge.final-checks', status: 'simulated', output: { outputType: 'merged-handoff' } }]),
          ],
        finalOutputs: Array.from({ length: finalOutputs }, (_, index) => ({ jobId: `job-${index + 1}`, outputType: 'handoff' })),
      },
      ...(workItemTelemetry && typeof workItemTelemetry === 'object' ? { workItemTelemetry } : {}),
    }, null, 2)}\n`,
    'utf8'
  );

  const sessionDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId);
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const event = {
    seq,
    ts,
    role: 'assistant',
    kind: 'orchestration.dispatch-run',
    text: `orchestrate dry-run ${ok ? 'ready' : 'blocked'} artifact=${artifactPath}`,
    refs: [artifactPath],
  };
  await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');

  return { artifactPath, eventId: `${sessionId}#${seq}` };
}

function assertRecommendationShape(item, { kind, targetType, targetId }) {
  assert.equal(item?.kind, kind);
  assert.equal(item?.targetType, targetType);
  assert.equal(item?.targetId, targetId);
  assert.equal(typeof item?.title, 'string');
  assert.equal(typeof item?.reason, 'string');
  assert.equal(typeof item?.evidence, 'string');
  assert.equal(Number.isInteger(item?.priority), true);
}

test('parseArgs accepts learn-eval options', () => {
  const result = parseArgs(['learn-eval', '--session', 'session-123', '--limit', '5', '--format', 'json']);
  assert.equal(result.command, 'learn-eval');
  assert.equal(result.options.sessionId, 'session-123');
  assert.equal(result.options.limit, 5);
  assert.equal(result.options.format, 'json');
});

test('parseArgs accepts learn-eval draft apply options', () => {
  const result = parseArgs(['learn-eval', '--session', 'session-123', '--apply-draft', 'draft.memo.repeat-blocked.ownership-policy', '--apply-dry-run']);
  assert.equal(result.command, 'learn-eval');
  assert.equal(result.options.sessionId, 'session-123');
  assert.equal(result.options.applyDraftId, 'draft.memo.repeat-blocked.ownership-policy');
  assert.equal(result.options.applyDrafts, false);
  assert.equal(result.options.applyDryRun, true);
});

test('planLearnEval emits stable preview', () => {
  const plan = planLearnEval({ sessionId: 'session-123', limit: 5, format: 'json' });
  assert.match(plan.preview, /learn-eval --session session-123 --limit 5 --format json/);
});

test('planLearnEval includes draft apply flags in preview', () => {
  const plan = planLearnEval({
    sessionId: 'session-123',
    applyDraftId: 'draft.memo.repeat-blocked.ownership-policy',
    applyDryRun: true,
  });
  assert.match(plan.preview, /--apply-draft draft\.memo\.repeat-blocked\.ownership-policy/);
  assert.match(plan.preview, /--apply-dry-run/);
});

test('buildLearnEvalReport promotes stable workflows from telemetry', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'stable-session',
    { updatedAt: '2026-03-09T02:00:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T01:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 0,
          elapsedMs: 900,
          cost: { totalTokens: 100, usd: 0.1 },
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T01:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 1,
          elapsedMs: 1100,
          cost: { totalTokens: 120, usd: 0.12 },
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T01:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 0,
          elapsedMs: 1000,
          cost: { totalTokens: 140, usd: 0.14 },
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ limit: 5 }, { rootDir });
  assert.equal(report.session.sessionId, 'stable-session');
  assert.equal(report.signals.verification.passRate, 1);
  assert.equal(report.recommendations.promote.length >= 1, true);

  const blueprintPromotion = report.recommendations.promote.find((item) => item.title === 'promote workflow blueprint');
  assertRecommendationShape(blueprintPromotion, {
    kind: 'promote',
    targetType: 'blueprint',
    targetId: 'blueprint.feature',
  });
  assert.match(blueprintPromotion?.nextCommand ?? '', /orchestrate feature --task/);

  const checklistPromotion = report.recommendations.promote.find((item) => item.title === 'promote verification checklist');
  assertRecommendationShape(checklistPromotion, {
    kind: 'promote',
    targetType: 'checklist',
    targetId: 'checklist.verification-standard',
  });
  assert.match(checklistPromotion?.nextCommand ?? '', /quality-gate pre-pr/);
  assert.equal(report.recommendations.fix.length, 0);
  assert.deepEqual(
    report.recommendations.all.map((item) => item.targetId),
    ['blueprint.feature', 'checklist.verification-standard']
  );

  const rendered = renderLearnEvalReport(report);
  assert.match(rendered, /AIOS LEARN-EVAL/);
  assert.match(rendered, /blueprint\.feature/);
  assert.match(rendered, /orchestrate feature --task/);
});

test('buildLearnEvalReport always promotes the neutral feature blueprint regardless of workflow keywords', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'security-stable',
    { updatedAt: '2026-03-09T02:30:00.000Z', goal: 'Audit login flow hardening' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T02:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1400,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T02:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1600,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId: 'security-stable', limit: 5 }, { rootDir });
  const blueprintPromotion = report.recommendations.promote.find((item) => item.title === 'promote workflow blueprint');
  assertRecommendationShape(blueprintPromotion, {
    kind: 'promote',
    targetType: 'blueprint',
    targetId: 'blueprint.feature',
  });
  assert.match(blueprintPromotion?.nextCommand ?? '', /orchestrate feature --task/);
});

test('buildLearnEvalReport normalizes recommendations and renders by priority order', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'needs-fix',
    { updatedAt: '2026-03-09T03:00:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'blocked',
        summary: 'Checkpoint 1',
        nextActions: ['Retry later'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'quality-gate quick' },
          retryCount: 3,
          failureCategory: 'timeout',
          elapsedMs: 150000,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T02:10:00.000Z',
        status: 'running',
        summary: 'Checkpoint 2',
        nextActions: ['Retry later'],
        artifacts: [],
        telemetry: {
          verification: { result: 'unknown' },
          retryCount: 2,
          failureCategory: 'timeout',
          elapsedMs: 180000,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId: 'needs-fix', limit: 5 }, { rootDir });
  const timeoutGate = report.recommendations.fix.find((item) => item.title === 'timeout budget gate');
  assertRecommendationShape(timeoutGate, {
    kind: 'fix',
    targetType: 'gate',
    targetId: 'gate.timeout-budget',
  });
  assert.match(timeoutGate?.nextCommand ?? '', /quality-gate pre-pr/);
  assert.equal(report.recommendations.observe.some((item) => item.title === 'insufficient sample'), true);
  assert.equal(report.recommendations.fix.some((item) => item.title === 'wire real verification results'), true);
  assert.equal(report.recommendations.promote.length, 0);
  assert.equal(report.recommendations.all.every((item) => Number.isInteger(item.priority)), true);
  assert.equal(
    report.recommendations.all.every((item, index, items) => index === 0 || items[index - 1].priority >= item.priority),
    true
  );

  const rendered = renderLearnEvalReport(report);
  assert.match(rendered, /gate\.timeout-budget/);
  assert.match(rendered, /quality-gate pre-pr/);
  assert.equal(rendered.indexOf('Fix:'), rendered.lastIndexOf('Fix:'));
  assert.equal(rendered.indexOf('Observe:'), rendered.lastIndexOf('Observe:'));
  assert.equal(rendered.indexOf('Promote:'), rendered.lastIndexOf('Promote:'));
  assert.equal(rendered.indexOf('Fix:') < rendered.indexOf('Observe:'), true);
  assert.equal(rendered.indexOf('Observe:') < rendered.indexOf('Promote:'), true);
});

test('buildLearnEvalReport routes auth failures to a concrete gate target', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'auth-fix',
    { updatedAt: '2026-03-09T04:00:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T03:00:00.000Z',
        status: 'blocked',
        summary: 'Checkpoint 1',
        nextActions: ['Wait for login'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'manual auth wall' },
          retryCount: 1,
          failureCategory: 'auth',
          elapsedMs: 45000,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T03:05:00.000Z',
        status: 'blocked',
        summary: 'Checkpoint 2',
        nextActions: ['Wait for login'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'manual auth wall' },
          retryCount: 1,
          failureCategory: 'auth',
          elapsedMs: 48000,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T03:10:00.000Z',
        status: 'blocked',
        summary: 'Checkpoint 3',
        nextActions: ['Wait for login'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'manual auth wall' },
          retryCount: 1,
          failureCategory: 'auth',
          elapsedMs: 50000,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId: 'auth-fix', limit: 5 }, { rootDir });
  const authGate = report.recommendations.fix.find((item) => item.title === 'auth preflight gate');
  assertRecommendationShape(authGate, {
    kind: 'fix',
    targetType: 'gate',
    targetId: 'gate.auth-preflight',
  });
  assert.match(authGate?.nextCommand ?? '', /quality-gate pre-pr/);
});

test('buildLearnEvalReport routes tool failures to a concrete runbook target', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'tool-fix',
    { updatedAt: '2026-03-09T05:00:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T04:00:00.000Z',
        status: 'blocked',
        summary: 'Checkpoint 1',
        nextActions: ['Inspect tooling'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'tool crash' },
          retryCount: 4,
          failureCategory: 'tool',
          elapsedMs: 22000,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T04:05:00.000Z',
        status: 'blocked',
        summary: 'Checkpoint 2',
        nextActions: ['Inspect tooling'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'tool crash' },
          retryCount: 3,
          failureCategory: 'tool',
          elapsedMs: 24000,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T04:10:00.000Z',
        status: 'blocked',
        summary: 'Checkpoint 3',
        nextActions: ['Inspect tooling'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'tool crash' },
          retryCount: 2,
          failureCategory: 'tool',
          elapsedMs: 25000,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId: 'tool-fix', limit: 5 }, { rootDir });
  const repairRunbook = report.recommendations.fix.find((item) => item.title === 'tooling repair runbook');
  assertRecommendationShape(repairRunbook, {
    kind: 'fix',
    targetType: 'runbook',
    targetId: 'runbook.tool-repair',
  });
  assert.match(repairRunbook?.nextCommand ?? '', /node scripts\/aios\.mjs doctor/);
});

test('buildLearnEvalReport surfaces dispatch evidence signals from artifacts and events', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'dispatch-signal';
  const dispatch = await writeDispatchEvidence(rootDir, sessionId, {
    seq: 1,
    ts: '2026-03-09T01:06:00.000Z',
    ok: true,
    executors: ['local-phase', 'local-merge-gate'],
    blockedJobs: 0,
  });
  await writeSession(
    rootDir,
    sessionId,
    { updatedAt: '2026-03-09T02:00:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T01:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T01:06:30.000Z',
        status: 'running',
        summary: 'Recorded dry-run evidence',
        nextActions: [],
        artifacts: [dispatch.artifactPath],
        telemetry: {
          verification: { result: 'partial', evidence: `event=${dispatch.eventId}; artifact=${dispatch.artifactPath}` },
          retryCount: 0,
          elapsedMs: 50,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T01:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 0,
          elapsedMs: 1000,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId, limit: 5 }, { rootDir });
  assert.equal(report.signals.dispatch.runs, 1);
  assert.equal(report.signals.dispatch.successfulRuns, 1);
  assert.equal(report.signals.dispatch.blockedRuns, 0);
  assert.equal(report.signals.dispatch.executorUsage.some((item) => item.executor === "local-phase"), true);
  assert.equal(report.signals.dispatch.latestArtifactPath, dispatch.artifactPath);

  const observe = report.recommendations.observe.find((item) => item.targetId === 'sample.dispatch-evidence-present');
  assertRecommendationShape(observe, {
    kind: 'observe',
    targetType: 'sample',
    targetId: 'sample.dispatch-evidence-present',
  });
  assert.equal(observe?.nextArtifact, dispatch.artifactPath);

  const rendered = renderLearnEvalReport(report);
  assert.match(rendered, /dispatch runs=1 ok=1 blocked=0/);
  assert.match(rendered, /dispatch latestArtifact=/);
});

test('buildLearnEvalReport aggregates work-item blocked ratios by item type from dispatch telemetry', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'dispatch-work-items';
  const dispatch = await writeDispatchEvidence(rootDir, sessionId, {
    seq: 1,
    ts: '2026-03-09T01:06:00.000Z',
    ok: false,
    executors: ['local-phase', 'local-merge-gate'],
    blockedJobs: 2,
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-03-09T01:06:00.000Z',
      totals: { total: 4, queued: 0, running: 0, blocked: 2, done: 2 },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
        { itemId: 'phase.implement', itemType: 'phase', role: 'implementer', status: 'blocked', failureClass: 'ownership-policy', retryClass: 'same-hypothesis' },
        { itemId: 'phase.review', itemType: 'phase', role: 'reviewer', status: 'blocked', failureClass: 'timeout', retryClass: 'none' },
        { itemId: 'merge.final-checks', itemType: 'merge-gate', role: 'merge-gate', status: 'done', failureClass: 'none', retryClass: 'none' },
      ],
    },
  });
  await writeSession(
    rootDir,
    sessionId,
    { updatedAt: '2026-03-09T02:00:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T01:00:00.000Z',
        status: 'blocked',
        summary: 'Dispatch blocked',
        nextActions: [],
        artifacts: [dispatch.artifactPath],
        telemetry: {
          verification: { result: 'failed', evidence: `event=${dispatch.eventId}; artifact=${dispatch.artifactPath}` },
          retryCount: 1,
          failureCategory: 'merge-gate-blocked',
          elapsedMs: 900,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId, limit: 5 }, { rootDir });
  assert.equal(report.signals.dispatch.workItems.total, 4);
  assert.equal(report.signals.dispatch.workItems.blocked, 2);
  assert.equal(report.signals.dispatch.workItems.done, 2);
  assert.equal(report.signals.dispatch.workItems.blockedRate, 0.5);
  assert.equal(report.signals.dispatch.workItems.byType.some((item) => item.itemType === 'phase' && item.total === 3 && item.blocked === 2), true);
  assert.equal(report.signals.dispatch.workItems.byType.some((item) => item.itemType === 'merge-gate' && item.total === 1 && item.blocked === 0), true);
  assert.equal(report.signals.dispatch.workItems.failureClasses.some((item) => item.failureClass === 'ownership-policy' && item.count === 1), true);
  assert.equal(report.signals.dispatch.workItems.failureClasses.some((item) => item.failureClass === 'timeout' && item.count === 1), true);
  assert.equal(report.signals.dispatch.workItems.retryClasses.some((item) => item.retryClass === 'same-hypothesis' && item.count === 1), true);

  const rendered = renderLearnEvalReport(report);
  assert.match(rendered, /dispatch workItems total=4 blocked=2 done=2 blockedRate=0\.5/);
  assert.match(rendered, /phase=2\/3\(0\.67\)/);
  assert.match(rendered, /dispatch workItemFailures .*ownership-policy=1/);
  assert.match(rendered, /dispatch workItemRetries .*same-hypothesis=1/);
});

test('buildLearnEvalReport routes blocked dispatch evidence to merge triage', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'dispatch-blocked';
  const dispatch = await writeDispatchEvidence(rootDir, sessionId, {
    seq: 1,
    ts: '2026-03-09T03:06:00.000Z',
    ok: false,
    executors: ['local-phase', 'local-merge-gate'],
    blockedJobs: 1,
  });
  await writeSession(
    rootDir,
    sessionId,
    { updatedAt: '2026-03-09T04:00:00.000Z', goal: 'Audit merge safety' },
    [
      {
        seq: 1,
        ts: '2026-03-09T03:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T03:06:30.000Z',
        status: 'blocked',
        summary: 'Merge gate blocked',
        nextActions: [],
        artifacts: [dispatch.artifactPath],
        telemetry: {
          verification: { result: 'failed', evidence: `event=${dispatch.eventId}; artifact=${dispatch.artifactPath}` },
          retryCount: 0,
          failureCategory: 'merge-gate-blocked',
          elapsedMs: 50,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T03:10:00.000Z',
        status: 'running',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1000,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId, limit: 5 }, { rootDir });
  assert.equal(report.signals.dispatch.runs, 1);
  assert.equal(report.signals.dispatch.blockedRuns, 1);
  assert.equal(report.signals.dispatch.blockedJobs, 1);

  const fix = report.recommendations.fix.find((item) => item.targetId === 'runbook.dispatch-merge-triage');
  assertRecommendationShape(fix, {
    kind: 'fix',
    targetType: 'runbook',
    targetId: 'runbook.dispatch-merge-triage',
  });
  assert.match(fix?.nextCommand ?? "", /--dispatch local --execute dry-run --format json/);
  assert.equal(fix?.nextArtifact, dispatch.artifactPath);

  const rendered = renderLearnEvalReport(report);
  assert.match(rendered, /runbook\.dispatch-merge-triage/);
  assert.match(rendered, /dispatch runs=1 ok=0 blocked=1/);
});

test('buildLearnEvalReport compares consecutive dispatch artifacts to surface hindsight transitions', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'dispatch-hindsight';
  await writeSession(rootDir, sessionId, { updatedAt: '2026-03-09T04:30:00.000Z' }, [
    {
      seq: 1,
      ts: '2026-03-09T04:00:00.000Z',
      status: 'running',
      summary: 'Checkpoint 1',
      nextActions: [],
      artifacts: [],
      telemetry: {
        verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
        retryCount: 0,
        elapsedMs: 900,
      },
    },
  ]);

  const phaseRun = { jobId: 'phase.plan', jobType: 'phase', role: 'planner', status: 'simulated', turnId: 'turn-plan', workItemRefs: ['wi.plan'], output: { outputType: 'handoff' } };
  const mergeDoneRun = { jobId: 'merge.final-checks', jobType: 'merge-gate', role: 'merge-gate', status: 'simulated', turnId: 'turn-merge', workItemRefs: ['wi.merge'], output: { outputType: 'merged-handoff' } };
  const mergeBlockedRun = { ...mergeDoneRun, status: 'blocked' };

  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 1,
    ts: '2026-03-09T04:06:00.000Z',
    ok: true,
    artifactName: 'dispatch-run-20260309T040600Z.json',
    jobRuns: [phaseRun, mergeDoneRun],
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-03-09T04:06:00.000Z',
      totals: { total: 2, queued: 0, running: 0, blocked: 0, done: 2 },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
        { itemId: 'merge.final-checks', itemType: 'merge-gate', role: 'merge-gate', status: 'done', failureClass: 'none', retryClass: 'none' },
      ],
    },
  });

  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 2,
    ts: '2026-03-09T04:07:00.000Z',
    ok: false,
    artifactName: 'dispatch-run-20260309T040700Z.json',
    jobRuns: [phaseRun, mergeBlockedRun],
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-03-09T04:07:00.000Z',
      totals: { total: 2, queued: 0, running: 0, blocked: 1, done: 1 },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
        { itemId: 'merge.final-checks', itemType: 'merge-gate', role: 'merge-gate', status: 'blocked', failureClass: 'ownership-policy', retryClass: 'same-hypothesis' },
      ],
    },
  });

  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 3,
    ts: '2026-03-09T04:08:00.000Z',
    ok: false,
    artifactName: 'dispatch-run-20260309T040800Z.json',
    jobRuns: [phaseRun, mergeBlockedRun],
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-03-09T04:08:00.000Z',
      totals: { total: 2, queued: 0, running: 0, blocked: 1, done: 1 },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
        { itemId: 'merge.final-checks', itemType: 'merge-gate', role: 'merge-gate', status: 'blocked', failureClass: 'ownership-policy', retryClass: 'same-hypothesis' },
      ],
    },
  });

  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 4,
    ts: '2026-03-09T04:09:00.000Z',
    ok: true,
    artifactName: 'dispatch-run-20260309T040900Z.json',
    jobRuns: [phaseRun, mergeDoneRun],
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-03-09T04:09:00.000Z',
      totals: { total: 2, queued: 0, running: 0, blocked: 0, done: 2 },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
        { itemId: 'merge.final-checks', itemType: 'merge-gate', role: 'merge-gate', status: 'done', failureClass: 'none', retryClass: 'none' },
      ],
    },
  });

  const report = await buildLearnEvalReport({ sessionId, limit: 5 }, { rootDir });
  const hindsight = report.signals.dispatch.hindsight;
  assert.equal(hindsight.pairsAnalyzed, 3);
  assert.equal(hindsight.comparedJobs, 6);
  assert.equal(hindsight.regressions, 1);
  assert.equal(hindsight.repeatedBlockedTurns, 1);
  assert.equal(hindsight.resolvedBlockedTurns, 1);
  assert.equal(hindsight.topRepeatedFailureClasses.some((item) => item.failureClass === 'ownership-policy' && item.count === 1), true);
  assert.equal(hindsight.lessons.some((item) => item.kind === 'repeat-blocked' && item.jobId === 'merge.final-checks'), true);
  assert.equal(hindsight.lessons.some((item) => item.kind === 'regression' && item.jobId === 'merge.final-checks'), true);
  assert.equal(hindsight.lessons.some((item) => Array.isArray(item.suggestedCommands) && item.suggestedCommands.some((cmd) => cmd.includes('team --resume'))), true);

  const fix = report.recommendations.fix.find((item) => item.targetId === 'runbook.dispatch-merge-triage');
  assertRecommendationShape(fix, {
    kind: 'fix',
    targetType: 'runbook',
    targetId: 'runbook.dispatch-merge-triage',
  });
  assert.match(fix?.evidence ?? '', /repeatBlocked=1/);
  assert.match(fix?.nextCommand ?? '', /orchestrate --session/);
  assert.equal(fix?.nextArtifact, report.signals.dispatch.latestArtifactPath);

  const rendered = renderLearnEvalReport(report);
  assert.match(rendered, /dispatch hindsight pairs=3 comparedJobs=6/);
  assert.match(rendered, /repeatBlocked=1 regressions=1/);
  assert.match(rendered, /topRepeatedFailureClasses ownership-policy=1/);
});

test('buildLearnEvalReport emits hindsight memo and gate draft candidates for high-confidence lesson clusters', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'dispatch-hindsight-drafts';

  await writeSession(rootDir, sessionId, { updatedAt: '2026-03-09T05:30:00.000Z' }, [
    {
      seq: 1,
      ts: '2026-03-09T05:00:00.000Z',
      status: 'blocked',
      summary: 'Merge gate repeatedly blocked',
      nextActions: [],
      artifacts: [],
      telemetry: {
        verification: { result: 'failed', evidence: 'dispatch dry-run blocked' },
        retryCount: 1,
        failureCategory: 'merge-gate-blocked',
        elapsedMs: 900,
      },
    },
  ]);

  const phaseRun = { jobId: 'phase.plan', jobType: 'phase', role: 'planner', status: 'simulated', turnId: 'turn-plan', workItemRefs: ['wi.plan'], output: { outputType: 'handoff' } };
  const mergeBlockedRun = {
    jobId: 'merge.final-checks',
    jobType: 'merge-gate',
    role: 'merge-gate',
    status: 'blocked',
    turnId: 'turn-merge',
    workItemRefs: ['wi.merge'],
    output: { outputType: 'merged-handoff' },
  };

  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 1,
    ts: '2026-03-09T05:06:00.000Z',
    ok: false,
    artifactName: 'dispatch-run-20260309T050600Z.json',
    jobRuns: [phaseRun, mergeBlockedRun],
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-03-09T05:06:00.000Z',
      totals: { total: 2, queued: 0, running: 0, blocked: 1, done: 1 },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
        { itemId: 'merge.final-checks', itemType: 'merge-gate', role: 'merge-gate', status: 'blocked', failureClass: 'ownership-policy', retryClass: 'same-hypothesis' },
      ],
    },
  });
  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 2,
    ts: '2026-03-09T05:07:00.000Z',
    ok: false,
    artifactName: 'dispatch-run-20260309T050700Z.json',
    jobRuns: [phaseRun, mergeBlockedRun],
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-03-09T05:07:00.000Z',
      totals: { total: 2, queued: 0, running: 0, blocked: 1, done: 1 },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
        { itemId: 'merge.final-checks', itemType: 'merge-gate', role: 'merge-gate', status: 'blocked', failureClass: 'ownership-policy', retryClass: 'same-hypothesis' },
      ],
    },
  });
  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 3,
    ts: '2026-03-09T05:08:00.000Z',
    ok: false,
    artifactName: 'dispatch-run-20260309T050800Z.json',
    jobRuns: [phaseRun, mergeBlockedRun],
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-03-09T05:08:00.000Z',
      totals: { total: 2, queued: 0, running: 0, blocked: 1, done: 1 },
      items: [
        { itemId: 'phase.plan', itemType: 'phase', role: 'planner', status: 'done', failureClass: 'none', retryClass: 'none' },
        { itemId: 'merge.final-checks', itemType: 'merge-gate', role: 'merge-gate', status: 'blocked', failureClass: 'ownership-policy', retryClass: 'same-hypothesis' },
      ],
    },
  });

  const report = await buildLearnEvalReport({ sessionId, limit: 5 }, { rootDir });
  assert.equal(report.signals.dispatch.hindsight.repeatedBlockedTurns, 2);

  const memoDraft = report.recommendations.observe.find((item) => item.targetId === 'draft.memo.repeat-blocked.ownership-policy');
  assertRecommendationShape(memoDraft, {
    kind: 'observe',
    targetType: 'sample',
    targetId: 'draft.memo.repeat-blocked.ownership-policy',
  });
  assert.match(memoDraft?.evidence ?? '', /lessons=2/);
  assert.match(memoDraft?.nextCommand ?? '', /memo add/);

  const gateDraft = report.recommendations.observe.find((item) => item.targetId === 'draft.gate.repeat-blocked.ownership-policy');
  assertRecommendationShape(gateDraft, {
    kind: 'observe',
    targetType: 'gate',
    targetId: 'draft.gate.repeat-blocked.ownership-policy',
  });
  assert.match(gateDraft?.evidence ?? '', /candidate=gate\.blocked-triage/);
  assert.match(gateDraft?.nextCommand ?? '', /quality-gate pre-pr/);

  const skillDraft = report.recommendations.observe.find((item) => item.targetId === 'draft.skill.repeat-blocked.ownership-policy');
  assertRecommendationShape(skillDraft, {
    kind: 'observe',
    targetType: 'sample',
    targetId: 'draft.skill.repeat-blocked.ownership-policy',
  });
  assert.match(skillDraft?.evidence ?? '', /skill=skill-constraints/);
  assert.equal(skillDraft?.draftAction?.kind, 'skill-candidate');
  assert.equal(skillDraft?.draftAction?.skillId, 'skill-constraints');
  assert.equal(skillDraft?.draftAction?.failureClass, 'ownership-policy');
  assert.equal(skillDraft?.draftAction?.lessonKind, 'repeat-blocked');
  assert.equal(skillDraft?.draftAction?.artifactDraft?.kind, 'learn-eval.skill-candidate');
  assert.equal(skillDraft?.draftAction?.artifactDraft?.candidate?.skillId, 'skill-constraints');
  assert.equal(skillDraft?.draftAction?.artifactDraft?.lessonCluster?.failureClass, 'ownership-policy');

  const rendered = renderLearnEvalReport(report);
  assert.match(rendered, /draft\.memo\.repeat-blocked\.ownership-policy/);
  assert.match(rendered, /draft\.gate\.repeat-blocked\.ownership-policy/);
  assert.match(rendered, /draft\.skill\.repeat-blocked\.ownership-policy/);
});

test('runLearnEval preserves json and text output modes', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'stable-json',
    { updatedAt: '2026-03-09T06:00:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T05:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1000,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T05:05:00.000Z',
        status: 'done',
        summary: 'Checkpoint 2',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1100,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T05:10:00.000Z',
        status: 'done',
        summary: 'Checkpoint 3',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          elapsedMs: 1200,
        },
      },
    ]
  );

  const jsonLogs = [];
  await runLearnEval(
    { sessionId: 'stable-json', format: 'json' },
    { rootDir, io: { log: (line) => jsonLogs.push(line) } }
  );
  const parsed = JSON.parse(jsonLogs.join('\n'));
  assert.equal(Array.isArray(parsed.recommendations.all), true);
  assertRecommendationShape(parsed.recommendations.all[0], {
    kind: 'promote',
    targetType: 'blueprint',
    targetId: 'blueprint.feature',
  });

  const textLogs = [];
  await runLearnEval(
    { sessionId: 'stable-json', format: 'text' },
    { rootDir, io: { log: (line) => textLogs.push(line) } }
  );
  const textOutput = textLogs.join('\n');
  assert.match(textOutput, /AIOS LEARN-EVAL/);
  assert.equal(textOutput.indexOf('Fix:') < textOutput.indexOf('Observe:'), true);
  assert.equal(textOutput.indexOf('Observe:') < textOutput.indexOf('Promote:'), true);
});

test('runLearnEval apply-draft executes selected draft recommendation via injected executor', async () => {
  const rootDir = await makeRootDir();
  const logs = [];
  const calls = [];
  const report = {
    session: {
      sessionId: 'draft-session',
      agent: 'codex-cli',
      project: 'rex-ai-boot',
      goal: 'Draft apply smoke',
      updatedAt: '2026-03-09T07:00:00.000Z',
    },
    sample: { totalCheckpoints: 1, analyzedCheckpoints: 1, telemetryCheckpoints: 1, limit: 10 },
    status: { counts: { running: 0, blocked: 1, done: 0 } },
    signals: {
      verification: { counts: { unknown: 0, passed: 0, failed: 1, partial: 0 }, knownCount: 1, passRate: 0, unknownRate: 0 },
      retry: { total: 0, average: 0, max: 0 },
      elapsed: { average: 100, max: 100 },
      failures: { top: [] },
      cost: { inputTokens: 0, outputTokens: 0, totalTokens: 0, usd: 0 },
      dispatch: { runs: 0, successfulRuns: 0, blockedRuns: 0, blockedJobs: 0, executorUsage: [], workItems: { total: 0, blocked: 0, done: 0, blockedRate: 0, byType: [], failureClasses: [], retryClasses: [] }, latestArtifactPath: null, latestEventId: null },
    },
    recommendations: {
      all: [
        {
          kind: 'observe',
          targetType: 'sample',
          targetId: 'draft.memo.repeat-blocked.ownership-policy',
          title: 'hindsight memo candidate',
          reason: 'Draft memo',
          evidence: 'lessons=2',
          priority: 220,
          nextCommand: 'node scripts/aios.mjs memo add "draft text"',
          draftAction: { kind: 'memo-add', text: 'draft text' },
        },
      ],
      fix: [],
      observe: [],
      promote: [],
    },
  };

  await runLearnEval(
    {
      sessionId: 'draft-session',
      format: 'json',
      applyDraftId: 'draft.memo.repeat-blocked.ownership-policy',
      applyDryRun: true,
    },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      persistHindsightEvidence: async () => null,
      buildReport: async () => ({ ...report }),
      executeDrafts: async (items, options) => {
        calls.push({ items, options });
        return {
          mode: 'single',
          dryRun: options.dryRun,
          selectedTargetIds: items.map((item) => item.targetId),
          counts: { selected: 1, applied: 0, failed: 0, skipped: 0, dryRun: 1 },
          results: [{ targetId: items[0].targetId, status: 'dry-run', summary: 'Would apply draftAction: memo-add' }],
        };
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].items.length, 1);
  assert.equal(calls[0].items[0].targetId, 'draft.memo.repeat-blocked.ownership-policy');
  assert.equal(calls[0].options.sessionId, 'draft-session');
  assert.equal(calls[0].options.dryRun, true);

  const parsed = JSON.parse(logs.join('\n'));
  assert.equal(parsed.draftApply.mode, 'single');
  assert.equal(parsed.draftApply.dryRun, true);
  assert.equal(parsed.draftApply.counts.selected, 1);
  assert.equal(parsed.draftApply.counts.dryRun, 1);
});

test('runLearnEval apply-drafts dry-run includes skill-candidate draft actions', async () => {
  const rootDir = await makeRootDir();
  const logs = [];

  await runLearnEval(
    {
      sessionId: 'draft-session',
      format: 'json',
      applyDrafts: true,
      applyDryRun: true,
    },
    {
      rootDir,
      io: { log: (line) => logs.push(line) },
      persistHindsightEvidence: async () => null,
      buildReport: async () => ({
        session: {
          sessionId: 'draft-session',
          agent: 'codex-cli',
          project: 'rex-ai-boot',
          goal: 'Skill candidate draft',
          updatedAt: '2026-03-09T07:30:00.000Z',
        },
        sample: { totalCheckpoints: 1, analyzedCheckpoints: 1, telemetryCheckpoints: 1, limit: 10 },
        status: { counts: { running: 0, blocked: 1, done: 0 } },
        signals: {
          verification: { counts: { unknown: 0, passed: 0, failed: 1, partial: 0 }, knownCount: 1, passRate: 0, unknownRate: 0 },
          retry: { total: 0, average: 0, max: 0 },
          elapsed: { average: 100, max: 100 },
          failures: { top: [] },
          cost: { inputTokens: 0, outputTokens: 0, totalTokens: 0, usd: 0 },
          dispatch: { runs: 0, successfulRuns: 0, blockedRuns: 0, blockedJobs: 0, executorUsage: [], workItems: { total: 0, blocked: 0, done: 0, blockedRate: 0, byType: [], failureClasses: [], retryClasses: [] }, latestArtifactPath: null, latestEventId: null },
        },
        recommendations: {
          all: [
            {
              kind: 'observe',
              targetType: 'sample',
              targetId: 'draft.skill.repeat-blocked.ownership-policy',
              title: 'hindsight skill patch candidate',
              reason: 'Draft skill patch',
              evidence: 'lessons=2 skill=skill-constraints',
              priority: 214,
              nextCommand: 'node scripts/aios.mjs memo add "skill-candidate"',
              draftAction: {
                kind: 'skill-candidate',
                skillId: 'skill-constraints',
                scope: 'ownership-policy',
                text: '[skill-candidate] session=draft-session',
              },
            },
          ],
          fix: [],
          observe: [],
          promote: [],
        },
      }),
    }
  );

  const parsed = JSON.parse(logs.join('\n'));
  assert.equal(parsed.draftApply.mode, 'all');
  assert.equal(parsed.draftApply.counts.selected, 1);
  assert.equal(parsed.draftApply.counts.dryRun, 1);
  assert.equal(parsed.draftApply.results[0].targetId, 'draft.skill.repeat-blocked.ownership-policy');
  assert.match(parsed.draftApply.results[0].summary ?? '', /skill-candidate/);
});

test('runLearnEval apply-draft persists skill-candidate artifact for manual review', { concurrency: false }, async () => {
  const rootDir = await makeRootDir();
  const logs = [];
  const cwdBefore = process.cwd();

  try {
    process.chdir(rootDir);
    await runLearnEval(
      {
        sessionId: 'draft-session',
        format: 'json',
        applyDraftId: 'draft.skill.repeat-blocked.ownership-policy',
      },
      {
        rootDir,
        io: { log: (line) => logs.push(line) },
        persistHindsightEvidence: async () => null,
        buildReport: async () => ({
          session: {
            sessionId: 'draft-session',
            agent: 'codex-cli',
            project: 'rex-ai-boot',
            goal: 'Skill candidate apply',
            updatedAt: '2026-03-09T07:45:00.000Z',
          },
          sample: { totalCheckpoints: 1, analyzedCheckpoints: 1, telemetryCheckpoints: 1, limit: 10 },
          status: { counts: { running: 0, blocked: 1, done: 0 } },
          signals: {
            verification: { counts: { unknown: 0, passed: 0, failed: 1, partial: 0 }, knownCount: 1, passRate: 0, unknownRate: 0 },
            retry: { total: 0, average: 0, max: 0 },
            elapsed: { average: 100, max: 100 },
            failures: { top: [] },
            cost: { inputTokens: 0, outputTokens: 0, totalTokens: 0, usd: 0 },
            dispatch: { runs: 0, successfulRuns: 0, blockedRuns: 0, blockedJobs: 0, executorUsage: [], workItems: { total: 0, blocked: 0, done: 0, blockedRate: 0, byType: [], failureClasses: [], retryClasses: [] }, latestArtifactPath: null, latestEventId: null },
          },
          recommendations: {
            all: [
              {
                kind: 'observe',
                targetType: 'sample',
                targetId: 'draft.skill.repeat-blocked.ownership-policy',
                title: 'hindsight skill patch candidate',
                reason: 'Draft skill patch',
                evidence: 'lessons=2 skill=skill-constraints',
                priority: 214,
                nextCommand: 'node scripts/aios.mjs memo add "skill-candidate"',
                draftAction: {
                  kind: 'skill-candidate',
                  skillId: 'skill-constraints',
                  scope: 'ownership-policy',
                  failureClass: 'ownership-policy',
                  lessonKind: 'repeat-blocked',
                  patchHint: 'Add ownership boundary preflight guidance.',
                  text: '[skill-candidate] session=draft-session kind=repeat-blocked failure=ownership-policy skill=skill-constraints scope=ownership-policy',
                  artifactDraft: {
                    schemaVersion: 1,
                    kind: 'learn-eval.skill-candidate',
                    sessionId: 'draft-session',
                    generatedAt: '2026-03-09T07:45:00.000Z',
                    lessonCluster: {
                      kind: 'repeat-blocked',
                      failureClass: 'ownership-policy',
                      count: 2,
                      jobIds: ['merge.final-checks'],
                      workItemRefs: ['merge.final-checks'],
                      hints: ['Add ownership boundary preflight guidance.'],
                    },
                    candidate: {
                      skillId: 'skill-constraints',
                      scope: 'ownership-policy',
                      patchHint: 'Add ownership boundary preflight guidance.',
                    },
                    evidence: {
                      sourceArtifactPath: '.aios/context-db/sessions/draft-session/artifacts/dispatch-run-20260309T050800Z.json',
                    },
                    review: {
                      status: 'candidate',
                      mode: 'manual',
                      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
                    },
                  },
                },
              },
            ],
            fix: [],
            observe: [],
            promote: [],
          },
        }),
      }
    );
  } finally {
    process.chdir(cwdBefore);
  }

  const parsed = JSON.parse(logs.join('\n'));
  assert.equal(parsed.draftApply.counts.applied, 1);
  assert.equal(parsed.draftApply.counts.failed, 0);
  assert.equal(parsed.draftApply.results[0].status, 'applied');
  assert.match(parsed.draftApply.results[0].summary ?? '', /Memo added:/);

  const artifactsDir = path.join(rootDir, '.aios', 'context-db', 'sessions', 'draft-session', 'artifacts');
  const artifactEntries = await fs.readdir(artifactsDir);
  const artifactName = artifactEntries.find((entry) => entry.startsWith('skill-candidate-') && entry.endsWith('.json'));
  assert.ok(artifactName);

  const artifactPayload = JSON.parse(await fs.readFile(path.join(artifactsDir, artifactName), 'utf8'));
  assert.equal(artifactPayload.kind, 'learn-eval.skill-candidate');
  assert.equal(artifactPayload.sessionId, 'draft-session');
  assert.equal(artifactPayload.candidate.skillId, 'skill-constraints');
  assert.equal(artifactPayload.lessonCluster.failureClass, 'ownership-policy');
  assert.match(String(artifactPayload.evidence.sourceMemoText || ''), /\[skill-candidate]/);
});

test('runLearnEval apply-draft fails for unknown draft target id', async () => {
  const rootDir = await makeRootDir();
  await assert.rejects(
    runLearnEval(
      {
        sessionId: 'draft-session',
        format: 'json',
        applyDraftId: 'draft.memo.unknown',
      },
      {
        rootDir,
        io: { log: () => {} },
        persistHindsightEvidence: async () => null,
        buildReport: async () => ({
          session: { sessionId: 'draft-session' },
          recommendations: {
            all: [
              {
                kind: 'observe',
                targetType: 'sample',
                targetId: 'draft.memo.repeat-blocked.ownership-policy',
                title: 'hindsight memo candidate',
                reason: 'Draft memo',
                evidence: 'lessons=2',
                priority: 220,
                nextCommand: 'node scripts/aios.mjs memo add "draft text"',
              },
            ],
            fix: [],
            observe: [],
            promote: [],
          },
        }),
      }
    ),
    /Unknown draft recommendation: draft\.memo\.unknown/
  );
});

test('runLearnEval persists turn-linked hindsight evidence and skips duplicate writes', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'hindsight-evidence-session';

  await writeSession(
    rootDir,
    sessionId,
    { updatedAt: '2026-03-09T01:30:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T01:00:30.000Z',
        status: 'done',
        summary: 'Dispatch ready',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'partial', evidence: 'dispatch dry-run ready' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T01:10:30.000Z',
        status: 'blocked',
        summary: 'Dispatch regressed',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'dispatch dry-run blocked' },
          retryCount: 1,
          elapsedMs: 1100,
          failureCategory: 'merge-gate-blocked',
        },
      },
    ]
  );

  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 1,
    ts: '2026-03-09T01:00:00.000Z',
    ok: true,
    blockedJobs: 0,
    artifactName: 'dispatch-run-20260309T010000Z.json',
  });
  await writeDispatchEvidence(rootDir, sessionId, {
    seq: 2,
    ts: '2026-03-09T01:10:00.000Z',
    ok: false,
    blockedJobs: 1,
    artifactName: 'dispatch-run-20260309T011000Z.json',
  });

  const logs = [];
  await runLearnEval(
    { sessionId, format: 'json' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.join('\n'));
  assert.equal(report.hindsightEvidence?.persisted, true);
  assert.equal(report.hindsightEvidence?.eventKind, 'orchestration.hindsight-eval');
  assert.equal(report.hindsightEvidence?.parentTurnId, 'dispatch:20260309T011000Z:summary');

  const eventsPath = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId, 'l2-events.jsonl');
  const rows = (await fs.readFile(eventsPath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const hindsightRows = rows.filter((item) => item.kind === 'orchestration.hindsight-eval');
  assert.equal(hindsightRows.length, 1);
  const hindsightEvent = hindsightRows[0];
  assert.equal(hindsightEvent.turn?.turnType, 'verification');
  assert.equal(hindsightEvent.turn?.environment, 'learn-eval');
  assert.equal(hindsightEvent.turn?.hindsightStatus, 'evaluated');
  assert.equal(hindsightEvent.turn?.parentTurnId, 'dispatch:20260309T011000Z:summary');
  assert.equal(Array.isArray(hindsightEvent.turn?.nextStateRefs), true);
  assert.equal(
    Array.isArray(hindsightEvent.refs) && hindsightEvent.refs.some((item) => String(item).startsWith('hindsight-summary:20260309T011000Z')),
    true
  );

  const logsSecond = [];
  await runLearnEval(
    { sessionId, format: 'json' },
    { rootDir, io: { log: (line) => logsSecond.push(line) } }
  );
  const reportSecond = JSON.parse(logsSecond.join('\n'));
  assert.equal(reportSecond.hindsightEvidence?.persisted, false);
  assert.equal(reportSecond.hindsightEvidence?.reason, 'already-recorded');

  const rowsSecond = (await fs.readFile(eventsPath, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const hindsightRowsSecond = rowsSecond.filter((item) => item.kind === 'orchestration.hindsight-eval');
  assert.equal(hindsightRowsSecond.length, 1);
});

test('buildLearnEvalReport ignores non-dispatch verification artifacts', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'dispatch-ignore-quality-gate';
  const dispatch = await writeDispatchEvidence(rootDir, sessionId, {
    seq: 1,
    ts: '2026-03-09T01:06:00.000Z',
    ok: true,
    executors: ['local-phase', 'local-merge-gate'],
    blockedJobs: 0,
  });
  const qualityArtifactPath = path.join('.aios', 'context-db', 'sessions', sessionId, 'artifacts', 'quality-gate-20260309T020000Z.json');
  const qualityArtifactAbsPath = path.join(rootDir, qualityArtifactPath);
  await fs.mkdir(path.dirname(qualityArtifactAbsPath), { recursive: true });
  await fs.writeFile(
    qualityArtifactAbsPath,
    `${JSON.stringify({ schemaVersion: 1, kind: 'verification.quality-gate', sessionId, ok: false }, null, 2)}\n`,
    'utf8'
  );

  await writeSession(
    rootDir,
    sessionId,
    { updatedAt: '2026-03-09T02:10:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T01:00:00.000Z',
        status: 'done',
        summary: 'Checkpoint 1',
        nextActions: [],
        artifacts: [],
        telemetry: {
          verification: { result: 'passed', evidence: 'quality-gate quick' },
          retryCount: 0,
          elapsedMs: 900,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T01:06:30.000Z',
        status: 'running',
        summary: 'Recorded dry-run evidence',
        nextActions: [],
        artifacts: [dispatch.artifactPath],
        telemetry: {
          verification: { result: 'partial', evidence: `event=${dispatch.eventId}; artifact=${dispatch.artifactPath}` },
          retryCount: 0,
          elapsedMs: 50,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T02:00:00.000Z',
        status: 'blocked',
        summary: 'Quality gate failed',
        nextActions: [],
        artifacts: [qualityArtifactPath],
        telemetry: {
          verification: { result: 'failed', evidence: `mode=full; profile=standard; artifact=${qualityArtifactPath}; checks=Git:FAIL` },
          retryCount: 0,
          elapsedMs: 100,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId, limit: 5 }, { rootDir });
  assert.equal(report.signals.dispatch.runs, 1);
  assert.equal(report.signals.dispatch.latestArtifactPath, dispatch.artifactPath);
});

test('buildLearnEvalReport routes quality log failures to a concrete gate target', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'quality-logs-fix',
    { updatedAt: '2026-03-09T06:00:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T05:00:00.000Z',
        status: 'blocked',
        summary: 'Quality gate failed',
        nextActions: ['Triage logs'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          failureCategory: 'quality-logs',
          elapsedMs: 100,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T05:05:00.000Z',
        status: 'blocked',
        summary: 'Quality gate failed',
        nextActions: ['Triage logs'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          failureCategory: 'quality-logs',
          elapsedMs: 120,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T05:10:00.000Z',
        status: 'blocked',
        summary: 'Quality gate failed',
        nextActions: ['Triage logs'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          failureCategory: 'quality-logs',
          elapsedMs: 140,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId: 'quality-logs-fix', limit: 5 }, { rootDir });
  const gate = report.recommendations.fix.find((item) => item.targetId === 'gate.quality-log-audit');
  assertRecommendationShape(gate, {
    kind: 'fix',
    targetType: 'gate',
    targetId: 'gate.quality-log-audit',
  });
  assert.equal(report.recommendations.fix.some((item) => item.targetId === 'gate.blocked-triage'), false);
});

test('buildLearnEvalReport routes ContextDB quality regressions to a concrete gate target', async () => {
  const rootDir = await makeRootDir();
  await writeSession(
    rootDir,
    'quality-contextdb-fix',
    { updatedAt: '2026-03-09T06:30:00.000Z' },
    [
      {
        seq: 1,
        ts: '2026-03-09T06:00:00.000Z',
        status: 'blocked',
        summary: 'Context pack regression',
        nextActions: ['Repair ContextDB pack'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          failureCategory: 'quality-contextdb',
          elapsedMs: 100,
        },
      },
      {
        seq: 2,
        ts: '2026-03-09T06:05:00.000Z',
        status: 'blocked',
        summary: 'Context pack regression',
        nextActions: ['Repair ContextDB pack'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          failureCategory: 'quality-contextdb',
          elapsedMs: 120,
        },
      },
      {
        seq: 3,
        ts: '2026-03-09T06:10:00.000Z',
        status: 'blocked',
        summary: 'Context pack regression',
        nextActions: ['Repair ContextDB pack'],
        artifacts: [],
        telemetry: {
          verification: { result: 'failed', evidence: 'quality-gate pre-pr' },
          retryCount: 0,
          failureCategory: 'quality-contextdb',
          elapsedMs: 140,
        },
      },
    ]
  );

  const report = await buildLearnEvalReport({ sessionId: 'quality-contextdb-fix', limit: 5 }, { rootDir });
  const gate = report.recommendations.fix.find((item) => item.targetId === 'gate.quality-contextdb');
  assertRecommendationShape(gate, {
    kind: 'fix',
    targetType: 'gate',
    targetId: 'gate.quality-contextdb',
  });
});
