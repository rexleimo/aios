import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runContextDbCli } from '../lib/contextdb-cli.mjs';
import { parseArgs } from '../lib/cli/parse-args.mjs';
import {
  getDisabledGateIds,
  isHarnessGateEnabled,
  normalizeHarnessProfile,
} from '../lib/harness/profile.mjs';
import { renderHandoffMarkdown, validateHandoffPayload } from '../lib/harness/handoff.mjs';
import { planDoctor } from '../lib/lifecycle/doctor.mjs';
import { executeEntropyGc } from '../lib/lifecycle/entropy-gc.mjs';
import { planQualityGate, runQualityGate } from '../lib/lifecycle/quality-gate.mjs';

async function makeRootDir() {
  return await mkdtemp(path.join(os.tmpdir(), 'aios-quality-gate-'));
}

function createSession(rootDir, sessionId = 'quality-session') {
  return runContextDbCli([
    'session:new',
    '--workspace',
    rootDir,
    '--agent',
    'codex-cli',
    '--project',
    'rex-ai-boot',
    '--goal',
    'Verify quality gate telemetry',
    '--session-id',
    sessionId,
  ]);
}

test('normalizeHarnessProfile accepts known profiles', () => {
  assert.equal(normalizeHarnessProfile('minimal'), 'minimal');
  assert.equal(normalizeHarnessProfile('standard'), 'standard');
  assert.equal(normalizeHarnessProfile('strict'), 'strict');
});

test('getDisabledGateIds parses comma separated gate ids', () => {
  const gates = getDisabledGateIds({ AIOS_DISABLED_GATES: 'doctor:browser, quality:logs ' });
  assert.equal(gates.has('doctor:browser'), true);
  assert.equal(gates.has('quality:logs'), true);
});

test('isHarnessGateEnabled respects profile and disabled gates', () => {
  const disabledGates = new Set(['doctor:browser']);
  assert.equal(isHarnessGateEnabled('doctor:browser', { profile: 'standard', disabledGates }), false);
  assert.equal(isHarnessGateEnabled('doctor:mcp-build', { profile: 'minimal', profiles: ['standard', 'strict'] }), false);
  assert.equal(isHarnessGateEnabled('doctor:mcp-build', { profile: 'strict', profiles: ['standard', 'strict'] }), true);
});

test('parseArgs accepts doctor profile', () => {
  const result = parseArgs(['doctor', '--strict', '--profile', 'minimal']);
  assert.equal(result.command, 'doctor');
  assert.equal(result.options.strict, true);
  assert.equal(result.options.profile, 'minimal');
});

test('parseArgs accepts quality-gate command', () => {
  const result = parseArgs(['quality-gate', 'pre-pr', '--profile', 'strict']);
  assert.equal(result.command, 'quality-gate');
  assert.equal(result.options.mode, 'pre-pr');
  assert.equal(result.options.profile, 'strict');
});

test('parseArgs accepts quality-gate session', () => {
  const result = parseArgs(['quality-gate', 'full', '--session', 'session-123']);
  assert.equal(result.command, 'quality-gate');
  assert.equal(result.options.sessionId, 'session-123');
});

