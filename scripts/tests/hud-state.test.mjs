import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { runContextDbCli } from '../lib/contextdb-cli.mjs';
import { buildHindsightEval } from '../lib/harness/hindsight-eval.mjs';
import { initSoloRunJournal, writeSoloControl } from '../lib/harness/solo-journal.mjs';
import { readHudDispatchSummary, readHudState, selectHudSessionId } from '../lib/hud/state.mjs';
import { renderHud } from '../lib/hud/render.mjs';
import { computeAdaptiveNextIntervalMs, createThrottledWatchRender, watchRenderLoop } from '../lib/hud/watch.mjs';
import { runHud } from '../lib/lifecycle/hud.mjs';
import { runOrchestrate } from '../lib/lifecycle/orchestrate.mjs';
import {
  createStatusWatchStallTracker,
  resolveStatusSkillCandidateOptions,
  runTeamHistory,
  runTeamSkillCandidatesList,
  runTeamSkillCandidatesExport,
  runTeamStatus,
} from '../lib/lifecycle/team-ops.mjs';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonLines(filePath, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const content = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await fs.writeFile(filePath, content, 'utf8');
}

function makeSessionMeta({ sessionId, agent, updatedAt }) {
  return {
    schemaVersion: 1,
    sessionId,
    agent,
    project: 'aios',
    goal: `Goal for ${sessionId}`,
    tags: [],
    status: 'running',
    createdAt: updatedAt,
    updatedAt,
  };
}

test('hud state entrypoint delegates state, artifact, and command responsibilities to focused modules', async () => {
  const root = path.resolve('scripts/lib/hud');
  const entry = await fs.readFile(path.join(root, 'state.mjs'), 'utf8');
  const entryLines = entry.split(/\r?\n/u).length;
  assert.equal(entryLines <= 260, true, `hud/state.mjs is ${entryLines} lines; keep session, artifact, IO, and command logic split under hud/state/*`);

  const modules = [
    { file: 'state/providers.mjs', exports: ['HUD_PROVIDER_AGENT_MAP', 'normalizeProvider', 'inferProviderFromAgent'] },
    { file: 'state/io.mjs', exports: ['safeReadJsonCached', 'readLastJsonLine', 'readLatestQualityGateEvent'] },
    { file: 'state/sessions.mjs', exports: ['listContextDbSessions', 'selectHudSessionId'] },
    { file: 'state/artifacts.mjs', exports: ['findLatestDispatchArtifact', 'findLatestSkillCandidateArtifact', 'collectRecentDispatchEvidence'] },
    { file: 'state/commands.mjs', exports: ['buildSuggestedCommands', 'buildHarnessSuggestedCommands', 'buildDispatchFixHint'] },
    { file: 'state/compose.mjs', exports: ['readHudState', 'readHudDispatchSummary'] },
  ];

  for (const moduleDef of modules) {
    const mod = await import(pathToFileURL(path.join(root, moduleDef.file)).href);
    for (const exportName of moduleDef.exports) {
      assert.notEqual(mod[exportName], undefined, `${moduleDef.file} should export ${exportName}`);
    }
  }
});

test('selectHudSessionId respects explicit session id', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-'));
  const selection = await selectHudSessionId({ rootDir, sessionId: 'session-explicit', provider: 'codex' });
  assert.equal(selection.sessionId, 'session-explicit');
  assert.equal(selection.source, 'explicit');
});

test('selectHudSessionId picks latest provider session by updatedAt', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');

  await writeJson(
    path.join(sessionsRoot, 'session-1', 'meta.json'),
    makeSessionMeta({ sessionId: 'session-1', agent: 'codex-cli', updatedAt: '2026-04-05T00:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, 'session-2', 'meta.json'),
    makeSessionMeta({ sessionId: 'session-2', agent: 'codex-cli', updatedAt: '2026-04-05T01:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, 'session-3', 'meta.json'),
    makeSessionMeta({ sessionId: 'session-3', agent: 'claude-code', updatedAt: '2026-04-05T02:00:00.000Z' })
  );

  const selection = await selectHudSessionId({ rootDir, provider: 'codex' });
  assert.equal(selection.sessionId, 'session-2');
  assert.equal(selection.agent, 'codex-cli');
  assert.equal(selection.source, 'provider-latest');
});

test('selectHudSessionId scales to many sessions', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-many-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');

  const writeMany = async (prefix, agent, count, startHour) => {
    for (let index = 0; index < count; index += 1) {
      const sessionId = `${prefix}-${String(index).padStart(2, '0')}`;
      const hour = startHour;
      const minute = index;
      await writeJson(
        path.join(sessionsRoot, sessionId, 'meta.json'),
        makeSessionMeta({ sessionId, agent, updatedAt: `2026-04-05T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z` })
      );
    }
  };

  await writeMany('codex', 'codex-cli', 25, 0);
  await writeMany('claude', 'claude-code', 25, 0);

  const selection = await selectHudSessionId({ rootDir, provider: 'codex' });
  assert.equal(selection.sessionId, 'codex-24');
  assert.equal(selection.agent, 'codex-cli');
  assert.equal(selection.source, 'provider-latest');
});

test('selectHudSessionId caches session directory listing until sessionsRoot changes', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-sessions-cache-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');

  for (let index = 0; index < 10; index += 1) {
    const sessionId = `session-${String(index).padStart(2, '0')}`;
    await writeJson(
      path.join(sessionsRoot, sessionId, 'meta.json'),
      makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: `2026-04-06T00:00:${String(index).padStart(2, '0')}.000Z` })
    );
  }

  const originalReaddir = fs.readdir;
  let readdirCount = 0;
  fs.readdir = async (dirPath, ...rest) => {
    if (String(dirPath) === sessionsRoot) {
      readdirCount += 1;
    }
    return await originalReaddir(dirPath, ...rest);
  };

  try {
    const first = await selectHudSessionId({ rootDir, provider: 'codex' });
    const second = await selectHudSessionId({ rootDir, provider: 'codex' });
    assert.equal(first.source, 'provider-latest');
    assert.equal(second.source, 'provider-latest');
    assert.equal(readdirCount, 1);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeJson(
      path.join(sessionsRoot, 'session-99', 'meta.json'),
      makeSessionMeta({ sessionId: 'session-99', agent: 'codex-cli', updatedAt: '2026-04-06T00:01:00.000Z' })
    );

    const third = await selectHudSessionId({ rootDir, provider: 'codex' });
    assert.equal(third.source, 'provider-latest');
    assert.equal(readdirCount, 2);
  } finally {
    fs.readdir = originalReaddir;
  }
});

test('buildHindsightEval caches artifact signatures to avoid redundant fs.stat', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-hindsight-sig-cache-'));
  const sessionId = 'hindsight-sig-cache-session';
  const artifactsDir = path.join(rootDir, '.aios', 'context-db', 'sessions', sessionId, 'artifacts');

  const olderPath = path.join(artifactsDir, 'dispatch-run-20260406T000000Z.json');
  const newerPath = path.join(artifactsDir, 'dispatch-run-20260406T000001Z.json');

  await writeJson(olderPath, {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-06T00:00:00.000Z',
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [
        {
          jobId: 'phase.implement.wi.1',
          jobType: 'phase',
          role: 'implementer',
          status: 'blocked',
          attempts: 1,
          output: { error: 'File policy violation' },
        },
      ],
      finalOutputs: [],
    },
  });
  await writeJson(newerPath, {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-06T00:00:01.000Z',
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [
        {
          jobId: 'phase.implement.wi.1',
          jobType: 'phase',
          role: 'implementer',
          status: 'blocked',
          attempts: 2,
          output: { error: 'File policy violation' },
        },
      ],
      finalOutputs: [],
    },
  });

  const dispatchEvidence = [
    {
      artifactPath: path.join('.aios', 'context-db', 'sessions', sessionId, 'artifacts', path.basename(newerPath)),
    },
    {
      artifactPath: path.join('.aios', 'context-db', 'sessions', sessionId, 'artifacts', path.basename(olderPath)),
    },
  ];

  const meta = makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T00:00:02.000Z' });

  const originalStat = fs.stat;
  let statCount = 0;
  fs.stat = async (...args) => {
    statCount += 1;
    return await originalStat(...args);
  };

  try {
    const first = await buildHindsightEval({ rootDir, meta, dispatchEvidence, maxArtifacts: 2, maxPairs: 1 });
    assert.equal(first.pairsAnalyzed, 1);
    assert.equal(statCount, 2);

    const second = await buildHindsightEval({ rootDir, meta, dispatchEvidence, maxArtifacts: 2, maxPairs: 1 });
    assert.equal(second.pairsAnalyzed, 1);
    assert.equal(statCount, 2);
  } finally {
    fs.stat = originalStat;
  }
});

test('watchRenderLoop skips redraw when output is unchanged', async () => {
  const stdoutWrites = [];
  const stderrWrites = [];
  let stopHandler = null;
  let callCount = 0;

  await watchRenderLoop(async () => {
    callCount += 1;
    if (callCount === 1) return 'hello';
    if (callCount === 2) return 'hello';
    if (callCount === 3) {
      if (typeof stopHandler === 'function') stopHandler();
      return 'world';
    }
    return 'world';
  }, {
    intervalMs: 5,
    isTTY: true,
    env: {},
    writeStdout: (text) => stdoutWrites.push(String(text)),
    writeStderr: (text) => stderrWrites.push(String(text)),
    registerSigint: (handler) => {
      stopHandler = handler;
    },
  });

  assert.equal(stderrWrites.length, 0);
  const stdout = stdoutWrites.join('');
  assert.equal(stdout.split('hello').length - 1, 1);
  assert.equal(stdout.split('world').length - 1, 1);
});

