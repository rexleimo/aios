#!/usr/bin/env node
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { resolveContextDbRoot } from './lib/aios/state-root.mjs';
import { runTeamStatus } from './lib/lifecycle/team-ops.mjs';

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv = []) {
  const options = {
    frames: parsePositiveInt(process.env.AIOS_PERF_TEAM_STATUS_WATCH_FRAMES, 24),
    maxP95Ms: parsePositiveInt(process.env.AIOS_PERF_TEAM_STATUS_WATCH_P95_MS, 500),
    maxAvgMs: parsePositiveInt(process.env.AIOS_PERF_TEAM_STATUS_WATCH_AVG_MS, 250),
    jsonOut: String(process.env.AIOS_PERF_TEAM_STATUS_WATCH_JSON_OUT || '').trim(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (token === '--frames') {
      options.frames = parsePositiveInt(argv[i + 1], options.frames);
      i += 1;
      continue;
    }
    if (token === '--max-p95-ms') {
      options.maxP95Ms = parsePositiveInt(argv[i + 1], options.maxP95Ms);
      i += 1;
      continue;
    }
    if (token === '--max-avg-ms') {
      options.maxAvgMs = parsePositiveInt(argv[i + 1], options.maxAvgMs);
      i += 1;
      continue;
    }
    if (token === '--json-out') {
      options.jsonOut = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
  }

  return options;
}

function percentile(values = [], p = 0.95) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonLines(filePath, rows = []) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const content = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await writeFile(filePath, content, 'utf8');
}

function writeJsonSync(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function seedWorkspace(rootDir, { sessionId = 'perf-watch-session' } = {}) {
  const sessionDir = path.join(resolveContextDbRoot(rootDir), 'sessions', sessionId);
  await writeJson(path.join(sessionDir, 'meta.json'), {
    schemaVersion: 1,
    sessionId,
    agent: 'codex-cli',
    project: 'aios',
    goal: 'team status watch performance smoke',
    tags: [],
    status: 'running',
    createdAt: '2026-04-12T10:00:00.000Z',
    updatedAt: '2026-04-12T10:00:00.000Z',
  });
  await writeJson(path.join(sessionDir, 'state.json'), {
    sessionId,
    status: 'running',
    updatedAt: '2026-04-12T10:00:00.000Z',
  });
  await writeJsonLines(path.join(sessionDir, 'l1-checkpoints.jsonl'), [
    {
      seq: 1,
      ts: '2026-04-12T10:00:00.000Z',
      status: 'running',
      summary: 'perf watch seed checkpoint',
      nextActions: ['observe watch cadence'],
      artifacts: [],
    },
  ]);

  const jobRuns = [];
  for (let i = 0; i < 120; i += 1) {
    const jobId = `phase.implement.wi.${i + 1}`;
    const mod = i % 5;
    const status = mod === 0 ? 'blocked' : mod === 1 ? 'running' : mod === 2 ? 'queued' : 'completed';
    jobRuns.push({
      jobId,
      jobType: 'phase',
      role: 'implementer',
      status,
      executor: 'local-phase',
      output: status === 'blocked'
        ? { outputType: 'handoff', error: 'awaiting-human-input' }
        : { outputType: 'handoff' },
    });
  }

  await writeJson(path.join(sessionDir, 'artifacts', 'dispatch-run-20260412T100000Z.json'), {
    schemaVersion: 1,
    kind: 'orchestration.dispatch-run',
    sessionId,
    persistedAt: '2026-04-12T10:00:00.000Z',
    dispatchRun: {
      mode: 'dry-run',
      ok: false,
      executorRegistry: ['local-phase'],
      jobRuns,
      finalOutputs: [],
    },
  });

  return { sessionId };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-perf-team-watch-'));
  const { sessionId } = await seedWorkspace(workspaceRoot);

  let nowMs = Date.parse('2026-04-12T10:00:00.000Z');
  const frameDurations = [];
  const frameSizes = [];
  const logs = [];

  const result = await runTeamStatus(
    {
      provider: 'codex',
      sessionId,
      watch: true,
      preset: 'minimal',
      fast: true,
      intervalMs: 250,
    },
    {
      rootDir: workspaceRoot,
      io: {
        log(line) {
          logs.push(String(line));
        },
      },
      env: {
        ...process.env,
        CI: '1',
        AIOS_WATCH_STALLED_MS: '1500',
      },
      nowFn: () => nowMs,
      watchLoop: async (render, { intervalMs = 250 } = {}) => {
        const stepMs = Number.isFinite(intervalMs) ? Math.max(1, Math.floor(intervalMs)) : 250;
        for (let i = 0; i < options.frames; i += 1) {
          const startedAt = performance.now();
          const output = await render();
          const elapsedMs = performance.now() - startedAt;
          frameDurations.push(round2(elapsedMs));
          frameSizes.push(String(output || '').length);
          nowMs += stepMs;
        }
      },
    }
  );

  const totalMs = frameDurations.reduce((sum, value) => sum + value, 0);
  const avgMs = frameDurations.length > 0 ? totalMs / frameDurations.length : 0;
  const p95Ms = percentile(frameDurations, 0.95);
  const failures = [];

  if (result.exitCode !== 0) {
    failures.push(`team status watch returned non-zero exit: ${result.exitCode}`);
  }
  if (avgMs > options.maxAvgMs) {
    failures.push(`average frame time exceeded: ${round2(avgMs)}ms > ${options.maxAvgMs}ms`);
  }
  if (p95Ms > options.maxP95Ms) {
    failures.push(`p95 frame time exceeded: ${round2(p95Ms)}ms > ${options.maxP95Ms}ms`);
  }

  const report = {
    ok: failures.length === 0,
    benchmark: 'team-status-watch-smoke',
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    sessionId,
    thresholds: {
      frames: options.frames,
      maxAvgMs: options.maxAvgMs,
      maxP95Ms: options.maxP95Ms,
    },
    measured: {
      avgMs: round2(avgMs),
      p95Ms: round2(p95Ms),
      maxMs: round2(Math.max(0, ...frameDurations)),
      minMs: round2(frameDurations.length > 0 ? Math.min(...frameDurations) : 0),
      meanOutputChars: round2(frameSizes.length > 0
        ? frameSizes.reduce((sum, size) => sum + size, 0) / frameSizes.length
        : 0),
      frames: frameDurations.length,
    },
    samples: {
      frameDurations,
      frameSizes,
      logs: logs.slice(0, 4),
    },
    failures,
  };

  if (options.jsonOut) {
    const outPath = path.isAbsolute(options.jsonOut)
      ? options.jsonOut
      : path.join(process.cwd(), options.jsonOut);
    writeJsonSync(outPath, report);
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
