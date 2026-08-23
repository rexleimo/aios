import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  importSessionCandidates,
  evaluateSessionCandidate,
  promoteSessionCandidate,
  syncPromotionGovernance,
  getUnifiedCandidateView,
} from '../lib/lifecycle/evolution/integration.mjs';
import { readPromotion, listPromotions } from '../lib/lifecycle/evolution/promotion.mjs';
import { readVerdict, listVerdicts } from '../lib/lifecycle/evolution/verdict.mjs';
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

// ── importSessionCandidates ──

test('importSessionCandidates: imports session-close candidates', async () => {
  await withWorkspace('aios-integ-import-', async (workspaceRoot) => {
    const silentLogger = { log: () => {}, error: () => {} };

    for (let i = 0; i < 3; i++) {
      const sessionId = `session-import-${i}`;
      await seedSessionEvents(workspaceRoot, sessionId, [
        { role: 'assistant', text: `Task ${i}`, ts: new Date().toISOString() },
      ]);
      await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });
    }

    const result = await importSessionCandidates(workspaceRoot, { logger: silentLogger });
    assert.equal(result.imported.length, 3);
    assert.equal(result.errors.length, 0);

    // Verify promotion records exist
    const promotions = await listPromotions(workspaceRoot);
    assert.equal(promotions.length, 3);
  });
});

test('importSessionCandidates: skips already imported', async () => {
  await withWorkspace('aios-integ-skip-', async (workspaceRoot) => {
    const silentLogger = { log: () => {}, error: () => {} };

    const sessionId = 'session-skip-001';
    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Task', ts: new Date().toISOString() },
    ]);
    await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    // Import once
    const first = await importSessionCandidates(workspaceRoot, { logger: silentLogger });
    assert.equal(first.imported.length, 1);

    // Import again — should skip
    const second = await importSessionCandidates(workspaceRoot, { logger: silentLogger });
    assert.equal(second.imported.length, 0);
    assert.equal(second.skipped.length, 1);
    assert.ok(second.skipped[0].reason.includes('already imported'));
  });
});

test('importSessionCandidates: dry run does not write', async () => {
  await withWorkspace('aios-integ-dryrun-', async (workspaceRoot) => {
    const silentLogger = { log: () => {}, error: () => {} };

    const sessionId = 'session-dryrun-001';
    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Task', ts: new Date().toISOString() },
    ]);
    await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    const result = await importSessionCandidates(workspaceRoot, { dryRun: true, logger: silentLogger });
    assert.equal(result.imported.length, 1);
    assert.ok(result.imported[0].dryRun);

    // Verify no promotion records were written
    const promotions = await listPromotions(workspaceRoot);
    assert.equal(promotions.length, 0);
  });
});

test('importSessionCandidates: handles empty workspace', async () => {
  await withWorkspace('aios-integ-empty-', async (workspaceRoot) => {
    const silentLogger = { log: () => {}, error: () => {} };
    const result = await importSessionCandidates(workspaceRoot, { logger: silentLogger });
    assert.equal(result.imported.length, 0);
    assert.equal(result.errors.length, 0);
  });
});

// ── evaluateSessionCandidate ──

test('evaluateSessionCandidate: creates verdict for session candidate', async () => {
  await withWorkspace('aios-integ-eval-', async (workspaceRoot) => {
    const sessionId = 'session-eval-001';
    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Completed task', ts: new Date().toISOString() },
    ]);
    await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    const result = await evaluateSessionCandidate(workspaceRoot, sessionId, {
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
    });

    assert.equal(result.success, true);
    assert.equal(result.candidateId, `session:${sessionId}`);
    assert.ok(result.verdictHash);
    assert.equal(result.decision, 'canary');
  });
});

test('evaluateSessionCandidate: returns error for missing candidate', async () => {
  await withWorkspace('aios-integ-eval-missing-', async (workspaceRoot) => {
    const result = await evaluateSessionCandidate(workspaceRoot, 'nonexistent-session');
    assert.ok(result.error);
    assert.ok(result.error.includes('No session-close candidate'));
  });
});

// ── promoteSessionCandidate ──