test('readHudState and renderHud expose solo harness status without dispatch warnings', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-solo-harness-'));
  const sessionId = 'solo-harness-session';
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');

  await writeJson(
    path.join(sessionsRoot, sessionId, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-26T01:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, sessionId, 'state.json'),
    { sessionId, status: 'running', updatedAt: '2026-04-26T01:00:00.000Z' }
  );

  await initSoloRunJournal({
    rootDir,
    sessionId,
    objective: 'Ship release checklist',
    provider: 'codex',
    clientId: 'codex-cli',
    profile: 'standard',
    worktree: {
      enabled: true,
      baseRef: 'HEAD',
      path: '/tmp/solo-harness-demo/repo',
      preserved: true,
      cleanupReason: '',
    },
  });
  await writeSoloControl({
    rootDir,
    sessionId,
    stopRequested: false,
    reason: '',
    requestedAt: null,
  });

  const state = await readHudState({ rootDir, sessionId });
  assert.equal(state.latestHarnessRun?.kind, 'solo-harness.run-summary');
  assert.equal(state.latestHarnessRun?.status, 'running');
  assert.equal(state.harnessControl?.stopRequested, false);
  assert.equal(state.warnings.some((warning) => /No dispatch artifact found/u.test(warning)), false);
  assert.ok(
    Array.isArray(state.harnessSuggestedCommands)
      && state.harnessSuggestedCommands.some((command) => command.includes('harness status --session solo-harness-session'))
  );

  const text = renderHud(state, { preset: 'focused' });
  assert.match(text, /Harness: status=running/);
});

test('createThrottledWatchRender limits read cadence while reusing last output', async () => {
  let nowMs = 0;
  let callCount = 0;
  const throttledRender = createThrottledWatchRender(async () => {
    callCount += 1;
    return `frame-${callCount}`;
  }, {
    minIntervalMs: 1000,
    nowFn: () => nowMs,
  });

  assert.equal(await throttledRender(), 'frame-1');
  assert.equal(callCount, 1);

  nowMs = 100;
  assert.equal(await throttledRender(), 'frame-1');
  assert.equal(callCount, 1);

  nowMs = 999;
  assert.equal(await throttledRender(), 'frame-1');
  assert.equal(callCount, 1);

  nowMs = 1000;
  assert.equal(await throttledRender(), 'frame-2');
  assert.equal(callCount, 2);
});

test('computeAdaptiveNextIntervalMs backs off on idle and resets on change', () => {
  assert.equal(computeAdaptiveNextIntervalMs(250, {
    changed: false,
    minIntervalMs: 250,
    maxIntervalMs: 2000,
    backoffMultiplier: 2,
  }), 500);
  assert.equal(computeAdaptiveNextIntervalMs(500, {
    changed: false,
    minIntervalMs: 250,
    maxIntervalMs: 2000,
    backoffMultiplier: 2,
  }), 1000);
  assert.equal(computeAdaptiveNextIntervalMs(1000, {
    changed: false,
    minIntervalMs: 250,
    maxIntervalMs: 2000,
    backoffMultiplier: 2,
  }), 2000);
  assert.equal(computeAdaptiveNextIntervalMs(2000, {
    changed: false,
    minIntervalMs: 250,
    maxIntervalMs: 2000,
    backoffMultiplier: 2,
  }), 2000);
  assert.equal(computeAdaptiveNextIntervalMs(2000, {
    changed: true,
    minIntervalMs: 250,
    maxIntervalMs: 2000,
    backoffMultiplier: 2,
  }), 250);
});

test('createStatusWatchStallTracker emits stalled signal when progress remains unchanged', () => {
  let nowMs = 0;
  const tracker = createStatusWatchStallTracker({
    thresholdMs: 1500,
    nowFn: () => nowMs,
  });
  const stableState = {
    latestDispatch: {
      ok: false,
      mode: 'dry-run',
      jobProgress: {
        total: 4,
        done: 1,
        running: 1,
        blocked: 2,
        queued: 0,
      },
      toolProgress: [
        {
          tool: 'local-phase',
          total: 4,
          done: 1,
          running: 1,
          blocked: 2,
          queued: 0,
        },
      ],
    },
  };

  assert.equal(tracker.observe(stableState), null);
  nowMs = 1000;
  assert.equal(tracker.observe(stableState), null);
  nowMs = 1700;
  const stalled = tracker.observe(stableState);
  assert.equal(stalled?.stalled, true);
  assert.equal(stalled?.stalledThresholdMs, 1500);
  assert.equal((stalled?.stalledForMs || 0) >= 1500, true);
  assert.match(String(stalled?.stalledToolSummary || ''), /local-phase/);

  nowMs = 2000;
  const changedState = {
    ...stableState,
    latestDispatch: {
      ...stableState.latestDispatch,
      jobProgress: {
        ...stableState.latestDispatch.jobProgress,
        done: 2,
        running: 0,
        blocked: 2,
      },
    },
  };
  assert.equal(tracker.observe(changedState), null);
});

test('resolveStatusSkillCandidateOptions adapts default limit for fast watch', () => {
  assert.deepEqual(
    resolveStatusSkillCandidateOptions({
      showSkillCandidates: false,
      requestedSkillCandidateLimit: 0,
      fastWatchMinimal: false,
    }),
    {
      showSkillCandidates: false,
      skillCandidateLimit: 0,
      skillCandidateView: 'inline',
      exportSkillCandidatePatchTemplate: false,
      draftId: '',
    }
  );

  assert.deepEqual(
    resolveStatusSkillCandidateOptions({
      showSkillCandidates: true,
      requestedSkillCandidateLimit: 0,
      fastWatchMinimal: false,
    }),
    {
      showSkillCandidates: true,
      skillCandidateLimit: 6,
      skillCandidateView: 'inline',
      exportSkillCandidatePatchTemplate: false,
      draftId: '',
    }
  );

  assert.deepEqual(
    resolveStatusSkillCandidateOptions({
      showSkillCandidates: true,
      requestedSkillCandidateLimit: 0,
      fastWatchMinimal: true,
    }),
    {
      showSkillCandidates: true,
      skillCandidateLimit: 3,
      skillCandidateView: 'inline',
      exportSkillCandidatePatchTemplate: false,
      draftId: '',
    }
  );

  assert.deepEqual(
    resolveStatusSkillCandidateOptions({
      showSkillCandidates: false,
      requestedSkillCandidateLimit: 4,
      fastWatchMinimal: true,
    }),
    {
      showSkillCandidates: true,
      skillCandidateLimit: 4,
      skillCandidateView: 'inline',
      exportSkillCandidatePatchTemplate: false,
      draftId: '',
    }
  );

  assert.deepEqual(
    resolveStatusSkillCandidateOptions({
      showSkillCandidates: true,
      requestedSkillCandidateLimit: 99,
      fastWatchMinimal: false,
    }),
    {
      showSkillCandidates: true,
      skillCandidateLimit: 20,
      skillCandidateView: 'inline',
      exportSkillCandidatePatchTemplate: false,
      draftId: '',
    }
  );

  assert.deepEqual(
    resolveStatusSkillCandidateOptions({
      showSkillCandidates: true,
      requestedSkillCandidateLimit: 0,
      skillCandidateView: 'detail',
      exportSkillCandidatePatchTemplate: true,
      fastWatchMinimal: false,
    }),
    {
      showSkillCandidates: true,
      skillCandidateLimit: 6,
      skillCandidateView: 'detail',
      exportSkillCandidatePatchTemplate: true,
      draftId: '',
    }
  );

  assert.deepEqual(
    resolveStatusSkillCandidateOptions({
      showSkillCandidates: false,
      requestedSkillCandidateLimit: 0,
      draftId: 'draft.skill.repeat-blocked.runtime-error',
      fastWatchMinimal: false,
    }),
    {
      showSkillCandidates: true,
      skillCandidateLimit: 6,
      skillCandidateView: 'inline',
      exportSkillCandidatePatchTemplate: false,
      draftId: 'draft.skill.repeat-blocked.runtime-error',
    }
  );
});

