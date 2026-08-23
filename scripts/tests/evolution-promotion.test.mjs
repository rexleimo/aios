import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createPromotion,
  readPromotion,
  transitionPromotion,
  promoteFromVerdict,
  rollbackPromotion,
  listPromotions,
  isTransitionAllowed,
  VALID_TRANSITIONS,
  TRUSTED_CORE_FILES,
} from '../lib/lifecycle/evolution/promotion.mjs';
import { createVerdict, writeVerdict } from '../lib/lifecycle/evolution/verdict.mjs';

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

// ── State machine ──

test('state machine: valid transitions are defined', () => {
  assert.ok(isTransitionAllowed('candidate', 'reviewing'));
  assert.ok(isTransitionAllowed('candidate', 'rejected'));
  assert.ok(isTransitionAllowed('reviewing', 'validated'));
  assert.ok(isTransitionAllowed('validated', 'proposed'));
  assert.ok(isTransitionAllowed('proposed', 'approved'));
  assert.ok(isTransitionAllowed('approved', 'canary'));
  assert.ok(isTransitionAllowed('canary', 'active'));
  assert.ok(isTransitionAllowed('active', 'stable'));
  assert.ok(isTransitionAllowed('canary', 'degraded'));
  assert.ok(isTransitionAllowed('degraded', 'rolled_back'));
});

test('state machine: invalid transitions are rejected', () => {
  assert.equal(isTransitionAllowed('candidate', 'active'), false);
  assert.equal(isTransitionAllowed('candidate', 'stable'), false);
  assert.equal(isTransitionAllowed('stable', 'candidate'), false);
  assert.equal(isTransitionAllowed('rejected', 'candidate'), false);
  assert.equal(isTransitionAllowed('active', 'candidate'), false);
});

test('state machine: rollback path is allowed', () => {
  assert.ok(isTransitionAllowed('canary', 'degraded'));
  assert.ok(isTransitionAllowed('active', 'degraded'));
  assert.ok(isTransitionAllowed('degraded', 'rolled_back'));
  assert.ok(isTransitionAllowed('rolled_back', 'candidate'));
  assert.ok(isTransitionAllowed('validation_failed', 'candidate'));
});

// ── createPromotion ──

test('createPromotion: creates a valid initial record', () => {
  const p = createPromotion({ candidateId: 'cand-001', scope: 'project', risk: 'low' });
  assert.equal(p.candidateId, 'cand-001');
  assert.equal(p.status, 'candidate');
  assert.equal(p.scope, 'project');
  assert.equal(p.risk, 'low');
  assert.equal(p.transitions.length, 1);
  assert.equal(p.transitions[0].to, 'candidate');
  assert.ok(p.createdAt);
});

test('createPromotion: requires candidateId', () => {
  assert.throws(() => createPromotion({}), /candidateId/);
});

// ── transitionPromotion ──

test('transitionPromotion: candidate -> reviewing', async () => {
  await withWorkspace('aios-promo-trans-', async (rootDir) => {
    const p = createPromotion({ candidateId: 'cand-trans-001' });
    const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', 'cand-trans-001.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(p, null, 2), 'utf8');

    const result = await transitionPromotion({
      rootDir,
      candidateId: 'cand-trans-001',
      to: 'reviewing',
      reason: 'starting review',
    });

    assert.equal(result.status, 'reviewing');
    assert.equal(result.transitions.length, 2);
    assert.equal(result.transitions[1].from, 'candidate');
    assert.equal(result.transitions[1].to, 'reviewing');
  });
});

test('transitionPromotion: rejects invalid transition', async () => {
  await withWorkspace('aios-promo-invalid-', async (rootDir) => {
    const p = createPromotion({ candidateId: 'cand-invalid' });
    const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', 'cand-invalid.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(p, null, 2), 'utf8');

    await assert.rejects(
      () => transitionPromotion({
        rootDir,
        candidateId: 'cand-invalid',
        to: 'stable',
      }),
      /Invalid transition/
    );
  });
});