test('runContextDbCli surfaces contextdb cli failures without native rebuild retries', () => {
  const calls = [];

  assert.throws(
    () => runContextDbCli(['timeline'], {
      spawnSyncImpl(command, args, options) {
        calls.push({ command, args, options });
        return {
          status: 1,
          stdout: '',
          stderr: 'contextdb failed',
        };
      },
    }),
    /contextdb failed/
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
});

test('planDoctor keeps profile out of preview when standard', () => {
  const plan = planDoctor({ strict: true });
  assert.match(plan.preview, /doctor --strict/);
  assert.doesNotMatch(plan.preview, /--profile/);
});

test('planQualityGate prints mode and profile', () => {
  const plan = planQualityGate({ mode: 'pre-pr', profile: 'strict' });
  assert.equal(plan.command, 'quality-gate');
  assert.match(plan.preview, /quality-gate pre-pr --profile strict/);
});

test('planQualityGate includes session when provided', () => {
  const plan = planQualityGate({ mode: 'full', sessionId: 'session-123' });
  assert.match(plan.preview, /quality-gate full --session session-123/);
});

test('runQualityGate log audit excludes cli entrypoints and tests', async () => {
  const rootDir = await makeRootDir();
  await mkdir(path.join(rootDir, 'scripts', 'lib', 'lifecycle'), { recursive: true });
  await mkdir(path.join(rootDir, 'scripts', 'tests'), { recursive: true });
  await mkdir(path.join(rootDir, 'mcp-server', 'src', 'contextdb'), { recursive: true });

  await writeFile(path.join(rootDir, 'scripts', 'lib', 'bad.mjs'), "console.log('bad runtime log');\n", 'utf8');
  await writeFile(path.join(rootDir, 'scripts', 'tests', 'fixture.test.mjs'), "console.log('fixture log');\n", 'utf8');
  await writeFile(path.join(rootDir, 'scripts', 'contextdb-shell-bridge.mjs'), "console.log('bridge output');\n", 'utf8');
  await writeFile(path.join(rootDir, 'scripts', 'ctx-agent-core.mjs'), "console.log('agent output');\n", 'utf8');
  await writeFile(path.join(rootDir, 'scripts', 'doctor-bootstrap-task.mjs'), "console.log('doctor output');\n", 'utf8');
  await writeFile(path.join(rootDir, 'scripts', 'lib', 'lifecycle', 'quality-gate.mjs'), "const PATTERN = 'console.log';\n", 'utf8');
  await writeFile(path.join(rootDir, 'mcp-server', 'src', 'contextdb', 'cli.ts'), "console.log('cli output');\n", 'utf8');

  const report = await runQualityGate(
    { mode: 'full' },
    {
      rootDir,
      io: { log() {} },
      env: {
        AIOS_DISABLED_GATES: 'quality:build,quality:types,quality:scripts,quality:contextdb,quality:git',
      },
    }
  );

  const logsResult = report.results.find((item) => item.label === 'Logs');
  assert.equal(logsResult?.status, 'FAIL');
  assert.equal(logsResult?.detail, '1 console.log hits');
  assert.deepEqual(report.failedChecks, ['Logs']);
  assert.equal(report.failureCategory, 'quality-logs');
});

test('runQualityGate persists verification checkpoint when session is provided', async () => {
  const rootDir = await makeRootDir();
  createSession(rootDir, 'quality-session');

  const report = await runQualityGate(
    { mode: 'full', sessionId: 'quality-session' },
    {
      rootDir,
      io: { log() {} },
      checkRunner(command, args) {
        if (command === 'npm' && args[0] === 'run' && ['build', 'typecheck', 'test:scripts', 'test:contextdb'].includes(args[1])) {
          return { status: 0, stdout: `${args[1]} ok\n`, stderr: '' };
        }
        if (command === 'rg') {
          return { status: 1, stdout: '', stderr: '' };
        }
        if (command === 'git') {
          return { status: 0, stdout: '', stderr: '' };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
      },
    }
  );

  assert.equal(report.ok, true);
  assert.equal(report.verificationEvidence?.persisted, true);
  assert.match(report.verificationEvidence?.artifactPath ?? '', /quality-gate-/);

  const checkpointsPath = path.join(rootDir, '.aios', 'context-db', 'sessions', 'quality-session', 'l1-checkpoints.jsonl');
  const checkpointsRaw = await readFile(checkpointsPath, 'utf8');
  const checkpoints = checkpointsRaw.trim().split(/\n+/).map((line) => JSON.parse(line));
  const latest = checkpoints.at(-1);

  assert.equal(latest.status, 'done');
  assert.equal(latest.telemetry.verification.result, 'passed');
  assert.match(latest.telemetry.verification.evidence, /mode=full/);
  assert.equal(Array.isArray(latest.artifacts), true);
  assert.equal(latest.artifacts.length, 1);

  const eventsPath = path.join(rootDir, '.aios', 'context-db', 'sessions', 'quality-session', 'l2-events.jsonl');
  const eventsRaw = await readFile(eventsPath, 'utf8');
  const events = eventsRaw.trim().split(/\n+/).map((line) => JSON.parse(line));
  const verificationEvent = events.find((item) => item.kind === 'verification.quality-gate');
  assert.equal(Boolean(verificationEvent), true);
  assert.equal(verificationEvent?.turn?.turnType, 'verification');
  assert.equal(verificationEvent?.turn?.environment, 'quality-gate');
  assert.equal(verificationEvent?.turn?.hindsightStatus, 'evaluated');
  assert.equal(verificationEvent?.turn?.outcome, 'success');
  assert.match(String(verificationEvent?.turn?.turnId || ''), /^quality-gate:[^:]+:summary$/);
});

test('runQualityGate persists quality-specific failure category when session is provided', async () => {
  const rootDir = await makeRootDir();
  createSession(rootDir, 'quality-logs-session');

  const report = await runQualityGate(
    { mode: 'full', sessionId: 'quality-logs-session' },
    {
      rootDir,
      io: { log() {} },
      env: {
        AIOS_DISABLED_GATES: 'quality:build,quality:types,quality:scripts,quality:contextdb,quality:git',
      },
      checkRunner(command) {
        if (command === 'rg') {
          return { status: 0, stdout: 'scripts/lib/bad.mjs:1:console.log(\'bad\')\n', stderr: '' };
        }
        throw new Error(`Unexpected command: ${command}`);
      },
    }
  );

  assert.equal(report.ok, false);
  assert.equal(report.failureCategory, 'quality-logs');
  assert.deepEqual(report.failedChecks, ['Logs']);

  const checkpointsPath = path.join(rootDir, '.aios', 'context-db', 'sessions', 'quality-logs-session', 'l1-checkpoints.jsonl');
  const checkpointsRaw = await readFile(checkpointsPath, 'utf8');
  const checkpoints = checkpointsRaw.trim().split(/\n+/).map((line) => JSON.parse(line));
  const latest = checkpoints.at(-1);

  assert.equal(latest.status, 'blocked');
  assert.equal(latest.telemetry.verification.result, 'failed');
  assert.equal(latest.telemetry.failureCategory, 'quality-logs');

  const eventsPath = path.join(rootDir, '.aios', 'context-db', 'sessions', 'quality-logs-session', 'l2-events.jsonl');
  const eventsRaw = await readFile(eventsPath, 'utf8');
  const events = eventsRaw.trim().split(/\n+/).map((line) => JSON.parse(line));
  const verificationEvent = events.find((item) => item.kind === 'verification.quality-gate');
  assert.equal(Boolean(verificationEvent), true);
  assert.equal(verificationEvent?.turn?.outcome, 'retry-needed');
  assert.equal(Array.isArray(verificationEvent?.turn?.nextStateRefs), true);
  assert.equal(verificationEvent?.turn?.nextStateRefs.includes('category:quality-logs'), true);
});

test('runQualityGate fails with quality-release category when strict release gate is unhealthy', async () => {
  const rootDir = await makeRootDir();
  const statePath = path.join(
    rootDir,
    'experiments',
    'rl-mixed-v1',
    'release',
    'orchestrator-policy-release.state.json'
  );
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({
    schema_version: 1,
    updated_at: '2026-04-14T10:00:00.000Z',
    effective_mode: 'canary',
    effective_rollout_rate: 0.5,
    counters: {
      total: 10,
      policy_applied: 10,
      baseline_routed: 0,
      policy_fallback: 4,
      policy_success: 4,
      policy_failure: 4,
      consecutive_policy_failures: 2,
      consecutive_policy_success: 0,
      downgrades: 1,
      promotions: 0,
    },
    recent: [
      { timestamp: '2026-04-14T09:00:00.000Z', policy_applied: true, policy_fallback: false, success: false, failed: true },
      { timestamp: '2026-04-14T09:01:00.000Z', policy_applied: true, policy_fallback: false, success: true, failed: false },
      { timestamp: '2026-04-14T09:02:00.000Z', policy_applied: true, policy_fallback: true, success: false, failed: true },
      { timestamp: '2026-04-14T09:03:00.000Z', policy_applied: true, policy_fallback: true, success: false, failed: true },
      { timestamp: '2026-04-14T09:04:00.000Z', policy_applied: true, policy_fallback: false, success: true, failed: false },
      { timestamp: '2026-04-14T09:05:00.000Z', policy_applied: true, policy_fallback: false, success: false, failed: true },
      { timestamp: '2026-04-14T09:06:00.000Z', policy_applied: true, policy_fallback: true, success: true, failed: false },
      { timestamp: '2026-04-14T09:07:00.000Z', policy_applied: true, policy_fallback: true, success: false, failed: true },
    ],
  }, null, 2)}\n`, 'utf8');

  const report = await runQualityGate(
    { mode: 'full' },
    {
      rootDir,
      io: { log() {} },
      env: {
        AIOS_DISABLED_GATES: 'quality:build,quality:types,quality:scripts,quality:contextdb,quality:logs,quality:git',
      },
    }
  );

  assert.equal(report.ok, false);
  assert.deepEqual(report.failedChecks, ['Release']);
  assert.equal(report.failureCategory, 'quality-release');
});

test('runQualityGate applies release thresholds from environment overrides', async () => {
  const rootDir = await makeRootDir();
  const statePath = path.join(
    rootDir,
    'experiments',
    'rl-mixed-v1',
    'release',
    'orchestrator-policy-release.state.json'
  );
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({
    schema_version: 1,
    updated_at: '2026-04-14T10:30:00.000Z',
    effective_mode: 'canary',
    effective_rollout_rate: 0.4,
    counters: {
      total: 8,
      policy_applied: 8,
      baseline_routed: 0,
      policy_fallback: 2,
      policy_success: 4,
      policy_failure: 4,
      consecutive_policy_failures: 1,
      consecutive_policy_success: 0,
      downgrades: 1,
      promotions: 0,
    },
    recent: [
      { timestamp: '2026-04-14T09:00:00.000Z', policy_applied: true, policy_fallback: true, success: false, failed: true },
      { timestamp: '2026-04-14T09:01:00.000Z', policy_applied: true, policy_fallback: false, success: true, failed: false },
      { timestamp: '2026-04-14T09:02:00.000Z', policy_applied: true, policy_fallback: false, success: false, failed: true },
      { timestamp: '2026-04-14T09:03:00.000Z', policy_applied: true, policy_fallback: false, success: true, failed: false },
      { timestamp: '2026-04-14T09:04:00.000Z', policy_applied: true, policy_fallback: false, success: false, failed: true },
      { timestamp: '2026-04-14T09:05:00.000Z', policy_applied: true, policy_fallback: false, success: true, failed: false },
      { timestamp: '2026-04-14T09:06:00.000Z', policy_applied: true, policy_fallback: true, success: false, failed: true },
      { timestamp: '2026-04-14T09:07:00.000Z', policy_applied: true, policy_fallback: false, success: true, failed: false },
    ],
  }, null, 2)}\n`, 'utf8');

  const report = await runQualityGate(
    { mode: 'full' },
    {
      rootDir,
      io: { log() {} },
      env: {
        AIOS_DISABLED_GATES: 'quality:build,quality:types,quality:scripts,quality:contextdb,quality:logs,quality:git',
        AIOS_RELEASE_GATE_MIN_SAMPLES: '8',
        AIOS_RELEASE_GATE_MAX_FAILURE_RATE: '0.6',
        AIOS_RELEASE_GATE_MAX_FALLBACK_RATE: '0.4',
      },
    }
  );

  assert.equal(report.ok, true);
  assert.deepEqual(report.failedChecks, []);
  assert.deepEqual(report.releaseThresholds, {
    minSamples: 8,
    maxFailureRate: 0.6,
    maxFallbackRate: 0.4,
  });
  const releaseCheck = report.results.find((item) => item.label === 'Release');
  assert.equal(releaseCheck?.status, 'OK');
  assert.match(String(releaseCheck?.detail || ''), /thresholds=min=8,failure<=0.6,fallback<=0.4/);
});

