import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseArgs } from '../lib/cli/parse-args.mjs';
import { readHudState } from '../lib/hud/state.mjs';
import { runTeamStatus } from '../lib/lifecycle/team-ops.mjs';
import {
  collectWatchdogSignals,
  buildWatchdogReadiness,
  decideWatchdogRecovery,
  runTeamWatchdog,
} from '../lib/lifecycle/watchdog.mjs';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeSessionMeta({ sessionId, updatedAt = '2026-04-25T00:00:00.000Z' }) {
  return {
    schemaVersion: 1,
    sessionId,
    agent: 'codex-cli',
    project: 'aios',
    goal: `Goal for ${sessionId}`,
    tags: [],
    status: 'running',
    createdAt: updatedAt,
    updatedAt,
  };
}

async function makeSessionRoot() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-watchdog-'));
  const sessionId = 'watchdog-session';
  const sessionDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId);
  await writeJson(path.join(sessionDir, 'meta.json'), makeSessionMeta({ sessionId }));
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-25T00:00:00.000Z',
  });
  return { rootDir, sessionId, sessionDir };
}

test('decideWatchdogRecovery observes fresh worker signals', () => {
  const decision = decideWatchdogRecovery({
    commitAgeMinutes: 4,
    fileActivityAgeMinutes: 1,
    logAgeMinutes: 1,
    cpuState: 'active',
  });

  assert.equal(decision.decision, 'observe');
  assert.match(decision.reason, /active|fresh/i);
  assert.deepEqual(decision.nextActions, []);
});

test('decideWatchdogRecovery suggests respawn when all worker signals are stale and process is dead', () => {
  const decision = decideWatchdogRecovery({
    commitAgeMinutes: 90,
    fileActivityAgeMinutes: 90,
    logAgeMinutes: 90,
    cpuState: 'dead',
    staleThresholdMinutes: 30,
  });

  assert.equal(decision.decision, 'respawn');
  assert.match(decision.reason, /stale/i);
  assert.equal(decision.signals.commitAgeMinutes, 90);
  assert.ok(decision.nextActions.some((action) => /team --resume/.test(action)));
});

test('decideWatchdogRecovery honors pause signal before recovery actions', () => {
  const decision = decideWatchdogRecovery({
    paused: true,
    commitAgeMinutes: 120,
    fileActivityAgeMinutes: 120,
    logAgeMinutes: 120,
    cpuState: 'dead',
  });

  assert.equal(decision.decision, 'pause');
  assert.match(decision.reason, /pause/i);
});

test('decideWatchdogRecovery prefers rollback suggestion for blocked jobs with rollback artifacts', () => {
  const decision = decideWatchdogRecovery({
    blockedJobs: 1,
    rollbackArtifacts: 1,
    commitAgeMinutes: 90,
    fileActivityAgeMinutes: 90,
    logAgeMinutes: 90,
    cpuState: 'unknown',
  });

  assert.equal(decision.decision, 'rollback');
  assert.match(decision.reason, /rollback/i);
  assert.ok(decision.nextActions.some((action) => /snapshot-rollback/.test(action)));
});

test('collectWatchdogSignals reads pause, dispatch, rollback, and log/file freshness', async () => {
  const { rootDir, sessionId, sessionDir } = await makeSessionRoot();
  await fs.writeFile(path.join(sessionDir, '.pause'), 'paused by operator\n', 'utf8');
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260425T000000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    dispatchRun: {
      jobRuns: [
        { jobId: 'phase.plan', status: 'completed' },
        { jobId: 'phase.implement', status: 'blocked' },
      ],
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'pre-mutation-20260425T000000Z-phase_implement', 'manifest.json'), {
    schemaVersion: 1,
    sessionId,
  });

  const signals = await collectWatchdogSignals({ rootDir, sessionId, nowMs: Date.now() });

  assert.equal(signals.paused, true);
  assert.equal(signals.blockedJobs, 1);
  assert.equal(signals.rollbackArtifacts, 1);
  assert.equal(signals.cpuState, 'unknown');
  assert.equal(typeof signals.logAgeMinutes, 'number');
  assert.equal(typeof signals.fileActivityAgeMinutes, 'number');
});

