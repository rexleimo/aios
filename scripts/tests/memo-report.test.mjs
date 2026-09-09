import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildMemoryReport, renderMemoryReport } from '../lib/memo/report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(HERE, '..', 'aios.mjs');

function eventRow(eventId, space, ts, extra = {}) {
  return {
    schemaVersion: 1,
    eventId,
    ts,
    space,
    role: 'user',
    kind: 'memo',
    text: `${eventId} body text about workspace memory hygiene`,
    refs: [],
    scope: 'project_shared',
    agent: '',
    claimStatus: 'verified',
    ...extra,
  };
}

async function makeReportFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-report-'));
  const eventsDir = path.join(rootDir, '.aios', 'memo', 'file');
  await mkdir(eventsDir, { recursive: true });
  const events = [
    eventRow('ev-0001', 'default', '2026-09-01T00:00:00.000Z'),
    eventRow('ev-0002', 'default', '2026-09-02T00:00:00.000Z', { supersedes: ['ev-0001'] }),
    eventRow('ev-0003', 'default', '2026-09-03T00:00:00.000Z', { claimStatus: 'candidate' }),
    eventRow('ev-0000', 'default', '2026-08-30T00:00:00.000Z', { claimStatus: 'candidate' }),
    eventRow('ev-0004', 'other', '2026-09-04T00:00:00.000Z'),
  ];
  await writeFile(path.join(eventsDir, 'events.jsonl'), `${events.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');

  const governanceDir = path.join(rootDir, '.aios', 'context-db', 'governance');
  await mkdir(governanceDir, { recursive: true });
  const receipts = [{
    kind: 'memory.candidate-governance-receipt',
    candidateId: 'ev-0000',
    decision: 'ALLOW',
    action: 'promote',
    at: '2026-08-31T00:00:00.000Z',
    reason: 'fixture promotion',
  }];
  await writeFile(path.join(governanceDir, 'memory-candidates.jsonl'), `${receipts.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');

  const telemetryDir = path.join(rootDir, '.aios', 'context-db', 'telemetry');
  await mkdir(telemetryDir, { recursive: true });
  const feedback = [
    { kind: 'aios.memory-recall-feedback', eventId: 'ev-0002', signal: 'impression', at: '2026-09-05T00:00:00.000Z' },
    { kind: 'aios.memory-recall-feedback', eventId: 'ev-0002', signal: 'useful', at: '2026-09-05T01:00:00.000Z' },
  ];
  await writeFile(path.join(telemetryDir, 'memory-recall-feedback.jsonl'), `${feedback.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');

  const pinnedDir = path.join(eventsDir, 'pinned');
  await mkdir(pinnedDir, { recursive: true });
  await writeFile(path.join(pinnedDir, 'default.md'), `${'x'.repeat(6000)}\n`, 'utf8');
  return rootDir;
}

test('memory report aggregates spaces, invalidation, candidates, feedback, and pinned', async () => {
  const rootDir = await makeReportFixture();
  const report = await buildMemoryReport(rootDir, { now: new Date('2026-09-09T00:00:00.000Z') });

  assert.equal(report.storage, 'file');
  assert.equal(report.totals.events, 5);
  assert.equal(report.totals.spaces, 2);
  assert.equal(report.totals.superseded, 1);

  const def = report.spaces.find((space) => space.spaceKey === 'default');
  assert.ok(def, `expected default space in ${JSON.stringify(report.spaces.map((s) => s.spaceKey))}`);
  assert.equal(def.events, 4);
  assert.equal(def.superseded, 1);
  assert.ok(Math.abs(def.invalidationRatio - 0.25) < 1e-9);
  assert.equal(def.oldestTs, '2026-08-30T00:00:00.000Z');
  assert.equal(def.newestTs, '2026-09-03T00:00:00.000Z');
  assert.equal(def.impressions, 1);
  assert.equal(def.useful, 1);
  assert.ok(Math.abs(def.adoptionRate - 0.5) < 1e-9);

  const candidates = report.candidates;
  assert.equal(candidates.pending, 1, 'ev-0003 has no terminal receipt');
  assert.equal(candidates.promoted, 1, 'ev-0000 was promoted via governance receipt');
  assert.equal(candidates.backlog, 1);

  const pinned = report.pinned.find((entry) => entry.source === 'memo:file:default');
  assert.ok(pinned);
  assert.equal(pinned.truncated, true);
  assert.equal(pinned.chars, 6001);

  const rendered = renderMemoryReport(report);
  assert.match(rendered, /default: 4 events/);
  assert.match(rendered, /invalidated/);
  assert.match(rendered, /backlog 1/);
  assert.match(rendered, /adoption 50\.0%/);
  assert.match(rendered, /truncated/);
});

test('memory report is reachable through memo report and the aios memory alias', async () => {
  const rootDir = await makeReportFixture();
  const runCli = (args) => spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '' },
  });

  const memoReport = runCli(['memo', 'report', '--json']);
  assert.equal(memoReport.status, 0, memoReport.stderr || memoReport.stdout);
  const parsed = JSON.parse(String(memoReport.stdout || ''));
  assert.equal(parsed.totals.events, 5);
  assert.ok(Array.isArray(parsed.spaces));

  const alias = runCli(['memory', 'report', '--json']);
  assert.equal(alias.status, 0, alias.stderr || alias.stdout);
  const aliasParsed = JSON.parse(String(alias.stdout || ''));
  assert.equal(aliasParsed.totals.events, 5);

  const bad = runCli(['memory', 'frobnicate']);
  assert.notEqual(bad.status, 0);
  assert.match(`${bad.stderr}${bad.stdout}`, /Usage:.*memory report/u);

  const badFlag = runCli(['memo', 'report', '--frobnicate']);
  assert.notEqual(badFlag.status, 0);
  assert.match(`${badFlag.stderr}${badFlag.stdout}`, /Usage: memo report/u);
});
