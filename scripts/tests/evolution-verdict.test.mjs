import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createVerdict,
  evaluateVerdict,
  validateVerdictSchema,
  writeVerdict,
  readVerdict,
  listVerdicts,
  HARD_CHECKS,
  DECISION_VALUES,
} from '../lib/lifecycle/evolution/verdict.mjs';

async function withWorkspace(prefix, fn) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(workspaceRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

const GOOD_CHECKS = {
  schema: 'pass',
  safety: 'pass',
  scope: 'pass',
  functional: 'pass',
  tests: 'pass',
  holdout: 'pass',
  regression: 'pass',
};

const GOOD_METRICS = {
  baselineSuccessRate: 0.70,
  candidateSuccessRate: 0.85,
  baselineAvgTokens: 10000,
  candidateAvgTokens: 9600,
  baselineUserCorrections: 4,
  candidateUserCorrections: 2,
};

// ── Schema validation ──

test('verdict schema: valid verdict passes', () => {
  const verdict = createVerdict({
    candidateId: 'cand-001',
    baselineVersion: 'skill-v3',
    candidateVersion: 'skill-v4',
    checks: GOOD_CHECKS,
    metrics: GOOD_METRICS,
    evidenceRefs: ['ev-001'],
  });
  const result = validateVerdictSchema(verdict);
  assert.equal(result.valid, true);
});

test('verdict schema: missing candidateId fails', () => {
  const verdict = createVerdict({
    candidateId: '',
    baselineVersion: 'skill-v3',
    candidateVersion: 'skill-v4',
    checks: GOOD_CHECKS,
    metrics: GOOD_METRICS,
  });
  const result = validateVerdictSchema(verdict);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('candidateId'));
});

test('verdict schema: missing baselineVersion fails', () => {
  const verdict = createVerdict({
    candidateId: 'cand-002',
    baselineVersion: '',
    candidateVersion: 'skill-v4',
    checks: GOOD_CHECKS,
    metrics: GOOD_METRICS,
  });
  const result = validateVerdictSchema(verdict);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('baselineVersion'));
});

test('verdict schema: invalid check value fails', () => {
  const verdict = createVerdict({
    candidateId: 'cand-003',
    baselineVersion: 'skill-v3',
    candidateVersion: 'skill-v4',
    checks: { ...GOOD_CHECKS, safety: 'maybe' },
    metrics: GOOD_METRICS,
  });
  const result = validateVerdictSchema(verdict);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('checks.safety'));
});

test('verdict schema: null input fails', () => {
  const result = validateVerdictSchema(null);
  assert.equal(result.valid, false);
});

// ── Verdict evaluation ──

test('evaluate: all checks pass with improvement -> canary', () => {
  const verdict = createVerdict({
    candidateId: 'cand-good',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: GOOD_CHECKS,
    metrics: GOOD_METRICS,
  });
  const result = evaluateVerdict(verdict);
  assert.equal(result.decision, 'canary');
});

test('evaluate: safety fail -> blocked', () => {
  const verdict = createVerdict({
    candidateId: 'cand-unsafe',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: { ...GOOD_CHECKS, safety: 'fail' },
    metrics: GOOD_METRICS,
  });
  const result = evaluateVerdict(verdict);
  assert.equal(result.decision, 'blocked');
  assert.ok(result.blockedReason.includes('Safety'));
});

test('evaluate: scope fail -> blocked', () => {
  const verdict = createVerdict({
    candidateId: 'cand-scope',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: { ...GOOD_CHECKS, scope: 'fail' },
    metrics: GOOD_METRICS,
  });
  const result = evaluateVerdict(verdict);
  assert.equal(result.decision, 'blocked');
  assert.ok(result.blockedReason.includes('Scope'));
});

test('evaluate: functional fail -> reject', () => {
  const verdict = createVerdict({
    candidateId: 'cand-func-fail',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: { ...GOOD_CHECKS, functional: 'fail' },
    metrics: GOOD_METRICS,
  });
  const result = evaluateVerdict(verdict);
  assert.equal(result.decision, 'reject');
  assert.ok(result.rejectReason.includes('functional'));
});

test('evaluate: tests fail -> reject', () => {
  const verdict = createVerdict({
    candidateId: 'cand-test-fail',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: { ...GOOD_CHECKS, tests: 'fail' },
    metrics: GOOD_METRICS,
  });
  const result = evaluateVerdict(verdict);
  assert.equal(result.decision, 'reject');
});

test('evaluate: candidate worse than baseline -> reject', () => {
  const verdict = createVerdict({
    candidateId: 'cand-regression',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: GOOD_CHECKS,
    metrics: { ...GOOD_METRICS, candidateSuccessRate: 0.50 },
  });
  const result = evaluateVerdict(verdict);
  assert.equal(result.decision, 'reject');
  assert.ok(result.rejectReason.includes('lower than baseline'));
});

test('evaluate: no clear improvement -> needs_review', () => {
  const verdict = createVerdict({
    candidateId: 'cand-neutral',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: GOOD_CHECKS,
    metrics: {
      baselineSuccessRate: 0.80,
      candidateSuccessRate: 0.80,
      baselineAvgTokens: 10000,
      candidateAvgTokens: 10000,
      baselineUserCorrections: 3,
      candidateUserCorrections: 3,
    },
  });
  const result = evaluateVerdict(verdict);
  assert.equal(result.decision, 'needs_review');
});