test('renderHud minimal shows watch visibility and quality category labels', () => {
  const rendered = renderHud({
    selection: { sessionId: 's-1', provider: 'codex', agent: 'codex-cli' },
    latestDispatch: {
      ok: false,
      blockedJobs: 2,
      jobProgress: {
        total: 4,
        done: 1,
        running: 1,
        blocked: 2,
        queued: 0,
        completionRatio: 0.25,
      },
      toolProgress: [
        {
          tool: 'local-phase',
          total: 4,
          done: 1,
          running: 1,
          blocked: 2,
          queued: 0,
          completionRatio: 0.25,
        },
      ],
    },
    latestSkillCandidate: {
      skillId: 'skill-constraints',
      failureClass: 'ownership-policy',
      lessonCount: 2,
    },
    latestQualityGate: {
      outcome: 'retry-needed',
      categoryRef: 'category:quality-logs',
    },
    watchdog: {
      decision: 'observe',
      reason: 'watchdog baseline',
      readiness: {
        verdict: 'ready',
        blockedReasons: [],
        warnings: [],
        nextActions: [],
        evidence: [],
      },
    },
  }, {
    preset: 'minimal',
    watchMeta: {
      renderIntervalMs: 250,
      dataRefreshMs: 1000,
      fast: true,
      dataAgeMs: 20000,
    },
  });

  assert.match(rendered, /session=s-1/);
  assert.match(rendered, /dispatch=blocked\(2\)/);
  assert.match(rendered, /jobs=1\/4 run=1 blk=2 tool=local-phase:1\/4/);
  assert.match(rendered, /quality=failed\(category:quality-logs\)/);
  assert.match(rendered, /skill=skill-constraints\/ownership-policy#2/);
  assert.match(rendered, /readiness=ready/);
  assert.match(rendered, /watch: render=250ms data-refresh=1000ms fast=on data-age=20000ms/);
});

test('renderHud watch line includes stalled summary when provided', () => {
  const rendered = renderHud({
    selection: { sessionId: 's-2', provider: 'codex', agent: 'codex-cli' },
    latestDispatch: {
      ok: false,
      blockedJobs: 1,
      jobProgress: {
        total: 3,
        done: 1,
        running: 1,
        blocked: 1,
        queued: 0,
      },
    },
  }, {
    preset: 'minimal',
    watchMeta: {
      renderIntervalMs: 500,
      dataRefreshMs: 500,
      fast: false,
      dataAgeMs: 5000,
      stalled: true,
      stalledForMs: 45000,
      stalledThresholdMs: 30000,
      stalledToolSummary: 'local-phase:1/3(r=1 b=1 q=0)',
    },
  });

  assert.match(rendered, /stalled=on\(45000ms>=30000ms tools=local-phase:1\/3/);
});

test('readHudState includes latest checkpoint and dispatch evidence', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'session-2';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-05T01:00:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    nextActions: ['Do X'],
  });
  await writeJsonLines(path.join(sessionDir, 'l1-checkpoints.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-05T00:30:00.000Z',
      status: 'running',
      summary: 'First checkpoint',
      nextActions: [],
      artifacts: [],
    },
    {
      seq: 2,
      ts: '2026-04-05T00:59:00.000Z',
      status: 'running',
      summary: 'Second checkpoint',
      nextActions: ['Next'],
      artifacts: ['.aios/context-db/sessions/session-2/artifacts/dispatch-run-20260405T010000Z.json'],
      telemetry: {
        verification: { result: 'passed', evidence: 'unit-test' },
        retryCount: 1,
        failureCategory: 'none',
        elapsedMs: 123,
        cost: { totalTokens: 42, usd: 0.001 },
      },
    },
  ]);
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260405T005900Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-05T00:59:00.000Z',
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [
        {
          jobId: 'phase.implement.wi.1',
          jobType: 'phase',
          role: 'implementer',
          executor: 'local-phase',
          status: 'blocked',
          turnId: '20260405T005900Z:phase.implement.wi.1:a1',
          workItemRefs: ['wi.1'],
          attempts: 1,
          output: { error: 'File policy violation' },
        },
        {
          jobId: 'phase.plan',
          jobType: 'phase',
          role: 'planner',
          executor: 'local-phase',
          status: 'simulated',
          output: { payload: { status: 'completed' } },
        },
      ],
      finalOutputs: [],
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260405T010000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-05T01:00:00.000Z',
    dispatchInsights: {
      schemaVersion: 1,
      generatedAt: '2026-04-05T01:00:00.000Z',
      status: 'attention',
      score: 85,
      signals: [
        {
          id: 'retry.same-hypothesis',
          severity: 'warn',
          message: 'Retry attempts repeated the same hypothesis.',
          count: 1,
        },
        {
          id: 'work.blocked',
          severity: 'block',
          message: 'Blocked dispatch work detected.',
          count: 1,
          evidence: 'phase.implement.wi.1',
        },
      ],
      suggestedActions: [
        {
          id: 'revise-before-retry',
          label: 'Change the hypothesis or execution plan before retrying blocked jobs.',
        },
        {
          id: 'inspect-blockers',
          label: 'Inspect blocked handoffs and resolve the first concrete blocker before rerunning.',
        },
      ],
    },
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [
        {
          jobId: 'phase.implement.wi.1',
          jobType: 'phase',
          role: 'implementer',
          executor: 'local-phase',
          status: 'blocked',
          turnId: '20260405T010000Z:phase.implement.wi.1:a2',
          workItemRefs: ['wi.1'],
          attempts: 2,
          output: { error: 'File policy violation' },
        },
        {
          jobId: 'phase.plan',
          jobType: 'phase',
          role: 'planner',
          executor: 'local-phase',
          status: 'simulated',
          output: { payload: { status: 'completed' } },
        },
      ],
      finalOutputs: [],
    },
    workItemTelemetry: {
      schemaVersion: 1,
      generatedAt: '2026-04-05T01:00:00.000Z',
      totals: { total: 2, queued: 0, running: 0, blocked: 1, done: 1 },
      items: [
        {
          itemId: 'phase.implement.wi.1',
          itemType: 'phase',
          role: 'implementer',
          status: 'blocked',
          failureClass: 'ownership-policy',
          retryClass: 'same-hypothesis',
        },
      ],
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260405T010100Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-05T01:00:10.000Z',
    persistedAt: '2026-04-05T01:01:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
      jobIds: ['phase.implement.wi.1'],
      workItemRefs: ['wi.1'],
      hints: ['Add ownership boundary guidance.'],
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    evidence: {
      sourceArtifactPath: '.aios/context-db/sessions/session-2/artifacts/dispatch-run-20260405T010000Z.json',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });
  await writeJsonLines(path.join(sessionDir, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-05T00:58:59.000Z',
      role: 'assistant',
      kind: 'orchestration.dispatch-run',
      text: 'dispatch run',
    },
    {
      seq: 2,
      ts: '2026-04-05T01:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260405T010000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'retry-needed',
        nextStateRefs: ['check:logs', 'category:quality-logs'],
      },
    },
  ]);

  const state = await readHudState({ rootDir, sessionId });
  assert.equal(state.selection.sessionId, sessionId);
  assert.equal(state.session?.agent, 'codex-cli');
  assert.equal(state.latestCheckpoint?.seq, 2);
  assert.equal(state.latestCheckpoint?.telemetry?.verification?.result, 'passed');
  assert.equal(state.latestDispatch?.ok, false);
  assert.equal(state.latestDispatch?.blockedJobs, 1);
  assert.equal(state.latestDispatch?.jobProgress?.total, 2);
  assert.equal(state.latestDispatch?.jobProgress?.done, 1);
  assert.equal(state.latestDispatch?.jobProgress?.blocked, 1);
  assert.equal(state.latestDispatch?.jobProgress?.running, 0);
  assert.equal(state.latestDispatch?.jobProgress?.queued, 0);
  assert.equal(state.latestDispatch?.jobProgress?.completionRatio, 0.5);
  assert.equal(state.latestDispatch?.toolProgress?.[0]?.tool, 'local-phase');
  assert.equal(state.latestDispatch?.toolProgress?.[0]?.total, 2);
  assert.equal(state.latestDispatch?.toolProgress?.[0]?.done, 1);
  assert.equal(state.latestDispatch?.toolProgress?.[0]?.blocked, 1);
  assert.equal(state.latestDispatch?.blocked?.[0]?.turnId, '20260405T010000Z:phase.implement.wi.1:a2');
  assert.deepEqual(state.latestDispatch?.blocked?.[0]?.workItemRefs, ['wi.1']);
  assert.equal(state.latestDispatch?.blocked?.[0]?.attempts, 2);
  assert.equal(state.latestDispatch?.blocked?.[0]?.failureClass, 'ownership-policy');
  assert.equal(state.latestDispatch?.blocked?.[0]?.retryClass, 'same-hypothesis');
  assert.equal(state.latestSkillCandidate?.skillId, 'skill-constraints');
  assert.equal(state.latestSkillCandidate?.scope, 'ownership-policy');
  assert.equal(state.latestSkillCandidate?.failureClass, 'ownership-policy');
  assert.equal(state.latestSkillCandidate?.lessonCount, 2);
  assert.equal(state.latestSkillCandidate?.reviewMode, 'manual');
  assert.equal(state.latestQualityGate?.kind, 'verification.quality-gate');
  assert.equal(state.latestQualityGate?.turnId, 'quality-gate:20260405T010000Z:summary');
  assert.equal(state.latestQualityGate?.outcome, 'retry-needed');
  assert.equal(state.latestQualityGate?.categoryRef, 'category:quality-logs');
  assert.equal(state.latestQualityGate?.failureCategory, 'quality-logs');
  assert.equal(state.dispatchHindsight?.pairsAnalyzed, 1);
  assert.equal(state.dispatchHindsight?.repeatedBlockedTurns, 1);
  assert.equal(state.dispatchHindsight?.topRepeatedFailureClasses?.[0]?.failureClass, 'ownership-policy');
  assert.equal(state.dispatchFixHint?.targetId, 'runbook.dispatch-merge-triage');
  assert.equal(state.latestDispatch?.dispatchInsights?.status, 'attention');
  assert.equal(state.latestDispatch?.dispatchInsights?.score, 85);
  assert.equal(state.latestDispatch?.dispatchInsights?.signals?.[0]?.id, 'retry.same-hypothesis');
  assert.equal(state.latestDispatch?.dispatchInsights?.suggestedActions?.[0]?.id, 'revise-before-retry');
  assert.match(
    state.dispatchFixHint?.nextCommand ?? '',
    /orchestrate --session session-2 --dispatch local --execute dry-run --format json/
  );
  assert.ok(Array.isArray(state.suggestedCommands));
  assert.ok(state.suggestedCommands.some((cmd) => cmd.includes('orchestrate') && cmd.includes(sessionId)));
  assert.ok(state.suggestedCommands.some((cmd) => cmd.includes('doctor')));
  assert.ok(state.suggestedCommands.some((cmd) => cmd.includes('--apply-draft draft.skill.repeat-blocked.ownership-policy')));

  const rendered = renderHud(state, { preset: 'focused' });
  assert.match(rendered, /Dispatch Insights: status=attention score=85/);
  assert.match(rendered, /Dispatch Progress: jobs total=2 done=1 running=0 blocked=1 queued=0 completion=50%/);
  assert.match(rendered, /Tool Progress: local-phase 1\/2 \(r=0 b=1 q=0\)/);
  assert.match(rendered, /Quality: failed \(quality-logs\)/);
  assert.match(rendered, /Dispatch Hindsight: pairs=1/);
  assert.match(rendered, /FixHint: \[runbook\.dispatch-merge-triage\]/);
  assert.match(rendered, /SkillCandidate: skill=skill-constraints/);

  const minimal = renderHud(state, { preset: 'minimal' });
  assert.match(minimal, /insights=attention\(85\)/);
});

