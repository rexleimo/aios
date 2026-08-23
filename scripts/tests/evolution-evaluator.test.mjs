import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  evaluateCandidate,
  checkCandidateSchema,
  checkCandidateSafety,
  checkTrustedCore,
  checkBaseHash,
  checkMemoryConflict,
  checkReplay,
  checkHoldout,
} from '../lib/lifecycle/evolution/evaluator.mjs';
import { readVerdict } from '../lib/lifecycle/evolution/verdict.mjs';
import {
  baselineFixture,
  goodCandidateFixture,
  failingTrajectoryFixture,
  replayTaskFixture,
  holdoutTaskFixture,
  regressedCandidateFixture,
  holdoutRegressedFixture,
  maliciousCandidateFixture,
  conflictMemoryFixture,
  supersedeMemoryFixture,
  activeMemoryFixture,
  staleBaseHashFixture,
  trustedCoreFixture,
} from './fixtures/evolution/index.mjs';

async function withWorkspace(prefix, fn) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(workspaceRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

// ── Fixture determinism ──

test('fixtures: baseline hash is deterministic', () => {
  const b1 = baselineFixture();
  const b2 = baselineFixture();
  assert.equal(b1.hash, b2.hash);
  assert.equal(b1.metrics.successRate, 0.70);
});

test('fixtures: failing trajectory is reproducible', () => {
  const t = failingTrajectoryFixture();
  assert.equal(t.outcome, 'failure');
  assert.equal(t.steps.length, 3);
  assert.ok(t.userCorrection.includes('tests'));
});

// ── Individual checks ──

test('checkCandidateSchema: good candidate passes', () => {
  const result = checkCandidateSchema(goodCandidateFixture());
  assert.equal(result.pass, true);
});

test('checkCandidateSchema: missing evidenceRefs fails', () => {
  const c = { ...goodCandidateFixture(), evidenceRefs: [] };
  const result = checkCandidateSchema(c);
  assert.equal(result.pass, false);
  assert.ok(result.reason.includes('evidenceRefs'));
});

test('checkCandidateSchema: invalid scope fails', () => {
  const c = { ...goodCandidateFixture(), scope: 'universe' };
  const result = checkCandidateSchema(c);
  assert.equal(result.pass, false);
  assert.ok(result.reason.includes('scope'));
});

test('checkCandidateSafety: good candidate passes', () => {
  const result = checkCandidateSafety(goodCandidateFixture());
  assert.equal(result.pass, true);
});

test('checkCandidateSafety: malicious candidate fails', () => {
  const result = checkCandidateSafety(maliciousCandidateFixture());
  assert.equal(result.pass, false);
});

test('checkTrustedCore: good candidate passes', () => {
  const result = checkTrustedCore(goodCandidateFixture());
  assert.equal(result.pass, true);
});

test('checkTrustedCore: candidate touching verdict.mjs fails', () => {
  const result = checkTrustedCore(trustedCoreFixture());
  assert.equal(result.pass, false);
  assert.ok(result.reason.includes('trusted core'));
});

test('checkBaseHash: matching hash passes', () => {
  const baseline = baselineFixture();
  const result = checkBaseHash(goodCandidateFixture(baseline), baseline.hash);
  assert.equal(result.pass, true);
});

test('checkBaseHash: stale hash fails', () => {
  const baseline = baselineFixture();
  const result = checkBaseHash(staleBaseHashFixture(baseline), baseline.hash);
  assert.equal(result.pass, false);
  assert.ok(result.reason.includes('stale'));
});

test('checkMemoryConflict: conflicting memory without supersede fails', () => {
  const result = checkMemoryConflict(conflictMemoryFixture(), activeMemoryFixture());
  assert.equal(result.pass, false);
  assert.equal(result.conflicts.length, 1);
});

test('checkMemoryConflict: superseding memory passes', () => {
  const result = checkMemoryConflict(supersedeMemoryFixture(), activeMemoryFixture());
  assert.equal(result.pass, true);
  assert.equal(result.conflicts.length, 0);
});

test('checkReplay: good candidate passes replay', () => {
  const result = checkReplay(goodCandidateFixture(), replayTaskFixture());
  assert.equal(result.pass, true);
});

test('checkReplay: regressed candidate fails replay', () => {
  const result = checkReplay(regressedCandidateFixture(), replayTaskFixture());
  assert.equal(result.pass, false);
  assert.ok(result.reason.includes('replay mismatch'));
});

test('checkHoldout: good candidate passes all holdouts', () => {
  const result = checkHoldout(goodCandidateFixture(), holdoutTaskFixture());
  assert.equal(result.pass, true);
});

test('checkHoldout: empty holdout set fails', () => {
  const result = checkHoldout(goodCandidateFixture(), []);
  assert.equal(result.pass, false);
  assert.ok(result.reason.includes('at least one holdout'));
});

test('checkHoldout: holdout-regressed candidate fails', () => {
  const result = checkHoldout(holdoutRegressedFixture(), holdoutTaskFixture());
  assert.equal(result.pass, false);
  assert.ok(result.failures.length > 0);
});

// ── End-to-end evaluation ──

test('evaluateCandidate: good candidate -> canary', async () => {
  await withWorkspace('aios-e2e-good-', async (rootDir) => {
    const baseline = baselineFixture();
    const verdict = await evaluateCandidate({
      candidate: goodCandidateFixture(baseline),
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      activeMemories: [],
      rootDir,
    });

    assert.equal(verdict.decision, 'canary');
    assert.equal(verdict.checks.schema, 'pass');
    assert.equal(verdict.checks.safety, 'pass');
    assert.equal(verdict.checks.functional, 'pass');
    assert.equal(verdict.checks.holdout, 'pass');

    // Verdict persisted
    const persisted = await readVerdict(rootDir, 'cand-good-001');
    assert.equal(persisted.decision, 'canary');
  });
});

test('evaluateCandidate: replay failure -> reject', async () => {
  await withWorkspace('aios-e2e-replay-', async (rootDir) => {
    const baseline = baselineFixture();
    const verdict = await evaluateCandidate({
      candidate: regressedCandidateFixture(baseline),
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      rootDir,
    });

    assert.equal(verdict.decision, 'reject');
    assert.equal(verdict.checks.functional, 'fail');
  });
});

test('evaluateCandidate: holdout regression -> reject', async () => {
  await withWorkspace('aios-e2e-holdout-', async (rootDir) => {
    const baseline = baselineFixture();
    const candidate = holdoutRegressedFixture(baseline);
    const verdict = await evaluateCandidate({
      candidate,
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      rootDir,
    });

    assert.equal(verdict.checks.holdout, 'fail');
    assert.equal(verdict.decision, 'reject');
  });
});

test('evaluateCandidate: malicious candidate -> blocked', async () => {
  await withWorkspace('aios-e2e-malicious-', async (rootDir) => {
    const baseline = baselineFixture();
    const verdict = await evaluateCandidate({
      candidate: maliciousCandidateFixture(baseline),
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      rootDir,
    });

    assert.equal(verdict.decision, 'blocked');
    assert.ok(verdict.blockedReason.includes('dangerous pattern'));
  });
});

test('evaluateCandidate: trusted core modification -> blocked', async () => {
  await withWorkspace('aios-e2e-trusted-', async (rootDir) => {
    const baseline = baselineFixture();
    const verdict = await evaluateCandidate({
      candidate: trustedCoreFixture(baseline),
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      rootDir,
    });

    assert.equal(verdict.decision, 'blocked');
    assert.ok(verdict.blockedReason.includes('trusted core'));
  });
});

test('evaluateCandidate: stale baseHash -> blocked', async () => {
  await withWorkspace('aios-e2e-stale-', async (rootDir) => {
    const baseline = baselineFixture();
    const verdict = await evaluateCandidate({
      candidate: staleBaseHashFixture(baseline),
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      rootDir,
    });

    assert.equal(verdict.decision, 'blocked');
    assert.ok(verdict.blockedReason.includes('stale baseHash'));
  });
});

test('evaluateCandidate: unresolved memory conflict -> needs_review', async () => {
  await withWorkspace('aios-e2e-conflict-', async (rootDir) => {
    const baseline = baselineFixture();
    const verdict = await evaluateCandidate({
      candidate: conflictMemoryFixture(baseline),
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      activeMemories: activeMemoryFixture(),
      rootDir,
    });

    assert.equal(verdict.decision, 'needs_review');
    assert.ok(verdict.reviewReason.includes('conflict'));
  });
});

test('evaluateCandidate: superseding memory passes conflict check', async () => {
  await withWorkspace('aios-e2e-supersede-', async (rootDir) => {
    const baseline = baselineFixture();
    const verdict = await evaluateCandidate({
      candidate: supersedeMemoryFixture(baseline),
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      activeMemories: activeMemoryFixture(),
      rootDir,
    });

    // Should not be blocked by conflict; goes through normal evaluation
    assert.ok(['canary', 'needs_review', 'promote'].includes(verdict.decision));
    assert.equal(verdict.checkDetails.conflict, null);
  });
});

test('evaluateCandidate: metrics regression -> reject', async () => {
  await withWorkspace('aios-e2e-metrics-', async (rootDir) => {
    const baseline = baselineFixture();
    const candidate = {
      ...goodCandidateFixture(baseline),
      candidateId: 'cand-metric-regress',
      metrics: { successRate: 0.50, avgTokens: 12000, userCorrections: 8 },
    };
    const verdict = await evaluateCandidate({
      candidate,
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      rootDir,
    });

    assert.equal(verdict.checks.regression, 'fail');
    assert.equal(verdict.decision, 'reject');
  });
});

test('evaluateCandidate: repeated evaluation is deterministic', async () => {
  await withWorkspace('aios-e2e-deterministic-', async (rootDir) => {
    const baseline = baselineFixture();
    const v1 = await evaluateCandidate({
      candidate: goodCandidateFixture(baseline),
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      rootDir,
    });
    const v2 = await evaluateCandidate({
      candidate: goodCandidateFixture(baseline),
      baseline,
      replayTask: replayTaskFixture(),
      holdoutTasks: holdoutTaskFixture(),
      rootDir,
    });

    assert.equal(v1.decision, v2.decision);
    assert.equal(v1.verdictHash, v2.verdictHash);
  });
});

test('evaluateCandidate: null candidate -> blocked', async () => {
  await withWorkspace('aios-e2e-null-', async (rootDir) => {
    const verdict = await evaluateCandidate({
      candidate: null,
      baseline: baselineFixture(),
      rootDir,
    });
    assert.equal(verdict.decision, 'blocked');
  });
});