test('runQualityGate fails when release threshold environment values are invalid', async () => {
  const rootDir = await makeRootDir();
  const report = await runQualityGate(
    { mode: 'full' },
    {
      rootDir,
      io: { log() {} },
      env: {
        AIOS_DISABLED_GATES: 'quality:build,quality:types,quality:scripts,quality:contextdb,quality:logs,quality:git',
        AIOS_RELEASE_GATE_MAX_FAILURE_RATE: 'bad-value',
      },
    }
  );

  assert.equal(report.ok, false);
  assert.deepEqual(report.failedChecks, ['Release']);
  assert.equal(report.failureCategory, 'quality-release');
  const releaseCheck = report.results.find((item) => item.label === 'Release');
  assert.equal(releaseCheck?.status, 'FAIL');
  assert.match(String(releaseCheck?.detail || ''), /invalid release threshold env/i);
});

test('executeEntropyGc dry-run keeps newest artifacts and skips referenced checkpoints', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'entropy-dry-run';
  const sessionDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId);
  const artifactsDir = path.join(sessionDir, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const newest = path.join(artifactsDir, 'dispatch-run-newest.json');
  const referenced = path.join(artifactsDir, 'dispatch-run-old-ref.json');
  const stale = path.join(artifactsDir, 'dispatch-run-old-free.json');
  await writeFile(newest, '{"ok":true}\n', 'utf8');
  await writeFile(referenced, '{"ok":false}\n', 'utf8');
  await writeFile(stale, '{"ok":false}\n', 'utf8');

  const nowMs = Date.parse('2026-03-16T00:00:00.000Z');
  const oneHourAgo = new Date(nowMs - (1 * 60 * 60 * 1000));
  const threeDaysAgo = new Date(nowMs - (72 * 60 * 60 * 1000));
  await utimes(newest, oneHourAgo, oneHourAgo);
  await utimes(referenced, threeDaysAgo, threeDaysAgo);
  await utimes(stale, threeDaysAgo, threeDaysAgo);

  const referencedPath = path.join(
    '.aios',
    'context-db',
    'sessions',
    sessionId,
    'artifacts',
    'dispatch-run-old-ref.json'
  ).split(path.sep).join('/');
  const checkpointsPath = path.join(sessionDir, 'l1-checkpoints.jsonl');
  await writeFile(
    checkpointsPath,
    `${JSON.stringify({
      seq: 1,
      ts: '2026-03-15T12:00:00.000Z',
      status: 'done',
      summary: 'Checkpoint with referenced artifact',
      artifacts: [referencedPath],
    })}\n`,
    'utf8'
  );

  const report = await executeEntropyGc(
    {
      sessionId,
      mode: 'dry-run',
      retain: 1,
      minAgeHours: 24,
      format: 'json',
    },
    { rootDir, now: nowMs, persistEvidence: false }
  );

  assert.equal(report.mode, 'dry-run');
  assert.equal(report.scannedCount, 3);
  assert.equal(report.candidateCount, 1);
  assert.equal(report.archivedCount, 0);
  assert.equal(report.keep.some((item) => item.endsWith('/dispatch-run-newest.json')), true);
  assert.equal(report.skippedReferenced.some((item) => item.path.endsWith('/dispatch-run-old-ref.json')), true);
  assert.equal(report.candidates.some((item) => item.path.endsWith('/dispatch-run-old-free.json')), true);
});