test('transitionPromotion: auto-creates promotion on reviewing', async () => {
  await withWorkspace('aios-promo-auto-', async (rootDir) => {
    const result = await transitionPromotion({
      rootDir,
      candidateId: 'cand-auto',
      to: 'reviewing',
      reason: 'auto-create',
    });
    assert.equal(result.status, 'reviewing');
  });
});

test('transitionPromotion: records verdictHash', async () => {
  await withWorkspace('aios-promo-hash-', async (rootDir) => {
    const p = createPromotion({ candidateId: 'cand-hash' });
    const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', 'cand-hash.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(p, null, 2), 'utf8');

    const result = await transitionPromotion({
      rootDir,
      candidateId: 'cand-hash',
      to: 'reviewing',
      verdictHash: 'abc123',
    });
    assert.equal(result.verdictHash, 'abc123');
  });
});

test('transitionPromotion: writes audit event', async () => {
  await withWorkspace('aios-promo-audit-', async (rootDir) => {
    const p = createPromotion({ candidateId: 'cand-audit' });
    const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', 'cand-audit.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(p, null, 2), 'utf8');

    await transitionPromotion({
      rootDir,
      candidateId: 'cand-audit',
      to: 'reviewing',
    });

    const auditFile = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', 'promotion-audit.jsonl');
    const raw = await fs.readFile(auditFile, 'utf8');
    const lines = raw.trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.length >= 1);
    assert.ok(lines.some((l) => l.candidateId === 'cand-audit' && l.to === 'reviewing'));
  });
});

// ── promoteFromVerdict ──

test('promoteFromVerdict: good candidate reaches canary', async () => {
  await withWorkspace('aios-promo-good-', async (rootDir) => {
    const verdict = createVerdict({
      candidateId: 'cand-good-promo',
      baselineVersion: 'v1',
      candidateVersion: 'v2',
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
    });
    await writeVerdict(rootDir, verdict);

    const result = await promoteFromVerdict({
      rootDir,
      candidateId: 'cand-good-promo',
    });

    assert.equal(result.promoted, true);
    assert.equal(result.decision, 'canary');
    assert.equal(result.status, 'canary');
  });
});

test('promoteFromVerdict: blocked verdict rejects', async () => {
  await withWorkspace('aios-promo-blocked-', async (rootDir) => {
    const verdict = createVerdict({
      candidateId: 'cand-blocked',
      baselineVersion: 'v1',
      candidateVersion: 'v2',
      checks: { ...GOOD_CHECKS, safety: 'fail' },
      metrics: GOOD_METRICS,
    });
    await writeVerdict(rootDir, verdict);

    const result = await promoteFromVerdict({
      rootDir,
      candidateId: 'cand-blocked',
    });

    assert.equal(result.promoted, false);
  });
});

test('promoteFromVerdict: no verdict returns not promoted', async () => {
  await withWorkspace('aios-promo-noverdict-', async (rootDir) => {
    const result = await promoteFromVerdict({
      rootDir,
      candidateId: 'cand-no-verdict',
    });
    assert.equal(result.promoted, false);
    assert.ok(result.reason.includes('No verdict'));
  });
});

test('promoteFromVerdict: trusted core modification is blocked', async () => {
  await withWorkspace('aios-promo-trusted-', async (rootDir) => {
    const verdict = createVerdict({
      candidateId: 'cand-trusted',
      baselineVersion: 'v1',
      candidateVersion: 'v2',
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
      evidenceRefs: ['scripts/lib/lifecycle/evolution/verdict.mjs'],
    });
    await writeVerdict(rootDir, verdict);

    const result = await promoteFromVerdict({
      rootDir,
      candidateId: 'cand-trusted',
    });

    assert.equal(result.promoted, false);
    assert.equal(result.blocked, true);
    assert.ok(result.reason.includes('trusted core'));
  });
});

// ── rollbackPromotion ──