test('collectWatchdogSignals derives active or dead CPU state from worker pid evidence', async () => {
  const { rootDir, sessionId, sessionDir } = await makeSessionRoot();
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260425T000001Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    dispatchRun: {
      jobRuns: [{ jobId: 'phase.implement', status: 'running', pid: process.pid }],
    },
  });

  let signals = await collectWatchdogSignals({ rootDir, sessionId, nowMs: Date.now() });
  assert.equal(signals.cpuState, 'active');

  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260425T000002Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    dispatchRun: {
      jobRuns: [{ jobId: 'phase.implement', status: 'running', pid: 99999999 }],
    },
  });

  signals = await collectWatchdogSignals({ rootDir, sessionId, nowMs: Date.now() });
  assert.equal(signals.cpuState, 'dead');
});

test('buildWatchdogReadiness maps observe to ready', () => {
  const recovery = decideWatchdogRecovery({
    commitAgeMinutes: 2,
    fileActivityAgeMinutes: 1,
    logAgeMinutes: 1,
    cpuState: 'active',
  });
  const readiness = buildWatchdogReadiness(recovery);

  assert.equal(readiness.verdict, 'ready');
  assert.deepEqual(readiness.blockedReasons, []);
});

test('buildWatchdogReadiness maps pause to blocked', () => {
  const readiness = buildWatchdogReadiness(decideWatchdogRecovery({ paused: true }));

  assert.equal(readiness.verdict, 'blocked');
  assert.ok(readiness.blockedReasons.some((reason) => /pause/i.test(reason)));
});

test('parseArgs accepts team watchdog command and status --watchdog', () => {
  const watchdog = parseArgs(['team', 'watchdog', '--session', 's1', '--json']);
  assert.equal(watchdog.command, 'team');
  assert.equal(watchdog.options.subcommand, 'watchdog');
  assert.equal(watchdog.options.sessionId, 's1');
  assert.equal(watchdog.options.json, true);

  const status = parseArgs(['team', 'status', '--session', 's1', '--watchdog', '--json']);
  assert.equal(status.options.subcommand, 'status');
  assert.equal(status.options.watchdog, true);
  assert.equal(status.options.json, true);
});

test('runTeamWatchdog emits structured JSON decision', async () => {
  const { rootDir, sessionId, sessionDir } = await makeSessionRoot();
  await fs.writeFile(path.join(sessionDir, '.pause'), 'paused\n', 'utf8');
  const logs = [];

  const result = await runTeamWatchdog(
    { sessionId, json: true },
    { rootDir, io: { log: (line) => logs.push(String(line)) }, nowFn: () => Date.now() }
  );

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(logs.at(-1));
  assert.equal(payload.sessionId, sessionId);
  assert.equal(payload.decision, 'pause');
  assert.equal(payload.readiness.verdict, 'blocked');
});

test('runTeamStatus --watchdog includes watchdog decision in JSON state and HUD state can expose it', async () => {
  const { rootDir, sessionId, sessionDir } = await makeSessionRoot();
  await fs.writeFile(path.join(sessionDir, '.pause'), 'paused\n', 'utf8');
  const logs = [];

  const result = await runTeamStatus(
    { provider: 'codex', sessionId, json: true, watchdog: true },
    { rootDir, io: { log: (line) => logs.push(String(line)) }, nowFn: () => Date.now() }
  );

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(logs.at(-1));
  assert.equal(payload.selection?.sessionId, sessionId);
  assert.equal(payload.watchdog?.decision, 'pause');
  assert.equal(payload.watchdog?.readiness?.verdict, 'blocked');

  const state = await readHudState({ rootDir, sessionId, provider: 'codex', watchdog: true });
  assert.equal(state.selection?.sessionId, sessionId);
  assert.equal(state.watchdog?.decision, 'pause');
  assert.equal(state.watchdog?.readiness?.verdict, 'blocked');
});


test('runTeamStatus --watch --watchdog includes watchdog line in watch frames', async () => {
  const { rootDir, sessionId, sessionDir } = await makeSessionRoot();
  await fs.writeFile(path.join(sessionDir, '.pause'), 'paused\n', 'utf8');
  const frames = [];

  const result = await runTeamStatus(
    { provider: 'codex', sessionId, watch: true, watchdog: true, preset: 'minimal' },
    {
      rootDir,
      nowFn: () => Date.now(),
      watchLoop: async (render) => {
        frames.push(await render());
      },
    }
  );

  assert.equal(result.exitCode, 0);
  assert.equal(frames.length, 1);
  assert.match(frames[0], /Watchdog: decision=pause/);
});