test('readHudState caches latest checkpoint tail until file changes', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-checkpoint-cache-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'checkpoint-cache-session';
  const sessionDir = path.join(sessionsRoot, sessionId);
  const checkpointPath = path.join(sessionDir, 'l1-checkpoints.jsonl');

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T00:00:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), { sessionId, status: 'running' });
  await writeJsonLines(checkpointPath, [
    {
      seq: 1,
      ts: '2026-04-06T00:00:00.000Z',
      status: 'running',
      summary: 'First checkpoint',
      nextActions: [],
      artifacts: [],
    },
  ]);

  const originalOpen = fs.open;
  let openCount = 0;
  fs.open = async (filePath, flags, ...rest) => {
    if (String(filePath) === checkpointPath && String(flags) === 'r') {
      openCount += 1;
    }
    return await originalOpen(filePath, flags, ...rest);
  };

  try {
    const first = await readHudState({ rootDir, sessionId });
    const second = await readHudState({ rootDir, sessionId });

    assert.equal(first.latestCheckpoint?.seq, 1);
    assert.equal(second.latestCheckpoint?.seq, 1);
    assert.equal(openCount, 1);

    await fs.appendFile(
      checkpointPath,
      `${JSON.stringify({
        seq: 2,
        ts: '2026-04-06T00:00:01.000Z',
        status: 'running',
        summary: 'Second checkpoint',
        nextActions: [],
        artifacts: [],
      })}\n`,
      'utf8'
    );

    const third = await readHudState({ rootDir, sessionId });
    assert.equal(third.latestCheckpoint?.seq, 2);
    assert.equal(openCount, 2);
  } finally {
    fs.open = originalOpen;
  }
});

test('readHudState fast mode skips non-minimal heavy reads', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-fast-state-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'fast-state-session';
  const sessionDir = path.join(sessionsRoot, sessionId);
  const statePath = path.join(sessionDir, 'state.json');
  const checkpointPath = path.join(sessionDir, 'l1-checkpoints.jsonl');

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T02:00:00.000Z' })
  );
  await writeJson(statePath, { sessionId, status: 'running', nextActions: ['inspect'] });
  await writeJsonLines(checkpointPath, [
    {
      seq: 1,
      ts: '2026-04-06T02:00:00.000Z',
      status: 'running',
      summary: 'checkpoint should be skipped in fast mode',
      nextActions: [],
      artifacts: [],
    },
  ]);
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260406T020000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-06T02:00:00.000Z',
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [
        {
          jobId: 'phase.implement.wi.1',
          jobType: 'phase',
          role: 'implementer',
          status: 'blocked',
          attempts: 1,
          output: { error: 'File policy violation' },
        },
      ],
      finalOutputs: [],
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T020100Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T02:00:10.000Z',
    persistedAt: '2026-04-06T02:01:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership policy checks.',
    },
    evidence: {
      sourceArtifactPath: '.aios/context-db/sessions/fast-state-session/artifacts/dispatch-run-20260406T020000Z.json',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });
  await writeJsonLines(path.join(sessionDir, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T02:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T020000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'retry-needed',
        nextStateRefs: ['category:quality-logs'],
      },
    },
  ]);

  const originalReadFile = fs.readFile;
  const originalOpen = fs.open;
  const reads = { state: 0, checkpointOpen: 0 };
  fs.readFile = async (filePath, ...rest) => {
    if (String(filePath) === statePath) {
      reads.state += 1;
    }
    return await originalReadFile(filePath, ...rest);
  };
  fs.open = async (filePath, flags, ...rest) => {
    if (String(filePath) === checkpointPath && String(flags) === 'r') {
      reads.checkpointOpen += 1;
    }
    return await originalOpen(filePath, flags, ...rest);
  };

  try {
    const state = await readHudState({ rootDir, sessionId, fast: true });
    assert.equal(state.selection.sessionId, sessionId);
    assert.equal(state.session?.sessionId, sessionId);
    assert.equal(state.sessionState, null);
    assert.equal(state.latestCheckpoint, null);
    assert.equal(state.latestDispatch?.ok, false);
    assert.equal(state.latestDispatch?.blockedJobs, 1);
    assert.equal(state.latestSkillCandidate?.skillId, 'skill-constraints');
    assert.equal(state.latestSkillCandidate?.failureClass, 'ownership-policy');
    assert.equal(state.latestSkillCandidate?.lessonCount, 2);
    assert.equal(state.latestQualityGate?.turnId, 'quality-gate:20260406T020000Z:summary');
    assert.equal(state.latestQualityGate?.categoryRef, 'category:quality-logs');
    assert.equal(state.dispatchHindsight, null);
    assert.equal(state.dispatchFixHint, null);
    assert.deepEqual(state.suggestedCommands, []);
    assert.deepEqual(reads, { state: 0, checkpointOpen: 0 });
  } finally {
    fs.readFile = originalReadFile;
    fs.open = originalOpen;
  }
});

test('readHudState caches meta/state JSON reads until files change', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-json-cache-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'json-cache-session';
  const sessionDir = path.join(sessionsRoot, sessionId);
  const metaPath = path.join(sessionDir, 'meta.json');
  const statePath = path.join(sessionDir, 'state.json');

  await writeJson(
    metaPath,
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T00:00:00.000Z' })
  );
  await writeJson(statePath, { sessionId, status: 'running', nextActions: ['A'] });
  await writeJsonLines(path.join(sessionDir, 'l1-checkpoints.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T00:00:00.000Z',
      status: 'running',
      summary: 'First checkpoint',
      nextActions: [],
      artifacts: [],
    },
  ]);

  const originalReadFile = fs.readFile;
  const reads = { meta: 0, state: 0 };
  fs.readFile = async (filePath, ...rest) => {
    if (String(filePath) === metaPath) reads.meta += 1;
    if (String(filePath) === statePath) reads.state += 1;
    return await originalReadFile(filePath, ...rest);
  };

  try {
    const first = await readHudState({ rootDir, sessionId });
    const second = await readHudState({ rootDir, sessionId });

    assert.equal(first.session?.sessionId, sessionId);
    assert.equal(first.sessionState?.nextActions?.[0], 'A');
    assert.equal(second.session?.sessionId, sessionId);
    assert.equal(second.sessionState?.nextActions?.[0], 'A');
    assert.deepEqual(reads, { meta: 1, state: 1 });

    await writeJson(statePath, { sessionId, status: 'running', nextActions: ['B'] });

    const third = await readHudState({ rootDir, sessionId });
    assert.equal(third.sessionState?.nextActions?.[0], 'B');
    assert.deepEqual(reads, { meta: 1, state: 2 });
  } finally {
    fs.readFile = originalReadFile;
  }
});

test('readHudState caches skill-candidate artifact reads until files change', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-skill-candidate-cache-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'skill-candidate-cache-session';
  const sessionDir = path.join(sessionsRoot, sessionId);
  const artifactsDir = path.join(sessionDir, 'artifacts');
  const candidatePath = path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T010000Z-debug-runtime-error.json');

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T01:00:00.000Z' })
  );
  await writeJson(candidatePath, {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T01:00:00.000Z',
    persistedAt: '2026-04-06T01:00:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 1,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'first hint',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });

  const originalReadFile = fs.readFile;
  const reads = { candidate: 0 };
  fs.readFile = async (filePath, ...rest) => {
    const normalized = String(filePath);
    if (normalized.startsWith(artifactsDir) && normalized.includes('skill-candidate-')) {
      reads.candidate += 1;
    }
    return await originalReadFile(filePath, ...rest);
  };

  try {
    const first = await readHudState({ rootDir, sessionId, fast: true, skillCandidateLimit: 3 });
    const firstReadCount = reads.candidate;
    const second = await readHudState({ rootDir, sessionId, fast: true, skillCandidateLimit: 3 });

    assert.equal(first.latestSkillCandidate?.skillId, 'debug');
    assert.equal(first.recentSkillCandidates.length, 1);
    assert.equal(second.recentSkillCandidates.length, 1);
    assert.ok(firstReadCount >= 1);
    assert.equal(reads.candidate, firstReadCount);

    const nextCandidatePath = path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T010010Z-debug-runtime-error.json');
    await writeJson(nextCandidatePath, {
      schemaVersion: 1,
      kind: 'learn-eval.skill-candidate',
      sessionId,
      generatedAt: '2026-04-06T01:00:00.000Z',
      persistedAt: '2026-04-06T01:00:10.000Z',
      lessonCluster: {
        kind: 'repeat-blocked',
        failureClass: 'runtime-error',
        count: 1,
      },
      candidate: {
        skillId: 'debug',
        scope: 'runtime-triage',
        patchHint: 'updated hint',
      },
      review: {
        status: 'candidate',
        mode: 'manual',
        sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
      },
    });

    let third = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      third = await readHudState({ rootDir, sessionId, fast: true, skillCandidateLimit: 3 });
      if (third.latestSkillCandidate?.patchHint === 'updated hint') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(third.latestSkillCandidate?.patchHint, 'updated hint');
    assert.ok(reads.candidate > firstReadCount);
  } finally {
    fs.readFile = originalReadFile;
  }
});