test('executeEntropyGc auto archives stale artifacts and writes manifest', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'entropy-auto';
  const sessionDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId);
  const artifactsDir = path.join(sessionDir, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const newest = path.join(artifactsDir, 'dispatch-run-newest.json');
  const staleA = path.join(artifactsDir, 'dispatch-run-old-a.json');
  const staleB = path.join(artifactsDir, 'dispatch-run-old-b.json');
  await writeFile(newest, '{"ok":true}\n', 'utf8');
  await writeFile(staleA, '{"ok":false}\n', 'utf8');
  await writeFile(staleB, '{"ok":false}\n', 'utf8');

  const nowMs = Date.parse('2026-03-16T00:00:00.000Z');
  const oneHourAgo = new Date(nowMs - (1 * 60 * 60 * 1000));
  const twoDaysAgo = new Date(nowMs - (48 * 60 * 60 * 1000));
  await utimes(newest, oneHourAgo, oneHourAgo);
  await utimes(staleA, twoDaysAgo, twoDaysAgo);
  await utimes(staleB, twoDaysAgo, twoDaysAgo);

  const report = await executeEntropyGc(
    {
      sessionId,
      mode: 'auto',
      retain: 1,
      minAgeHours: 24,
      format: 'json',
    },
    { rootDir, now: nowMs, persistEvidence: false }
  );

  assert.equal(report.mode, 'auto');
  assert.equal(report.scannedCount, 3);
  assert.equal(report.candidateCount, 2);
  assert.equal(report.archivedCount, 2);
  assert.equal(report.manifestPath.endsWith('/manifest.json'), true);
  assert.equal(Array.isArray(report.archived), true);
  assert.equal(report.archived.length, 2);

  const manifest = JSON.parse(await readFile(path.join(rootDir, report.manifestPath), 'utf8'));
  assert.equal(manifest.kind, 'maintenance.entropy-gc');
  assert.equal(manifest.archivedCount, 2);

  const artifactNames = await readdir(artifactsDir);
  assert.deepEqual(artifactNames.sort(), ['dispatch-run-newest.json']);
  const newestStats = await stat(path.join(artifactsDir, 'dispatch-run-newest.json'));
  assert.equal(newestStats.isFile(), true);
});

