import { performance } from 'node:perf_hooks';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  assembleExecutionContext,
  buildExecutionContextPacket,
  evaluateExecutionContextPreflight,
} from '../lib/contextdb/execution-context.mjs';
import { buildStructuredPlanState } from '../lib/planning/schema.mjs';

const TASK_COUNT = 20;
const CASES_PER_TASK = 10;

function parseArgs(argv) {
  const options = { jsonOut: '', markdownOut: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--json-out') options.jsonOut = String(argv[++index] || '');
    else if (argv[index] === '--markdown-out') options.markdownOut = String(argv[++index] || '');
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (!options.jsonOut || !options.markdownOut) {
    throw new Error('scale validation requires --json-out and --markdown-out');
  }
  return options;
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function round(value) {
  return Number(value.toFixed(3));
}

async function writeOutput(filePath, content) {
  const absolute = path.resolve(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

async function directoryBytes(rootDir) {
  let total = 0;
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile()) total += (await stat(entryPath)).size;
    }
  }
  await visit(rootDir);
  return total;
}

function taskFixture(index) {
  const ordinal = String(index + 1).padStart(2, '0');
  const cjk = (index + 1) % 5 === 0;
  const base = cjk ? `源码/任务-${ordinal}` : `src/task-${ordinal}`;
  return {
    id: `task-${ordinal}`,
    title: cjk ? `任务 ${ordinal}：更新认证规则` : `Task ${ordinal}: update policy-aware behavior`,
    targetRef: `${base}/target.mjs`,
    requiredRef: cjk ? `规则/任务-${ordinal}.md` : `policies/task-${ordinal}.md`,
    undeclaredRef: cjk ? `越界/任务-${ordinal}.txt` : `outside/task-${ordinal}.txt`,
    customState: cjk ? `state-${ordinal}` : '',
  };
}

async function timedPreflight(input) {
  const started = performance.now();
  const verdict = await evaluateExecutionContextPreflight(input);
  return { verdict, latencyMs: performance.now() - started };
}

function classify(record, counters) {
  const expectedPositive = record.expectedReasons.length > 0;
  const observedPositive = record.verdict.wouldBlock === true;
  if (expectedPositive && observedPositive) counters.tp += 1;
  else if (!expectedPositive && !observedPositive) counters.tn += 1;
  else if (!expectedPositive && observedPositive) counters.fp += 1;
  else counters.fn += 1;
  if (!record.expectedReasons.every((reason) => record.verdict.wouldBlockReasons.includes(reason))) {
    counters.reasonMismatches += 1;
  }
}

async function runTask(rootDir, fixture, index) {
  const targetPath = path.join(rootDir, fixture.targetRef);
  const requiredPath = path.join(rootDir, fixture.requiredRef);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await mkdir(path.dirname(requiredPath), { recursive: true });
  await writeFile(targetPath, 'export const value = 1;\n', 'utf8');
  const policyV1 = `# Policy ${fixture.id}\nrevision: 1\n`;
  await writeFile(requiredPath, policyV1, 'utf8');

  const plan = buildStructuredPlanState({
    title: fixture.title,
    sessionId: `scale-${fixture.id}`,
    tasks: [{
      id: fixture.id,
      title: fixture.title,
      targets: [fixture.targetRef],
      allowedWrites: [`${path.dirname(fixture.targetRef).replace(/\\/gu, '/')}/**`],
      contextRequirements: [{ ref: fixture.requiredRef, reason: 'Required policy dependency' }],
      verification: ['controlled-scale-verification'],
    }],
  });
  const env = fixture.customState
    ? { ...process.env, AIOS_PROJECT_STATE_DIR: fixture.customState }
    : process.env;
  const fixtureNow = new Date(`2026-07-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`);
  const observed = await assembleExecutionContext({
    rootDir,
    plan,
    taskId: fixture.id,
    env,
    persist: true,
    now: fixtureNow,
  });
  const unread = await buildExecutionContextPacket({
    rootDir,
    plan,
    taskId: fixture.id,
    readRefs: [],
    env,
    persist: false,
    now: new Date(`2026-07-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`),
  });
  const deliveryBudgetAccurate = observed.assembly.deliveryUnits === observed.assembly.contextText.length
    && observed.assembly.budget.usedUnits === observed.assembly.contextText.length;

  const records = [];
  for (let caseIndex = 0; caseIndex < 4; caseIndex += 1) {
    const measured = await timedPreflight({
      rootDir,
      packet: observed.packet,
      receipt: observed.receipt,
      mutationRefs: [fixture.targetRef],
    });
    records.push({ taskId: fixture.id, caseType: 'ready', expectedReasons: [], ...measured });
  }
  for (let caseIndex = 0; caseIndex < 2; caseIndex += 1) {
    const measured = await timedPreflight({
      rootDir,
      packet: unread.packet,
      receipt: unread.receipt,
      mutationRefs: [fixture.targetRef],
    });
    records.push({ taskId: fixture.id, caseType: 'unread', expectedReasons: ['required_context_unread'], ...measured });
  }

  await writeFile(requiredPath, `# Policy ${fixture.id}\nrevision: 2-external\n`, 'utf8');
  for (let caseIndex = 0; caseIndex < 2; caseIndex += 1) {
    const measured = await timedPreflight({
      rootDir,
      packet: observed.packet,
      receipt: observed.receipt,
      mutationRefs: [fixture.targetRef],
    });
    records.push({ taskId: fixture.id, caseType: 'stale', expectedReasons: ['required_context_stale'], ...measured });
  }
  await writeFile(requiredPath, policyV1, 'utf8');

  for (let caseIndex = 0; caseIndex < 2; caseIndex += 1) {
    const measured = await timedPreflight({
      rootDir,
      packet: observed.packet,
      receipt: observed.receipt,
      mutationRefs: [fixture.undeclaredRef],
    });
    records.push({ taskId: fixture.id, caseType: 'undeclared', expectedReasons: ['undeclared_target'], ...measured });
  }
  const absolutePathCheck = await evaluateExecutionContextPreflight({
    rootDir,
    packet: observed.packet,
    receipt: observed.receipt,
    mutationRefs: [targetPath],
  });
  return {
    records,
    paths: observed.paths,
    deliveryBudgetAccurate,
    absolutePathEquivalent: !absolutePathCheck.wouldBlock,
    absolutePathReasons: absolutePathCheck.wouldBlockReasons,
  };
}

function renderMarkdown(summary) {
  return `# Context Lifecycle V1 20/200 Controlled Engineering Smoke\n\n`
    + `> 本报告是自构 fixture 的 engineering smoke，不是生产 precision/recall 或发布证据。\n\n`
    + `- Tasks: **${summary.tasks}**\n`
    + `- Receipts: **${summary.receipts}**\n`
    + `- Engineering smoke: **${summary.smoke.passed ? 'PASS' : 'FAIL'}**\n`
    + `- 构造内 branch agreement: **${summary.metrics.positiveAgreement} / ${summary.metrics.negativeAgreement} / ${summary.metrics.unexpectedBlock} / ${summary.metrics.missedBlock}**\n`
    + `- Independent oracle: **NO**\n`
    + `- Real-project samples: **0**\n`
    + `- Absolute-path equivalence: **${summary.adversarialChecks.absolutePathEquivalent ? 'PASS' : 'FAIL'}**\n`
    + `- Delivered-budget accounting: **${summary.adversarialChecks.deliveryBudgetAccurate ? 'PASS' : 'FAIL'}**\n`
    + `- Digest determinism: **${summary.metrics.digestDeterminismRate}**\n`
    + `- Latency p50 / p95 / max: **${summary.metrics.latencyMs.p50} / ${summary.metrics.latencyMs.p95} / ${summary.metrics.latencyMs.max} ms**\n`
    + `- Sidecar bytes: **${summary.metrics.sidecarBytes}**\n\n`
    + `## Enforcement 决策\n\n`
    + `- Opt-in enforcement pilot: **NO-GO**\n`
    + `- Default hard enforcement: **NO-GO**\n`
    + `- 理由：${summary.recommendation.reason}\n\n`
    + `## Evidence boundary\n\n`
    + `- Runner only calls library APIs; production CLI/MCP/lifecycle wiring is verified separately and is not measured here.\n`
    + `- Expected reason 与 fixture 由同一脚本定义，不构成独立 oracle。\n`
    + `- 200 records 只衡量构造内 branch agreement、determinism 和局部 latency。\n`
    + `- Release gate 固定为 NO-GO，直到独立 oracle、真实样本和对抗任务覆盖全部通过。\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'context-lifecycle-scale-'));
  try {
    const tasks = Array.from({ length: TASK_COUNT }, (_, index) => taskFixture(index));
    const allRecords = [];
    const absolutePathChecks = [];
    const deliveryBudgetChecks = [];
    for (let index = 0; index < tasks.length; index += 1) {
      const result = await runTask(rootDir, tasks[index], index);
      allRecords.push(...result.records);
      deliveryBudgetChecks.push({ taskId: tasks[index].id, accurate: result.deliveryBudgetAccurate });
      absolutePathChecks.push({
        taskId: tasks[index].id,
        equivalent: result.absolutePathEquivalent,
        observedReasons: result.absolutePathReasons,
      });
    }

    const counters = { tp: 0, tn: 0, fp: 0, fn: 0, reasonMismatches: 0 };
    for (const record of allRecords) classify(record, counters);
    const digestGroups = new Map();
    for (const record of allRecords) {
      const key = `${record.taskId}:${record.caseType}`;
      if (!digestGroups.has(key)) digestGroups.set(key, new Set());
      digestGroups.get(key).add(record.verdict.decisionDigest);
    }
    const deterministicGroups = [...digestGroups.values()].filter((digests) => digests.size === 1).length;
    const latencies = allRecords.map((record) => record.latencyMs);
    const digestDeterminismRate = deterministicGroups / Math.max(1, digestGroups.size);
    const sidecarBytes = await directoryBytes(rootDir);
    const metrics = {
      positiveAgreement: counters.tp,
      negativeAgreement: counters.tn,
      unexpectedBlock: counters.fp,
      missedBlock: counters.fn,
      reasonMismatches: counters.reasonMismatches,
      digestDeterminismRate: round(digestDeterminismRate),
      latencyMs: {
        p50: round(percentile(latencies, 0.5)),
        p95: round(percentile(latencies, 0.95)),
        max: round(Math.max(...latencies)),
        mean: round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
      },
      sidecarBytes,
    };
    const absolutePathEquivalent = absolutePathChecks.every((check) => check.equivalent);
    const smokeChecks = {
      tasks: tasks.length >= 20,
      receipts: allRecords.length >= 200,
      noUnexpectedConstructedBlock: counters.fp === 0,
      noMissedConstructedBlock: counters.fn === 0,
      noReasonMismatches: counters.reasonMismatches === 0,
      deterministicDigests: digestDeterminismRate === 1,
      p95Under50Ms: metrics.latencyMs.p95 < 50,
      absolutePathEquivalent,
      deliveryBudgetAccounting: deliveryBudgetChecks.every((check) => check.accurate),
    };
    const smokePassed = Object.values(smokeChecks).every(Boolean);
    const summary = {
      schemaVersion: 2,
      kind: 'context-lifecycle-v1-controlled-engineering-smoke',
      controlledSynthetic: true,
      generatedAt: new Date().toISOString(),
      tasks: tasks.length,
      receipts: allRecords.length,
      caseDistribution: { ready: 80, unread: 40, stale: 40, undeclared: 40 },
      metrics,
      smoke: { passed: smokePassed, checks: smokeChecks },
      adversarialChecks: {
        absolutePathEquivalent,
        details: absolutePathChecks,
        deliveryBudgetAccurate: deliveryBudgetChecks.every((check) => check.accurate),
        deliveryBudgetDetails: deliveryBudgetChecks,
      },
      evidenceBoundary: {
        productionWiringObserved: false,
        independentOracle: false,
        realProjectSamples: 0,
        productionPrecisionRecallEstablished: false,
        releaseGatePassed: false,
      },
      recommendation: {
        optInEnforcementPilot: 'NO-GO',
        defaultHardEnforcement: 'NO-GO',
        reason: 'Self-constructed fixtures do not establish production precision/recall; independent oracle, real-project samples, and adversarial task coverage are incomplete.',
      },
      records: allRecords.map((record) => ({
        taskId: record.taskId,
        caseType: record.caseType,
        expectedReasons: record.expectedReasons,
        observedReasons: record.verdict.wouldBlockReasons,
        decisionDigest: record.verdict.decisionDigest,
        latencyMs: round(record.latencyMs),
      })),
    };
    await writeOutput(options.jsonOut, `${JSON.stringify(summary, null, 2)}\n`);
    await writeOutput(options.markdownOut, renderMarkdown(summary));
    process.stdout.write(`${JSON.stringify({
      smokePassed,
      releaseGatePassed: false,
      absolutePathEquivalent,
      tasks: summary.tasks,
      receipts: summary.receipts,
      unexpectedConstructedBlock: metrics.unexpectedBlock,
      missedConstructedBlock: metrics.missedBlock,
      p95Ms: metrics.latencyMs.p95,
      jsonOut: options.jsonOut,
      markdownOut: options.markdownOut,
    })}\n`);
    process.exitCode = smokePassed ? 0 : 1;
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

await main();