test('readHudDispatchSummary includes latest dispatch, hindsight, and fix hint', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-summary-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'dispatch-summary-session';
  const sessionDir = path.join(sessionsRoot, sessionId);
  const meta = makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-05T03:00:00.000Z' });

  await writeJson(path.join(sessionDir, 'meta.json'), meta);

  const jobRuns = (attempts) => [
    {
      jobId: 'phase.implement.wi.1',
      jobType: 'phase',
      role: 'implementer',
      executor: 'local-phase',
      status: 'blocked',
      attempts,
      output: { error: 'File policy violation' },
    },
    {
      jobId: 'phase.plan',
      jobType: 'phase',
      role: 'planner',
      executor: 'local-phase',
      status: 'simulated',
      output: { outputType: 'handoff' },
    },
  ];

  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260405T025900Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-05T02:59:00.000Z',
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: jobRuns(1),
      finalOutputs: [],
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260405T030000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-05T03:00:00.000Z',
    dispatchInsights: {
      schemaVersion: 1,
      generatedAt: '2026-04-05T03:00:00.000Z',
      status: 'attention',
      score: 85,
      signals: [
        {
          id: 'work.blocked',
          severity: 'block',
          message: 'Blocked dispatch work detected.',
          count: 1,
        },
        {
          id: 'retry.same-hypothesis',
          severity: 'warn',
          message: 'Retry attempts repeated the same hypothesis.',
          count: 1,
        },
      ],
      suggestedActions: [
        {
          id: 'inspect-blockers',
          label: 'Inspect blocked handoffs and resolve the first concrete blocker before rerunning.',
        },
        {
          id: 'revise-before-retry',
          label: 'Change the hypothesis or execution plan before retrying blocked jobs.',
        },
      ],
    },
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: jobRuns(2),
      finalOutputs: [],
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260405T030100Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-05T03:00:10.000Z',
    persistedAt: '2026-04-05T03:01:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    evidence: {
      sourceArtifactPath: '.aios/context-db/sessions/dispatch-summary-session/artifacts/dispatch-run-20260405T030000Z.json',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });
  await writeJsonLines(path.join(sessionDir, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-05T03:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260405T030000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'retry-needed',
        nextStateRefs: ['category:quality-logs'],
      },
    },
  ]);

  const summary = await readHudDispatchSummary({ rootDir, sessionId, provider: 'codex', meta });
  assert.equal(summary.sessionId, sessionId);
  assert.equal(summary.provider, 'codex');
  assert.equal(summary.latestDispatch?.ok, false);
  assert.equal(summary.latestDispatch?.jobCount, 2);
  assert.equal(summary.latestDispatch?.blockedJobs, 1);
  assert.equal(summary.latestDispatch?.jobProgress?.total, 2);
  assert.equal(summary.latestDispatch?.jobProgress?.done, 1);
  assert.equal(summary.latestDispatch?.jobProgress?.blocked, 1);
  assert.equal(summary.latestDispatch?.jobProgress?.completionRatio, 0.5);
  assert.equal(summary.latestDispatch?.toolProgress?.[0]?.tool, 'local-phase');
  assert.equal(summary.latestDispatch?.toolProgress?.[0]?.done, 1);
  assert.equal(summary.latestDispatch?.toolProgress?.[0]?.blocked, 1);
  assert.ok(String(summary.latestDispatch?.artifactPath || '').includes('dispatch-run-20260405T030000Z.json'));
  assert.equal(summary.latestSkillCandidate?.skillId, 'skill-constraints');
  assert.equal(summary.latestSkillCandidate?.scope, 'ownership-policy');
  assert.equal(summary.latestSkillCandidate?.failureClass, 'ownership-policy');
  assert.equal(summary.latestSkillCandidate?.lessonCount, 2);
  assert.ok(String(summary.latestSkillCandidate?.artifactPath || '').includes('skill-candidate-20260405T030100Z-skill-constraints-ownership-policy.json'));
  assert.equal(summary.dispatchHindsight?.pairsAnalyzed, 1);
  assert.equal(summary.dispatchHindsight?.repeatedBlockedTurns, 1);
  assert.equal(summary.latestQualityGate?.turnId, 'quality-gate:20260405T030000Z:summary');
  assert.equal(summary.latestQualityGate?.categoryRef, 'category:quality-logs');
  assert.equal(summary.latestQualityGate?.failureCategory, 'quality-logs');
  assert.equal(summary.dispatchFixHint?.targetId, 'runbook.dispatch-merge-triage');
  assert.match(
    summary.dispatchFixHint?.nextCommand ?? '',
    /orchestrate --session dispatch-summary-session --dispatch local --execute dry-run --format json/
  );
});

test('readHudDispatchSummary refreshes latest dispatch after new artifact is written', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-dispatch-cache-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'dispatch-cache-session';
  const sessionDir = path.join(sessionsRoot, sessionId);
  const meta = makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T00:00:00.000Z' });

  await writeJson(path.join(sessionDir, 'meta.json'), meta);

  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260406T000000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-06T00:00:00.000Z',
    dispatchRun: {
      ok: true,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [],
      finalOutputs: [],
    },
  });

  const first = await readHudDispatchSummary({ rootDir, sessionId, provider: 'codex', meta });
  assert.ok(String(first.latestDispatch?.artifactPath || '').includes('dispatch-run-20260406T000000Z.json'));

  await new Promise((resolve) => setTimeout(resolve, 10));
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260406T000001Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-06T00:00:01.000Z',
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [
        {
          jobId: 'phase.implement.wi.1',
          jobType: 'phase',
          role: 'implementer',
          status: 'blocked',
          attempts: 1,
          output: { error: 'File policy violation' },
        },
      ],
      finalOutputs: [],
    },
  });

  const second = await readHudDispatchSummary({ rootDir, sessionId, provider: 'codex', meta });
  assert.ok(String(second.latestDispatch?.artifactPath || '').includes('dispatch-run-20260406T000001Z.json'));
  assert.equal(second.latestDispatch?.ok, false);
  assert.equal(second.latestDispatch?.blockedJobs, 1);
});

test('runTeamHistory includes dispatch hindsight summary and fix hint', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-history-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'history-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-05T03:00:00.000Z' })
  );

  const jobRuns = (attempts) => [
    {
      jobId: 'phase.implement.wi.1',
      jobType: 'phase',
      role: 'implementer',
      status: 'blocked',
      attempts,
      output: { error: 'File policy violation' },
    },
    {
      jobId: 'phase.plan',
      jobType: 'phase',
      role: 'planner',
      status: 'simulated',
      output: { outputType: 'handoff' },
    },
  ];

  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260405T025900Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-05T02:59:00.000Z',
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: jobRuns(1),
      finalOutputs: [],
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260405T030000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-05T03:00:00.000Z',
    dispatchInsights: {
      schemaVersion: 1,
      generatedAt: '2026-04-05T03:00:00.000Z',
      status: 'attention',
      score: 85,
      signals: [
        {
          id: 'work.blocked',
          severity: 'block',
          message: 'Blocked dispatch work detected.',
          count: 1,
        },
        {
          id: 'retry.same-hypothesis',
          severity: 'warn',
          message: 'Retry attempts repeated the same hypothesis.',
          count: 1,
        },
      ],
      suggestedActions: [
        {
          id: 'inspect-blockers',
          label: 'Inspect blocked handoffs and resolve the first concrete blocker before rerunning.',
        },
        {
          id: 'revise-before-retry',
          label: 'Change the hypothesis or execution plan before retrying blocked jobs.',
        },
      ],
    },
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: jobRuns(2),
      finalOutputs: [],
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260405T030100Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-05T03:00:10.000Z',
    persistedAt: '2026-04-05T03:01:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });
  await writeJsonLines(path.join(sessionDir, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-05T03:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260405T030000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'retry-needed',
        nextStateRefs: ['check:logs', 'category:quality-logs'],
      },
    },
  ]);

  const logs = [];
  await runTeamHistory(
    { provider: 'codex', limit: 5, json: true },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.dispatchBlocked, 1);
  assert.equal(report.summary.hindsightUnstable, 1);
  assert.equal(report.summary.topFailures?.[0]?.failureClass, 'ownership-policy');
  assert.equal(report.summary.topQualityFailures?.[0]?.failureCategory, 'quality-logs');
  assert.equal(report.summary.topFixHints?.[0]?.targetId, 'runbook.dispatch-merge-triage');
  assert.equal(report.summary.topJobs?.[0]?.jobId, 'phase.implement.wi.1');
  assert.equal(report.summary.topSkillCandidates?.[0]?.skillId, 'skill-constraints');
  assert.equal(report.summary.topSkillCandidates?.[0]?.failureClass, 'ownership-policy');
  assert.equal(report.summary.topInsightSignals?.[0]?.signalId, 'work.blocked');
  const record = report.records.find((item) => item.sessionId === sessionId);
  assert.ok(record, 'expected history record');
  assert.equal(record.dispatchInsights.status, 'attention');
  assert.equal(record.dispatchInsights.score, 85);
  assert.equal(record.dispatchInsights.topSignalId, 'work.blocked');
  assert.equal(record.dispatchInsights.topSignalSeverity, 'block');
  assert.equal(record.dispatchInsights.signalCount, 2);
  assert.equal(record.dispatchInsights.topActionId, 'inspect-blockers');
  assert.equal(record.dispatchHindsight.pairsAnalyzed, 1);
  assert.equal(record.dispatchHindsight.repeatedBlockedTurns, 1);
  assert.equal(record.dispatchHindsight.topFailureClass, 'ownership-policy');
  assert.equal(record.dispatchHindsight.topRepeatedJobId, 'phase.implement.wi.1');
  assert.equal(record.qualityGate.outcome, 'retry-needed');
  assert.equal(record.qualityGate.failureCategory, 'quality-logs');
  assert.equal(record.dispatchFixHint.targetId, 'runbook.dispatch-merge-triage');
  assert.equal(record.skillCandidate.skillId, 'skill-constraints');
  assert.equal(record.skillCandidate.failureClass, 'ownership-policy');
  assert.equal(record.skillCandidate.lessonCount, 2);
  assert.equal(record.skillCandidate.reviewMode, 'manual');
  assert.equal(record.skillCandidate.sourceDraftTargetId, 'draft.skill.repeat-blocked.ownership-policy');
  assert.ok(String(record.skillCandidate.artifactPath || '').includes('skill-candidate-20260405T030100Z-skill-constraints-ownership-policy.json'));
  assert.match(
    record.dispatchFixHint.nextCommand ?? '',
    /orchestrate --session history-session --dispatch local --execute dry-run --format json/
  );
});