test('rollbackPromotion: canary -> degraded -> rolled_back', async () => {
  await withWorkspace('aios-promo-rollback-', async (rootDir) => {
    // Create a promotion and walk it to canary
    const p = createPromotion({ candidateId: 'cand-rollback', previousStableVersion: 'v1' });
    const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', 'cand-rollback.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(p, null, 2), 'utf8');

    await transitionPromotion({ rootDir, candidateId: 'cand-rollback', to: 'reviewing' });
    await transitionPromotion({ rootDir, candidateId: 'cand-rollback', to: 'validated' });
    await transitionPromotion({ rootDir, candidateId: 'cand-rollback', to: 'proposed' });
    await transitionPromotion({ rootDir, candidateId: 'cand-rollback', to: 'approved' });
    await transitionPromotion({ rootDir, candidateId: 'cand-rollback', to: 'canary' });

    const result = await rollbackPromotion({
      rootDir,
      candidateId: 'cand-rollback',
      reason: 'regression detected in canary',
    });

    assert.equal(result.rolledBack, true);
    assert.equal(result.status, 'rolled_back');
    assert.equal(result.previousStableVersion, 'v1');
  });
});

test('rollbackPromotion: cannot rollback from stable', async () => {
  await withWorkspace('aios-promo-no-rollback-', async (rootDir) => {
    const p = createPromotion({ candidateId: 'cand-stable' });
    p.status = 'stable';
    const target = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions', 'cand-stable.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(p, null, 2), 'utf8');

    const result = await rollbackPromotion({
      rootDir,
      candidateId: 'cand-stable',
    });

    assert.equal(result.rolledBack, false);
    assert.ok(result.reason.includes('Cannot rollback'));
  });
});

test('rollbackPromotion: no promotion record returns not rolled back', async () => {
  await withWorkspace('aios-promo-no-record-', async (rootDir) => {
    const result = await rollbackPromotion({
      rootDir,
      candidateId: 'cand-nonexistent',
    });
    assert.equal(result.rolledBack, false);
    assert.ok(result.reason.includes('No promotion record'));
  });
});

// ── listPromotions ──

test('listPromotions: returns all promotions sorted by date', async () => {
  await withWorkspace('aios-promo-list-', async (rootDir) => {
    const p1 = createPromotion({ candidateId: 'cand-list-1' });
    const p2 = createPromotion({ candidateId: 'cand-list-2' });

    const dir = path.join(rootDir, '.aios', 'memo', 'evolution', 'promotions');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'cand-list-1.json'), JSON.stringify(p1), 'utf8');
    await fs.writeFile(path.join(dir, 'cand-list-2.json'), JSON.stringify(p2), 'utf8');

    const all = await listPromotions(rootDir);
    assert.equal(all.length, 2);
  });
});

test('listPromotions: returns empty array when none exist', async () => {
  await withWorkspace('aios-promo-list-empty-', async (rootDir) => {
    const all = await listPromotions(rootDir);
    assert.deepEqual(all, []);
  });
});

// ── Full lifecycle ──

test('full lifecycle: candidate -> canary -> rollback -> retry', async () => {
  await withWorkspace('aios-promo-lifecycle-', async (rootDir) => {
    // Create verdict and promote
    const verdict = createVerdict({
      candidateId: 'cand-lifecycle',
      baselineVersion: 'v1',
      candidateVersion: 'v2',
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
    });
    await writeVerdict(rootDir, verdict);

    const promoted = await promoteFromVerdict({
      rootDir,
      candidateId: 'cand-lifecycle',
    });
    assert.equal(promoted.status, 'canary');

    // Rollback
    const rolledBack = await rollbackPromotion({
      rootDir,
      candidateId: 'cand-lifecycle',
      reason: 'regression',
    });
    assert.equal(rolledBack.rolledBack, true);
    assert.equal(rolledBack.status, 'rolled_back');

    // Retry: rolled_back -> candidate
    const retried = await transitionPromotion({
      rootDir,
      candidateId: 'cand-lifecycle',
      to: 'candidate',
      reason: 'retry after fix',
    });
    assert.equal(retried.status, 'candidate');

    // Verify full transition history
    assert.ok(retried.transitions.length >= 8);
  });
});

test('TRUSTED_CORE_FILES includes all protected modules', () => {
  assert.ok(TRUSTED_CORE_FILES.includes('verdict.mjs'));
  assert.ok(TRUSTED_CORE_FILES.includes('trigger.mjs'));
  assert.ok(TRUSTED_CORE_FILES.includes('promotion.mjs'));
});
