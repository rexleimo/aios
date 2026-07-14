import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  evaluateOwnershipEvidence,
  evaluatePlanEvidence,
  mergeReadinessVerdicts,
} from '../lib/lifecycle/preflight-contracts.mjs';
import { buildPlanMarkdown } from '../lib/planning/contract.mjs';

const COMPLETE_PLAN = `# Example Plan

## Progress
- scoped

## DecisionLog
- use explicit ownership

## Acceptance
- tests pass

## NextActions
- run focused suite
`;

test('evaluatePlanEvidence blocks when plan file is missing', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-preflight-plan-missing-'));
  try {
    const result = await evaluatePlanEvidence({ rootDir, planPath: 'docs/plans/missing.md' });
    assert.equal(result.verdict, 'blocked');
    assert.deepEqual(result.blockedReasons, ['missing_plan_artifact']);
    assert.equal(result.nextActions.some((item) => item.includes('docs/plans/missing.md')), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('evaluatePlanEvidence blocks when required headings are missing', async () => {
  const result = await evaluatePlanEvidence({ markdown: '# Plan\n\n## Progress\n- started\n' });
  assert.equal(result.verdict, 'blocked');
  assert.deepEqual(result.blockedReasons, ['missing_plan_headings']);
  assert.equal(result.warnings.some((item) => item.includes('Decision Log')), true);
  assert.equal(result.warnings.some((item) => item.includes('Acceptance')), true);
  assert.equal(result.warnings.some((item) => item.includes('Next Actions')), true);
});

test('evaluatePlanEvidence accepts complete plan markdown and compact heading aliases', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-preflight-plan-ready-'));
  try {
    const planPath = path.join('docs', 'plans', 'ready.md');
    await mkdir(path.join(rootDir, 'docs', 'plans'), { recursive: true });
    await writeFile(path.join(rootDir, planPath), COMPLETE_PLAN, 'utf8');

    const result = await evaluatePlanEvidence({ rootDir, planPath });
    assert.equal(result.verdict, 'ready');
    assert.deepEqual(result.blockedReasons, []);
    assert.equal(result.evidence[0].type, 'file');
    assert.equal(result.evidence[0].path, planPath);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('evaluatePlanEvidence accepts the canonical schema-v2 planning contract', async () => {
  const result = await evaluatePlanEvidence({
    markdown: buildPlanMarkdown({
      title: 'Canonical plan',
      objective: 'Dispatch only after policy persistence',
      client: 'codex',
      route: 'team',
      skills: ['writing-plans', 'dispatching-parallel-agents'],
      tasks: [{ id: 't1', title: 'Dispatch', status: 'pending', acceptance: 'Plan is readable' }],
    }),
  });

  assert.equal(result.verdict, 'ready');
  assert.deepEqual(result.blockedReasons, []);
  assert.match(result.evidence[0].summary, /schema-v2 planning contract/i);
});

test('evaluateOwnershipEvidence blocks write-capable work without owned paths', () => {
  const result = evaluateOwnershipEvidence({
    workItems: [
      { itemId: 'wi.docs', canEditFiles: true, ownedPathPrefixes: [] },
    ],
  });
  assert.equal(result.verdict, 'blocked');
  assert.deepEqual(result.blockedReasons, ['missing_owned_path_prefixes']);
  assert.equal(result.nextActions.some((item) => item.includes('ownedPathPrefixes')), true);
});

test('evaluateOwnershipEvidence blocks wildcard owned path prefixes', () => {
  const result = evaluateOwnershipEvidence({
    dispatchPlan: {
      jobs: [
        { jobId: 'phase.implement', launchSpec: { canEditFiles: true, ownedPathPrefixes: [''] } },
      ],
    },
  });
  assert.equal(result.verdict, 'blocked');
  assert.deepEqual(result.blockedReasons, ['wildcard_owned_path_prefixes']);
});

test('evaluateOwnershipEvidence accepts resolved editable job ownership', () => {
  const result = evaluateOwnershipEvidence({
    dispatchPlan: {
      jobs: [
        { jobId: 'phase.implement', launchSpec: { canEditFiles: true, ownedPathPrefixes: ['scripts/'] } },
        { jobId: 'phase.review', launchSpec: { canEditFiles: false, ownedPathPrefixes: [] } },
      ],
    },
  });
  assert.equal(result.verdict, 'ready');
  assert.deepEqual(result.blockedReasons, []);
  assert.equal(result.evidence.some((item) => item.summary.includes('phase.implement')), true);
});

test('mergeReadinessVerdicts preserves blocked precedence and unique details', () => {
  const result = mergeReadinessVerdicts(
    { verdict: 'ready', blockedReasons: [], warnings: [], nextActions: [], evidence: [{ type: 'inline', summary: 'ready evidence' }] },
    { verdict: 'warning', blockedReasons: [], warnings: ['soft warning'], nextActions: ['inspect warning'], evidence: [] },
    { verdict: 'blocked', blockedReasons: ['missing_plan_artifact'], warnings: ['soft warning'], nextActions: ['inspect warning', 'create plan'], evidence: [] }
  );

  assert.equal(result.verdict, 'blocked');
  assert.deepEqual(result.blockedReasons, ['missing_plan_artifact']);
  assert.deepEqual(result.warnings, ['soft warning']);
  assert.deepEqual(result.nextActions, ['inspect warning', 'create plan']);
  assert.equal(result.evidence.length, 1);
});