test('runTeamHistory fast mode skips dispatch hindsight and fix hint', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-history-fast-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'history-fast-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T03:00:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260406T030000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-06T03:00:00.000Z',
    dispatchInsights: {
      schemaVersion: 1,
      generatedAt: '2026-04-06T03:00:00.000Z',
      status: 'blocked',
      score: 40,
      signals: [
        {
          id: 'work.blocked',
          severity: 'block',
          message: 'Blocked dispatch work detected.',
          count: 1,
        },
      ],
      suggestedActions: [
        {
          id: 'inspect-blockers',
          label: 'Inspect blocked handoffs and resolve the first concrete blocker before rerunning.',
        },
      ],
    },
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [
        {
          jobId: 'phase.implement.wi.1',
          jobType: 'phase',
          role: 'implementer',
          status: 'blocked',
          attempts: 1,
          output: { error: 'File policy violation' },
        },
      ],
      finalOutputs: [],
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T030100Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T03:00:10.000Z',
    persistedAt: '2026-04-06T03:01:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership policy checks.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });
  await writeJsonLines(path.join(sessionDir, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T03:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T030000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'retry-needed',
        nextStateRefs: ['category:quality-logs'],
      },
    },
  ]);

  const logs = [];
  await runTeamHistory(
    { provider: 'codex', limit: 5, json: true, fast: true },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));
  assert.equal(report.fast, true);
  assert.equal(report.records.length, 1);
  const record = report.records[0];
  assert.equal(record.sessionId, sessionId);
  assert.equal(record.dispatchInsights.status, 'blocked');
  assert.equal(record.dispatchInsights.score, 40);
  assert.equal(record.dispatchInsights.topSignalId, 'work.blocked');
  assert.equal(record.dispatchInsights.topSignalSeverity, 'block');
  assert.equal(record.dispatchInsights.signalCount, 1);
  assert.equal(record.dispatchInsights.topActionId, 'inspect-blockers');
  assert.equal(record.dispatchHindsight, null);
  assert.equal(record.dispatchFixHint, null);
  assert.equal(record.skillCandidate.skillId, 'skill-constraints');
  assert.equal(record.skillCandidate.failureClass, 'ownership-policy');
  assert.equal(record.skillCandidate.lessonCount, 2);
  assert.equal(record.qualityGate.outcome, 'retry-needed');
  assert.equal(record.qualityGate.failureCategory, 'quality-logs');
});

test('runTeamStatus --show-skill-candidates renders detailed candidate rows', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-status-skill-candidates-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'status-skill-candidate-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T08:00:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T08:00:00.000Z',
  });
  await writeJsonLines(path.join(sessionDir, 'l1-checkpoints.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T08:00:00.000Z',
      status: 'running',
      summary: 'Checkpoint',
      nextActions: [],
      artifacts: [],
    },
  ]);

  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260406T080000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-06T08:00:00.000Z',
    dispatchRun: {
      ok: true,
      mode: 'dry-run',
      executorRegistry: ['local-dry-run'],
      jobRuns: [],
      finalOutputs: [],
    },
  });

  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T080100Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T08:01:00.000Z',
    persistedAt: '2026-04-06T08:01:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T080000Z-debug-runtime-error.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T08:00:00.000Z',
    persistedAt: '2026-04-06T08:00:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 1,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'Run evidence-first runtime triage.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });

  const logs = [];
  await runTeamStatus(
    { provider: 'codex', sessionId, showSkillCandidates: true, preset: 'focused' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const output = logs.join('\n');
  assert.match(output, /Skill Candidates:/);
  assert.match(output, /skill=skill-constraints/);
  assert.match(output, /draft=draft\.skill\.repeat-blocked\.ownership-policy/);
  assert.match(output, /skill=debug/);
  assert.match(output, /draft=draft\.skill\.repeat-blocked\.runtime-error/);

  const limitedLogs = [];
  await runTeamStatus(
    { provider: 'codex', sessionId, showSkillCandidates: true, skillCandidateLimit: 1, preset: 'focused' },
    { rootDir, io: { log: (line) => limitedLogs.push(line) } }
  );
  const limitedOutput = limitedLogs.join('\n');
  assert.match(limitedOutput, /skill=skill-constraints/);
  assert.doesNotMatch(limitedOutput, /skill=debug/);
});

test('runTeamStatus supports direct skill-candidate detail mode', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-status-skill-candidates-detail-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'status-skill-candidate-detail-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T10:00:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T10:00:00.000Z',
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T100000Z-debug-runtime-error.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T10:00:00.000Z',
    persistedAt: '2026-04-06T10:00:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 2,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'Run evidence-first runtime triage.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });

  const logs = [];
  await runTeamStatus(
    { provider: 'codex', sessionId, showSkillCandidates: true, skillCandidateView: 'detail', preset: 'focused' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const output = logs.join('\n');
  assert.match(output, /Skill Candidates:/);
  assert.match(output, /skill=debug/);
  assert.doesNotMatch(output, /AIOS Team Status/);
  assert.doesNotMatch(output, /Checkpoint:/);
});

test('runTeamStatus --watch surfaces stalled progress when dispatch counters stop changing', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-status-watch-stalled-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'status-watch-stalled-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T10:30:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T10:30:00.000Z',
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260406T103000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-06T10:30:00.000Z',
    dispatchRun: {
      ok: false,
      mode: 'dry-run',
      executorRegistry: ['local-phase'],
      jobRuns: [
        {
          jobId: 'phase.plan',
          jobType: 'phase',
          role: 'planner',
          status: 'completed',
          output: { outputType: 'handoff' },
        },
        {
          jobId: 'phase.implement',
          jobType: 'phase',
          role: 'implementer',
          status: 'running',
          output: { outputType: 'handoff' },
        },
        {
          jobId: 'phase.review',
          jobType: 'phase',
          role: 'reviewer',
          status: 'blocked',
          output: { outputType: 'handoff', error: 'awaiting clarification' },
        },
      ],
      finalOutputs: [],
    },
  });

  let nowMs = 0;
  const frames = [];
  await runTeamStatus(
    {
      provider: 'codex',
      sessionId,
      watch: true,
      preset: 'minimal',
      intervalMs: 500,
    },
    {
      rootDir,
      env: {
        ...process.env,
        AIOS_WATCH_STALLED_MS: '1500',
      },
      nowFn: () => nowMs,
      watchLoop: async (render) => {
        frames.push(await render());
        nowMs = 900;
        frames.push(await render());
        nowMs = 1700;
        frames.push(await render());
      },
    }
  );

  assert.equal(frames.length, 3);
  assert.doesNotMatch(frames[0], /stalled=on/);
  assert.doesNotMatch(frames[1], /stalled=on/);
  assert.match(frames[2], /stalled=on\(/);
  assert.match(frames[2], /tools=local-phase/);
});

test('regression chain recall -> orchestrate -> team status stays connected', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-regression-chain-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'regression-chain-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  const sessionMeta = makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-07T02:00:00.000Z' });
  await writeJson(
    path.join(sessionDir, 'meta.json'),
    {
      ...sessionMeta,
      goal: 'login hardening regressions',
    }
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-07T02:00:00.000Z',
  });
  await writeJsonLines(path.join(sessionDir, 'l1-checkpoints.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-07T01:50:00.000Z',
      status: 'running',
      summary: 'Investigate login hardening regressions',
      nextActions: ['Run dry-run orchestrate'],
      artifacts: [],
    },
  ]);

  const orchestrateLogs = [];
  const orchestrateResult = await runOrchestrate(
    {
      sessionId,
      dispatchMode: 'local',
      executionMode: 'dry-run',
      format: 'json',
    },
    {
      rootDir,
      io: { log: (line) => orchestrateLogs.push(String(line)) },
    }
  );
  assert.equal(orchestrateResult.exitCode, 0);
  const orchestrateReport = JSON.parse(orchestrateLogs.at(-1));
  assert.equal(orchestrateReport.dispatchRun.mode, 'dry-run');
  assert.equal(orchestrateReport.dispatchRun.ok, true);
  assert.equal((orchestrateReport.dispatchRun.jobRuns || []).length > 0, true);

  const recallPayload = runContextDbCli([
    'recall:sessions',
    '--workspace',
    rootDir,
    '--project',
    'aios',
    '--query',
    'login hardening regressions',
    '--limit',
    '3',
    '--highlight-limit',
    '2',
    '--explain-score',
  ]);
  assert.equal(Array.isArray(recallPayload.results), true);
  assert.equal(recallPayload.results[0]?.sessionId, sessionId);
  assert.equal(Boolean(recallPayload.results[0]?.scoreExplanation), true);

  const statusLogs = [];
  const statusResult = await runTeamStatus(
    { provider: 'codex', sessionId, json: true },
    { rootDir, io: { log: (line) => statusLogs.push(String(line)) } }
  );
  assert.equal(statusResult.exitCode, 0);
  const statusPayload = JSON.parse(statusLogs.at(-1));
  assert.equal(statusPayload.selection?.sessionId, sessionId);
  assert.equal(statusPayload.latestDispatch?.mode, 'dry-run');
  assert.equal((statusPayload.latestDispatch?.jobProgress?.total || 0) > 0, true);
});