test('promoteSessionCandidate: full lifecycle import -> evaluate -> promote', async () => {
  await withWorkspace('aios-integ-full-', async (workspaceRoot) => {
    const silentLogger = { log: () => {}, error: () => {} };

    const sessionId = 'session-full-001';
    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Refactored API', ts: new Date().toISOString() },
    ]);
    await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    // Step 1: Import
    const importResult = await importSessionCandidates(workspaceRoot, { logger: silentLogger });
    assert.equal(importResult.imported.length, 1);

    // Step 2: Evaluate
    const evalResult = await evaluateSessionCandidate(workspaceRoot, sessionId, {
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
    });
    assert.equal(evalResult.success, true);

    // Step 3: Promote
    const promoResult = await promoteSessionCandidate(workspaceRoot, sessionId);
    assert.equal(promoResult.promoted, true);
    assert.equal(promoResult.status, 'canary');
  });
});

test('promoteSessionCandidate: fails without import', async () => {
  await withWorkspace('aios-integ-noimport-', async (workspaceRoot) => {
    const result = await promoteSessionCandidate(workspaceRoot, 'no-import-session');
    assert.ok(result.error);
    assert.ok(result.error.includes('No promotion record'));
  });
});

test('promoteSessionCandidate: fails without verdict', async () => {
  await withWorkspace('aios-integ-noverdict-', async (workspaceRoot) => {
    const silentLogger = { log: () => {}, error: () => {} };

    const sessionId = 'session-noverdict-001';
    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Task', ts: new Date().toISOString() },
    ]);
    await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    // Import but don't evaluate
    await importSessionCandidates(workspaceRoot, { logger: silentLogger });

    const result = await promoteSessionCandidate(workspaceRoot, sessionId);
    assert.ok(result.error);
    assert.ok(result.error.includes('No verdict'));
  });
});

// ── syncPromotionGovernance ──

test('syncPromotionGovernance: handles empty state', async () => {
  await withWorkspace('aios-integ-sync-empty-', async (workspaceRoot) => {
    const silentLogger = { log: () => {}, error: () => {} };
    const result = await syncPromotionGovernance(workspaceRoot, { logger: silentLogger });
    assert.equal(result.synced.length, 0);
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.errors.length, 0);
  });
});

test('syncPromotionGovernance: handles promotions without receipts', async () => {
  await withWorkspace('aios-integ-sync-noreceipt-', async (workspaceRoot) => {
    const silentLogger = { log: () => {}, error: () => {} };

    const sessionId = 'session-sync-001';
    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: 'Task', ts: new Date().toISOString() },
    ]);
    await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    await importSessionCandidates(workspaceRoot, { logger: silentLogger });
    await evaluateSessionCandidate(workspaceRoot, sessionId, {
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
    });
    await promoteSessionCandidate(workspaceRoot, sessionId);

    const result = await syncPromotionGovernance(workspaceRoot, { logger: silentLogger });
    // No conflicts because no governance receipts exist
    assert.equal(result.conflicts.length, 0);
  });
});

// ── getUnifiedCandidateView ──

test('getUnifiedCandidateView: combines all sources', async () => {
  await withWorkspace('aios-integ-unified-', async (workspaceRoot) => {
    const silentLogger = { log: () => {}, error: () => {} };

    // Create session candidates
    for (let i = 0; i < 2; i++) {
      const sessionId = `session-unified-${i}`;
      await seedSessionEvents(workspaceRoot, sessionId, [
        { role: 'assistant', text: `Task ${i}`, ts: new Date().toISOString() },
      ]);
      await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });
    }

    // Import and promote one
    await importSessionCandidates(workspaceRoot, { logger: silentLogger });
    await evaluateSessionCandidate(workspaceRoot, 'session-unified-0', {
      checks: GOOD_CHECKS,
      metrics: GOOD_METRICS,
    });
    await promoteSessionCandidate(workspaceRoot, 'session-unified-0');

    const view = await getUnifiedCandidateView(workspaceRoot);
    assert.ok(view.sessionClose.length >= 2);
    assert.ok(view.promotions.length >= 1);
    assert.equal(view.promotions[0].status, 'canary');
  });
});

test('getUnifiedCandidateView: handles empty workspace', async () => {
  await withWorkspace('aios-integ-unified-empty-', async (workspaceRoot) => {
    const view = await getUnifiedCandidateView(workspaceRoot);
    assert.deepEqual(view.sessionClose, []);
    assert.deepEqual(view.memo, []);
    assert.deepEqual(view.promotions, []);
    assert.deepEqual(view.dreamProposals, []);
  });
});