test('evaluate: token efficiency improvement -> canary', () => {
  const verdict = createVerdict({
    candidateId: 'cand-tokens',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: GOOD_CHECKS,
    metrics: {
      baselineSuccessRate: 0.80,
      candidateSuccessRate: 0.80,
      baselineAvgTokens: 10000,
      candidateAvgTokens: 8000,
      baselineUserCorrections: 3,
      candidateUserCorrections: 3,
    },
  });
  const result = evaluateVerdict(verdict);
  assert.equal(result.decision, 'canary');
});

test('evaluate: fewer user corrections -> canary', () => {
  const verdict = createVerdict({
    candidateId: 'cand-corrections',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: GOOD_CHECKS,
    metrics: {
      baselineSuccessRate: 0.80,
      candidateSuccessRate: 0.80,
      baselineAvgTokens: 10000,
      candidateAvgTokens: 10000,
      baselineUserCorrections: 5,
      candidateUserCorrections: 2,
    },
  });
  const result = evaluateVerdict(verdict);
  assert.equal(result.decision, 'canary');
});

// ── Verdict persistence ──

test('writeVerdict + readVerdict round-trip', async () => {
  await withWorkspace('aios-verdict-rw-', async (workspaceRoot) => {
    const verdict = createVerdict({
      candidateId: 'cand-persist',
      baselineVersion: 'v1',
      candidateVersion: 'v2',
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
      evidenceRefs: ['ev-001', 'ev-002'],
    });

    const written = await writeVerdict(workspaceRoot, verdict);
    assert.equal(written.decision, 'canary');

    const read = await readVerdict(workspaceRoot, 'cand-persist');
    assert.deepEqual(read, written);
  });
});

test('readVerdict returns null for missing candidate', async () => {
  await withWorkspace('aios-verdict-missing-', async (workspaceRoot) => {
    const read = await readVerdict(workspaceRoot, 'nonexistent');
    assert.equal(read, null);
  });
});

test('writeVerdict rejects invalid schema', async () => {
  await withWorkspace('aios-verdict-invalid-', async (workspaceRoot) => {
    const verdict = createVerdict({
      candidateId: '',
      baselineVersion: 'v1',
      candidateVersion: 'v2',
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
    });

    await assert.rejects(
      () => writeVerdict(workspaceRoot, verdict),
      /Invalid verdict/
    );
  });
});

test('listVerdicts returns all verdicts sorted by date', async () => {
  await withWorkspace('aios-verdict-list-', async (workspaceRoot) => {
    const v1 = createVerdict({
      candidateId: 'cand-first',
      baselineVersion: 'v1',
      candidateVersion: 'v2',
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
    });
    const v2 = createVerdict({
      candidateId: 'cand-second',
      baselineVersion: 'v1',
      candidateVersion: 'v3',
      checks: GOOD_CHECKS,
      metrics: { ...GOOD_METRICS, candidateSuccessRate: 0.90 },
    });

    await writeVerdict(workspaceRoot, v1);
    await writeVerdict(workspaceRoot, v2);

    const all = await listVerdicts(workspaceRoot);
    assert.equal(all.length, 2);
    // Most recent first
    assert.ok(new Date(all[0].createdAt) >= new Date(all[1].createdAt));
  });
});

test('listVerdicts returns empty array when no verdicts exist', async () => {
  await withWorkspace('aios-verdict-empty-', async (workspaceRoot) => {
    const all = await listVerdicts(workspaceRoot);
    assert.deepEqual(all, []);
  });
});

test('verdict hash is deterministic', () => {
  const v1 = createVerdict({
    candidateId: 'cand-hash',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: GOOD_CHECKS,
    metrics: GOOD_METRICS,
  });
  const v2 = createVerdict({
    candidateId: 'cand-hash',
    baselineVersion: 'v1',
    candidateVersion: 'v2',
    checks: GOOD_CHECKS,
    metrics: GOOD_METRICS,
  });

  assert.equal(v1.verdictHash, v2.verdictHash);
});

// ── Hard checks coverage ──

test('HARD_CHECKS includes all required dimensions', () => {
  assert.ok(HARD_CHECKS.includes('schema'));
  assert.ok(HARD_CHECKS.includes('safety'));
  assert.ok(HARD_CHECKS.includes('scope'));
  assert.ok(HARD_CHECKS.includes('functional'));
  assert.ok(HARD_CHECKS.includes('tests'));
  assert.ok(HARD_CHECKS.includes('holdout'));
  assert.ok(HARD_CHECKS.includes('regression'));
});

test('DECISION_VALUES includes all expected outcomes', () => {
  assert.ok(DECISION_VALUES.has('promote'));
  assert.ok(DECISION_VALUES.has('canary'));
  assert.ok(DECISION_VALUES.has('reject'));
  assert.ok(DECISION_VALUES.has('needs_review'));
  assert.ok(DECISION_VALUES.has('blocked'));
});

test('evaluate: invalid verdict input -> blocked', () => {
  const result = evaluateVerdict({ broken: true });
  assert.equal(result.decision, 'blocked');
  assert.ok(result.blockedReason.includes('Schema invalid'));
});