test('runTeamStatus exports skill-candidate patch template artifact in one command', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-status-skill-candidates-patch-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'status-skill-candidate-patch-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T11:00:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T11:00:00.000Z',
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T110000Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T11:00:00.000Z',
    persistedAt: '2026-04-06T11:00:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 3,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });

  const logs = [];
  await runTeamStatus(
    {
      provider: 'codex',
      sessionId,
      showSkillCandidates: true,
      skillCandidateView: 'detail',
      exportSkillCandidatePatchTemplate: true,
      preset: 'focused',
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );

  const output = logs.join('\n');
  assert.match(output, /Skill candidate patch template artifact:/);
  const artifactMatch = output.match(/Skill candidate patch template artifact: ([^\s]+)/);
  assert.ok(artifactMatch?.[1]);
  const artifactPath = String(artifactMatch[1]);
  const artifactAbsPath = path.join(rootDir, artifactPath);
  const artifactText = await fs.readFile(artifactAbsPath, 'utf8');

  assert.match(artifactText, /# Skill Candidate Patch Templates/);
  assert.match(artifactText, /\*\*\* Begin Patch/);
  assert.match(artifactText, /\*\*\* Update File: \.codex\/skills\/skill-constraints\/SKILL\.md/);
  assert.match(artifactText, /draft\.skill\.repeat-blocked\.ownership-policy/);
  assert.match(artifactText, /Add ownership boundary guidance/);
});

test('runTeamStatus --draft-id filters skill candidates for detail and patch export', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-status-skill-candidates-draft-id-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'status-skill-candidate-draft-id-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T11:30:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T11:30:00.000Z',
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T113000Z-debug-runtime-error.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T11:30:00.000Z',
    persistedAt: '2026-04-06T11:30:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 2,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'Run evidence-first runtime triage.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T112900Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T11:29:00.000Z',
    persistedAt: '2026-04-06T11:29:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });

  const logs = [];
  await runTeamStatus(
    {
      provider: 'codex',
      sessionId,
      showSkillCandidates: true,
      skillCandidateView: 'detail',
      draftId: 'draft.skill.repeat-blocked.runtime-error',
      exportSkillCandidatePatchTemplate: true,
      preset: 'focused',
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );

  const output = logs.join('\n');
  assert.match(output, /skill=debug/);
  assert.doesNotMatch(output, /skill=skill-constraints/);
  const artifactMatch = output.match(/Skill candidate patch template artifact: ([^\s]+)/);
  assert.ok(artifactMatch?.[1]);
  const artifactPath = String(artifactMatch[1]);
  const artifactText = await fs.readFile(path.join(rootDir, artifactPath), 'utf8');
  assert.match(artifactText, /Candidate 1: debug \/ runtime-error/);
  assert.doesNotMatch(artifactText, /skill-constraints/);
});

test('runHud --show-skill-candidates renders detailed candidate rows', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-skill-candidates-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'hud-skill-candidate-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T09:00:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T09:00:00.000Z',
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T090000Z-debug-runtime-error.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T09:00:00.000Z',
    persistedAt: '2026-04-06T09:00:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 1,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'Run evidence-first runtime triage.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T085900Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T08:59:00.000Z',
    persistedAt: '2026-04-06T08:59:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });

  const logs = [];
  await runHud(
    { provider: 'codex', sessionId, showSkillCandidates: true, preset: 'focused' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const output = logs.join('\n');
  assert.match(output, /Skill Candidates:/);
  assert.match(output, /skill=debug/);
  assert.match(output, /draft=draft\.skill\.repeat-blocked\.runtime-error/);

  const limitedLogs = [];
  await runHud(
    { provider: 'codex', sessionId, showSkillCandidates: true, skillCandidateLimit: 1, preset: 'focused' },
    { rootDir, io: { log: (line) => limitedLogs.push(line) } }
  );
  const limitedOutput = limitedLogs.join('\n');
  assert.match(limitedOutput, /skill=debug/);
  assert.doesNotMatch(limitedOutput, /skill=skill-constraints/);
});

test('runHud supports direct skill-candidate detail mode, draft filtering, and patch export', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-hud-skill-candidates-detail-export-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'hud-skill-candidate-detail-export-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T11:45:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T11:45:00.000Z',
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T114500Z-debug-runtime-error.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T11:45:00.000Z',
    persistedAt: '2026-04-06T11:45:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 2,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'Run evidence-first runtime triage.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T114400Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T11:44:00.000Z',
    persistedAt: '2026-04-06T11:44:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });

  const logs = [];
  await runHud(
    {
      provider: 'codex',
      sessionId,
      showSkillCandidates: true,
      skillCandidateView: 'detail',
      draftId: 'draft.skill.repeat-blocked.runtime-error',
      exportSkillCandidatePatchTemplate: true,
      preset: 'focused',
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const output = logs.join('\n');
  assert.match(output, /Skill Candidates:/);
  assert.match(output, /skill=debug/);
  assert.doesNotMatch(output, /skill=skill-constraints/);
  assert.doesNotMatch(output, /AIOS Team Status/);
  const artifactMatch = output.match(/Skill candidate patch template artifact: ([^\s]+)/);
  assert.ok(artifactMatch?.[1]);
  const artifactPath = String(artifactMatch[1]);
  const artifactText = await fs.readFile(path.join(rootDir, artifactPath), 'utf8');
  assert.match(artifactText, /Candidate 1: debug \/ runtime-error/);
  assert.doesNotMatch(artifactText, /skill-constraints/);
});

test('runTeamHistory quality-failed-only filters sessions by quality gate outcome', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-history-quality-filter-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const successSessionId = 'history-quality-success';
  const failedSessionId = 'history-quality-failed';

  await writeJson(
    path.join(sessionsRoot, successSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: successSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T04:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, failedSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: failedSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T03:00:00.000Z' })
  );

  await writeJsonLines(path.join(sessionsRoot, successSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T04:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate passed',
      turn: {
        turnId: 'quality-gate:20260406T040000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'success',
      },
    },
  ]);

  await writeJsonLines(path.join(sessionsRoot, failedSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T03:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T030000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'retry-needed',
        nextStateRefs: ['category:quality-logs'],
      },
    },
  ]);

  const logs = [];
  await runTeamHistory(
    { provider: 'codex', limit: 1, json: true, fast: true, qualityFailedOnly: true },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));
  assert.equal(report.qualityFailedOnly, true);
  assert.equal(report.summary.total, 1);
  assert.equal(report.records.length, 1);
  assert.equal(report.records[0].sessionId, failedSessionId);
  assert.equal(report.records[0].qualityGate.outcome, 'retry-needed');
  assert.equal(report.records[0].qualityGate.failureCategory, 'quality-logs');
});

test('runTeamHistory quality-category filters to failed records with matching category', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-history-quality-category-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const successSessionId = 'history-quality-category-success';
  const failedLogsSessionId = 'history-quality-category-failed-logs';
  const failedOtherSessionId = 'history-quality-category-failed-other';

  await writeJson(
    path.join(sessionsRoot, successSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: successSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T05:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, failedLogsSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: failedLogsSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T04:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, failedOtherSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: failedOtherSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T03:00:00.000Z' })
  );

  await writeJsonLines(path.join(sessionsRoot, successSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T05:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate passed',
      turn: {
        turnId: 'quality-gate:20260406T050000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'success',
        nextStateRefs: ['category:quality-logs'],
      },
    },
  ]);

  await writeJsonLines(path.join(sessionsRoot, failedLogsSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T04:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T040000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'retry-needed',
        nextStateRefs: ['category:quality-logs'],
      },
    },
  ]);

  await writeJsonLines(path.join(sessionsRoot, failedOtherSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T03:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T030000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'failed',
        nextStateRefs: ['category:contextdb-quality-regression'],
      },
    },
  ]);

  const logs = [];
  await runTeamHistory(
    { provider: 'codex', limit: 1, json: true, fast: true, qualityCategory: 'quality-logs' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));
  assert.equal(report.qualityFailedOnly, false);
  assert.equal(report.qualityCategory, 'quality-logs');
  assert.equal(report.summary.total, 1);
  assert.equal(report.records.length, 1);
  assert.equal(report.records[0].sessionId, failedLogsSessionId);
  assert.equal(report.records[0].qualityGate.outcome, 'retry-needed');
  assert.equal(report.records[0].qualityGate.failureCategory, 'quality-logs');
});

test('runTeamHistory quality-category-prefix filters failed category families with comma-separated prefixes', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-history-quality-category-prefix-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const failedLogsSessionId = 'history-quality-prefix-failed-logs';
  const failedMetricsSessionId = 'history-quality-prefix-failed-metrics';
  const failedOtherSessionId = 'history-quality-prefix-failed-other';
  const successSessionId = 'history-quality-prefix-success';

  await writeJson(
    path.join(sessionsRoot, failedLogsSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: failedLogsSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T06:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, failedMetricsSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: failedMetricsSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T05:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, failedOtherSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: failedOtherSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T04:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, successSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: successSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T03:00:00.000Z' })
  );

  await writeJsonLines(path.join(sessionsRoot, failedLogsSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T06:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T060000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'retry-needed',
        nextStateRefs: ['category:quality-logs'],
      },
    },
  ]);
  await writeJsonLines(path.join(sessionsRoot, failedMetricsSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T05:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T050000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'failed',
        nextStateRefs: ['category:quality-metrics'],
      },
    },
  ]);
  await writeJsonLines(path.join(sessionsRoot, failedOtherSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T04:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T040000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'failed',
        nextStateRefs: ['category:contextdb-quality-regression'],
      },
    },
  ]);
  await writeJsonLines(path.join(sessionsRoot, successSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T03:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate passed',
      turn: {
        turnId: 'quality-gate:20260406T030000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'success',
        nextStateRefs: ['category:quality-logs'],
      },
    },
  ]);

  const logs = [];
  await runTeamHistory(
    { provider: 'codex', limit: 4, json: true, fast: true, qualityCategoryPrefix: 'quality-, contextdb-quality-' },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));
  const sessionIds = report.records.map((record) => record.sessionId).sort();
  assert.equal(report.qualityCategoryPrefix, 'quality-, contextdb-quality-');
  assert.deepEqual(report.qualityCategoryPrefixes, ['quality-', 'contextdb-quality-']);
  assert.equal(report.qualityCategoryPrefixMode, 'any');
  assert.equal(report.summary.total, 3);
  assert.deepEqual(sessionIds, [failedLogsSessionId, failedMetricsSessionId, failedOtherSessionId].sort());
});

test('runTeamHistory quality-category-prefix mode=all requires all prefixes to match', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-history-quality-category-prefix-all-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const failedLogsSessionId = 'history-quality-prefix-all-failed-logs';
  const failedMetricsSessionId = 'history-quality-prefix-all-failed-metrics';

  await writeJson(
    path.join(sessionsRoot, failedLogsSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: failedLogsSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T07:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, failedMetricsSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: failedMetricsSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T06:00:00.000Z' })
  );

  await writeJsonLines(path.join(sessionsRoot, failedLogsSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T07:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T070000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'retry-needed',
        nextStateRefs: ['category:quality-logs'],
      },
    },
  ]);

  await writeJsonLines(path.join(sessionsRoot, failedMetricsSessionId, 'l2-events.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-06T06:00:00.000Z',
      role: 'assistant',
      kind: 'verification.quality-gate',
      text: 'quality gate failed',
      turn: {
        turnId: 'quality-gate:20260406T060000Z:summary',
        turnType: 'verification',
        environment: 'quality-gate',
        hindsightStatus: 'evaluated',
        outcome: 'failed',
        nextStateRefs: ['category:quality-metrics'],
      },
    },
  ]);

  const logs = [];
  await runTeamHistory(
    {
      provider: 'codex',
      limit: 5,
      json: true,
      fast: true,
      qualityCategoryPrefix: 'quality-, quality-logs',
      qualityCategoryPrefixMode: 'all',
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));
  assert.equal(report.qualityCategoryPrefixMode, 'all');
  assert.deepEqual(report.qualityCategoryPrefixes, ['quality-', 'quality-logs']);
  assert.equal(report.summary.total, 1);
  assert.equal(report.records.length, 1);
  assert.equal(report.records[0].sessionId, failedLogsSessionId);
});