test('executeEntropyGc persists turn-envelope metadata on maintenance evidence events', async () => {
  const rootDir = await makeRootDir();
  const sessionId = 'entropy-evidence-turn';
  createSession(rootDir, sessionId);
  const sessionDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId);
  const artifactsDir = path.join(sessionDir, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const newest = path.join(artifactsDir, 'dispatch-run-newest.json');
  const stale = path.join(artifactsDir, 'dispatch-run-stale.json');
  await writeFile(newest, '{"ok":true}\n', 'utf8');
  await writeFile(stale, '{"ok":false}\n', 'utf8');

  const nowMs = Date.parse('2026-03-16T00:00:00.000Z');
  const oneHourAgo = new Date(nowMs - (1 * 60 * 60 * 1000));
  const twoDaysAgo = new Date(nowMs - (48 * 60 * 60 * 1000));
  await utimes(newest, oneHourAgo, oneHourAgo);
  await utimes(stale, twoDaysAgo, twoDaysAgo);

  const report = await executeEntropyGc(
    {
      sessionId,
      mode: 'auto',
      retain: 1,
      minAgeHours: 24,
      format: 'json',
    },
    { rootDir, now: nowMs, persistEvidence: true }
  );

  assert.equal(report.evidence?.persisted, true);
  assert.equal(report.archivedCount, 1);
  assert.equal(report.manifestPath.endsWith('/manifest.json'), true);

  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const eventsRaw = await readFile(eventsPath, 'utf8');
  const events = eventsRaw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const entropyEvent = events.find((item) => item.kind === 'maintenance.entropy-gc');
  assert.equal(Boolean(entropyEvent), true);
  assert.equal(entropyEvent.turn?.turnType, 'system-maintenance');
  assert.equal(entropyEvent.turn?.environment, 'entropy-gc');
  assert.equal(entropyEvent.turn?.hindsightStatus, 'na');
  assert.equal(entropyEvent.turn?.outcome, 'success');
  assert.equal(Array.isArray(entropyEvent.turn?.nextStateRefs), true);
  assert.equal(entropyEvent.turn?.nextStateRefs?.includes(report.manifestPath), true);
});

test('validateHandoffPayload rejects missing required fields', () => {
  const result = validateHandoffPayload({ fromRole: 'planner' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'toRole is required',
    'taskTitle is required',
    'contextSummary is required',
  ]);
});

test('renderHandoffMarkdown renders the shared schema', () => {
  const markdown = renderHandoffMarkdown({
    fromRole: 'planner',
    toRole: 'reviewer',
    taskTitle: 'Implement harness profiles',
    contextSummary: 'Profiles and quality gate landed; review integration risks.',
    findings: ['doctor now supports --profile'],
    filesTouched: ['scripts/lib/harness/profile.mjs'],
    recommendations: ['run quality-gate pre-pr'],
  });

  assert.match(markdown, /## HANDOFF: planner -> reviewer/);
  assert.match(markdown, /\*\*Task:\*\* Implement harness profiles/);
  assert.match(markdown, /- doctor now supports --profile/);
});
