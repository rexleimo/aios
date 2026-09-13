import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectDashboardData,
  renderDashboardHtml,
  writeHarnessDashboard,
} from '../../lib/harness/dashboard.mjs';
import { initSoloRunJournal } from '../../lib/harness/solo-journal.mjs';
import { writeSoloRunSummary } from '../../lib/harness/solo-journal/summary.mjs';

async function withRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('dashboard aggregates sessions, escapes content, and writes a read-only projection', async () => {
  await withRoot('aios-dashboard-', async (rootDir) => {
    await initSoloRunJournal({
      rootDir,
      sessionId: 'dash-1',
      objective: 'Ship the <thing> & more',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      worktree: { enabled: false, baseRef: 'HEAD', path: '', preserved: false, cleanupReason: '' },
    });
    await writeSoloRunSummary({
      rootDir,
      sessionId: 'dash-1',
      objective: 'Ship the <thing> & more',
      provider: 'codex',
      clientId: 'codex-cli',
      profile: 'standard',
      status: 'human-gate',
      iterationCount: 4,
      lastIteration: 4,
      lastOutcome: 'human-gate',
      lastFailureClass: 'ownership-gate',
      pacing: {
        quota: { spend: [{ ts: 1, slots: 1 }] },
        cadence: { cadenceClass: 'human_gate', delayMs: 100, untilMs: null },
        consecutiveNoop: 0,
        lastDecision: { action: 'ask', reasonCode: 'operator_gate', nextWakeMs: 0, cadenceClass: 'human_gate' },
      },
    });

    const data = await collectDashboardData({ rootDir });
    assert.equal(data.sessions.length, 1);
    assert.equal(data.sessions[0].status, 'human-gate');
    assert.equal(data.probes.length >= 1, true);

    const html = renderDashboardHtml(data);
    // 关键转义：objective 里的 < > & 不得原样出现在 HTML 中。
    assert.ok(!html.includes('<thing>'), 'raw angle brackets must be escaped');
    assert.ok(html.includes('&lt;thing&gt; &amp; more'));
    assert.match(html, /human-gate/);
    assert.match(html, /read-only projection/);

    const { target } = await writeHarnessDashboard({ rootDir });
    assert.ok(target.includes('dashboard.html'));
    const written = await readFile(target, 'utf8');
    assert.match(written, /AIOS Harness Dashboard/);

    // 重新生成内容稳定（纯投影，无随机状态）。
    const { data: second } = await writeHarnessDashboard({ rootDir });
    assert.equal(second.sessions.length, data.sessions.length);
  });
});