test('runTeamHistory --draft-id filters sessions by latest skill-candidate draft target id', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-history-draft-id-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const runtimeSessionId = 'history-draft-id-runtime';
  const ownershipSessionId = 'history-draft-id-ownership';

  await writeJson(
    path.join(sessionsRoot, runtimeSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: runtimeSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T12:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, ownershipSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: ownershipSessionId, agent: 'codex-cli', updatedAt: '2026-04-06T11:00:00.000Z' })
  );

  await writeJson(path.join(sessionsRoot, runtimeSessionId, 'artifacts', 'skill-candidate-20260406T120000Z-debug-runtime-error.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId: runtimeSessionId,
    generatedAt: '2026-04-06T12:00:00.000Z',
    persistedAt: '2026-04-06T12:00:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 2,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'Run evidence-first runtime triage.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });
  await writeJson(path.join(sessionsRoot, ownershipSessionId, 'artifacts', 'skill-candidate-20260406T110000Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId: ownershipSessionId,
    generatedAt: '2026-04-06T11:00:00.000Z',
    persistedAt: '2026-04-06T11:00:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });

  const logs = [];
  await runTeamHistory(
    {
      provider: 'codex',
      limit: 5,
      json: true,
      fast: true,
      draftId: 'draft.skill.repeat-blocked.runtime-error',
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  const report = JSON.parse(logs.at(-1));
  assert.equal(report.draftId, 'draft.skill.repeat-blocked.runtime-error');
  assert.equal(report.summary.total, 1);
  assert.equal(report.records.length, 1);
  assert.equal(report.records[0].sessionId, runtimeSessionId);
  assert.equal(report.records[0].skillCandidate.sourceDraftTargetId, 'draft.skill.repeat-blocked.runtime-error');
});

test('runTeamSkillCandidatesList renders filtered candidate rows without status framing', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-skill-candidates-list-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'team-skill-candidates-list-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T12:30:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T12:30:00.000Z',
  });

  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T123000Z-debug-runtime-error.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T12:30:00.000Z',
    persistedAt: '2026-04-06T12:30:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 2,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'Run evidence-first runtime triage.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T122900Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T12:29:00.000Z',
    persistedAt: '2026-04-06T12:29:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });

  const logs = [];
  const result = await runTeamSkillCandidatesList(
    {
      provider: 'codex',
      sessionId,
      draftId: 'draft.skill.repeat-blocked.runtime-error',
      skillCandidateLimit: 6,
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.result.candidateCount, 1);
  const output = logs.join('\n');
  assert.match(output, /Skill Candidates:/);
  assert.match(output, /skill=debug/);
  assert.doesNotMatch(output, /skill-constraints/);
  assert.doesNotMatch(output, /AIOS Team Status/);
  assert.doesNotMatch(output, /Checkpoint:/);
});

test('runTeamSkillCandidatesExport exports patch template artifact without status rendering', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-skill-candidates-export-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'team-skill-candidates-export-session';
  const sessionDir = path.join(sessionsRoot, sessionId);

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T12:30:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T12:30:00.000Z',
  });

  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T123000Z-debug-runtime-error.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T12:30:00.000Z',
    persistedAt: '2026-04-06T12:30:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 2,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'Run evidence-first runtime triage.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });
  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T122900Z-skill-constraints-ownership-policy.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T12:29:00.000Z',
    persistedAt: '2026-04-06T12:29:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'ownership-policy',
      count: 2,
    },
    candidate: {
      skillId: 'skill-constraints',
      scope: 'ownership-policy',
      patchHint: 'Add ownership boundary guidance.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.ownership-policy',
    },
  });

  const logs = [];
  const result = await runTeamSkillCandidatesExport(
    {
      provider: 'codex',
      sessionId,
      draftId: 'draft.skill.repeat-blocked.runtime-error',
      skillCandidateLimit: 6,
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  assert.equal(result.exitCode, 0);
  const output = logs.join('\n');
  assert.match(output, /Skill candidate patch template artifact:/);
  assert.doesNotMatch(output, /AIOS Team Status/);
  assert.doesNotMatch(output, /Checkpoint:/);
  const artifactMatch = output.match(/Skill candidate patch template artifact: ([^\s]+)/);
  assert.ok(artifactMatch?.[1]);
  const artifactPath = String(artifactMatch[1]);
  const artifactText = await fs.readFile(path.join(rootDir, artifactPath), 'utf8');
  assert.match(artifactText, /Candidate 1: debug \/ runtime-error/);
  assert.doesNotMatch(artifactText, /skill-constraints/);
});

test('runTeamSkillCandidatesExport supports explicit output path', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-skill-candidates-export-path-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');
  const sessionId = 'team-skill-candidates-export-path-session';
  const sessionDir = path.join(sessionsRoot, sessionId);
  const explicitOutputPath = 'tmp/skill-candidates/manual-export.md';

  await writeJson(
    path.join(sessionDir, 'meta.json'),
    makeSessionMeta({ sessionId, agent: 'codex-cli', updatedAt: '2026-04-06T12:30:00.000Z' })
  );
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-06T12:30:00.000Z',
  });

  await writeJson(path.join(sessionDir, 'artifacts', 'skill-candidate-20260406T123000Z-debug-runtime-error.json'), {
    schemaVersion: 1,
    kind: 'learn-eval.skill-candidate',
    sessionId,
    generatedAt: '2026-04-06T12:30:00.000Z',
    persistedAt: '2026-04-06T12:30:00.000Z',
    lessonCluster: {
      kind: 'repeat-blocked',
      failureClass: 'runtime-error',
      count: 2,
    },
    candidate: {
      skillId: 'debug',
      scope: 'runtime-triage',
      patchHint: 'Run evidence-first runtime triage.',
    },
    review: {
      status: 'candidate',
      mode: 'manual',
      sourceDraftTargetId: 'draft.skill.repeat-blocked.runtime-error',
    },
  });

  const logs = [];
  const result = await runTeamSkillCandidatesExport(
    {
      provider: 'codex',
      sessionId,
      outputPath: explicitOutputPath,
      skillCandidateLimit: 6,
    },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.result.requestedOutputPath, explicitOutputPath);
  assert.equal(result.result.artifactPath, explicitOutputPath);
  const output = logs.join('\n');
  assert.match(output, /Skill candidate patch template artifact: tmp\/skill-candidates\/manual-export\.md/);
  const artifactText = await fs.readFile(path.join(rootDir, explicitOutputPath), 'utf8');
  assert.match(artifactText, /Candidate 1: debug \/ runtime-error/);
});

test('runTeamHistory preserves session ordering under concurrency', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-team-history-order-'));
  const sessionsRoot = path.join(rootDir, '.aios', 'context-db', 'sessions');

  const firstSessionId = 'history-order-session-a';
  const secondSessionId = 'history-order-session-b';

  await writeJson(
    path.join(sessionsRoot, firstSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: firstSessionId, agent: 'codex-cli', updatedAt: '2026-04-05T05:00:00.000Z' })
  );
  await writeJson(
    path.join(sessionsRoot, secondSessionId, 'meta.json'),
    makeSessionMeta({ sessionId: secondSessionId, agent: 'codex-cli', updatedAt: '2026-04-05T04:00:00.000Z' })
  );

  const jobRuns = (attempts) => [
    {
      jobId: 'phase.implement.wi.1',
      jobType: 'phase',
      role: 'implementer',
      status: 'blocked',
      attempts,
      output: { error: 'File policy violation' },
    },
    {
      jobId: 'phase.plan',
      jobType: 'phase',
      role: 'planner',
      status: 'simulated',
      output: { outputType: 'handoff' },
    },
  ];

  const writePair = async (sessionId, olderName, olderTs, newerName, newerTs) => {
    const artifactsDir = path.join(sessionsRoot, sessionId, 'artifacts');
    await writeJson(path.join(artifactsDir, olderName), {
      schemaVersion: 1,
      kind: 'orchestration.dispatch-run',
      sessionId,
      persistedAt: olderTs,
      dispatchRun: {
        ok: false,
        mode: 'dry-run',
        executorRegistry: ['local-dry-run'],
        jobRuns: jobRuns(1),
        finalOutputs: [],
      },
    });
    await writeJson(path.join(artifactsDir, newerName), {
      schemaVersion: 1,
      kind: 'orchestration.dispatch-run',
      sessionId,
      persistedAt: newerTs,
      dispatchRun: {
        ok: false,
        mode: 'dry-run',
        executorRegistry: ['local-dry-run'],
        jobRuns: jobRuns(2),
        finalOutputs: [],
      },
    });
  };

  await writePair(
    firstSessionId,
    'dispatch-run-20260405T045900Z.json',
    '2026-04-05T04:59:00.000Z',
    'dispatch-run-20260405T050000Z.json',
    '2026-04-05T05:00:00.000Z'
  );
  await writePair(
    secondSessionId,
    'dispatch-run-20260405T035900Z.json',
    '2026-04-05T03:59:00.000Z',
    'dispatch-run-20260405T040000Z.json',
    '2026-04-05T04:00:00.000Z'
  );

  const logs = [];
  await runTeamHistory(
    { provider: 'codex', limit: 10, json: true },
    { rootDir, io: { log: (line) => logs.push(line) } }
  );

  const report = JSON.parse(logs.at(-1));
  assert.equal(report.records.length, 2);
  assert.deepEqual(report.records.map((record) => record.sessionId), [firstSessionId, secondSessionId]);
});
