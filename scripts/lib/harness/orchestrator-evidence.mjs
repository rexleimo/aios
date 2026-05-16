import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath } from '../aios/state-root.mjs';

import { runContextDbCli } from '../contextdb-cli.mjs';
import { withWorkItemArtifactRef } from './work-item-telemetry.mjs';

export const ORCHESTRATION_DISPATCH_EVENT_KIND = 'orchestration.dispatch-run';

export function compactRlDecisionEvidence(raw = {}) {
  return {
    context_state: raw.context_state || {},
    decision_type: String(raw.decision_type || '').trim(),
    decision_payload: raw.decision_payload || {},
    executor_selected: String(raw.executor_selected || 'unknown'),
    preflight_selected: raw.preflight_selected === true,
    verification_result: String(raw.verification_result || 'failed'),
    handoff_triggered: raw.handoff_triggered === true,
    terminal_outcome: String(raw.terminal_outcome || 'failed'),
  };
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const results = [];
  for (const value of values) {
    const text = normalizeText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    results.push(text);
  }
  return results;
}

function normalizeStringArray(raw = []) {
  if (!Array.isArray(raw)) return [];
  return uniqueStrings(raw);
}

function formatArtifactTimestamp(ts = new Date()) {
  return ts.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
}

function buildArtifactPath(rootDir, sessionId, stamp) {
  return contextDbRelativePath(rootDir, 'sessions', sessionId, 'artifacts', `dispatch-run-${stamp}.json`);
}

function normalizeDispatchMode(dispatchRun = {}) {
  const mode = String(dispatchRun?.mode || '').trim();
  return mode || 'dry-run';
}

function formatRefsCsv(refs = []) {
  return normalizeStringArray(refs).join(',');
}

function normalizeDispatchCost(raw = {}) {
  const inputTokens = Number.isFinite(raw?.inputTokens) ? Math.max(0, Math.floor(raw.inputTokens)) : 0;
  const outputTokens = Number.isFinite(raw?.outputTokens) ? Math.max(0, Math.floor(raw.outputTokens)) : 0;
  let totalTokens = Number.isFinite(raw?.totalTokens) ? Math.max(0, Math.floor(raw.totalTokens)) : 0;
  const usd = Number.isFinite(raw?.usd) ? Math.max(0, Number(raw.usd)) : 0;
  if (totalTokens === 0 && (inputTokens > 0 || outputTokens > 0)) {
    totalTokens = inputTokens + outputTokens;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    usd: Number(usd.toFixed(4)),
  };
}

function hasDispatchCost(raw = {}) {
  const cost = normalizeDispatchCost(raw);
  return cost.inputTokens > 0 || cost.outputTokens > 0 || cost.totalTokens > 0 || cost.usd > 0;
}

function formatDispatchCostForEvent(raw = {}) {
  const cost = normalizeDispatchCost(raw);
  const parts = [];
  if (cost.totalTokens > 0) parts.push(`tokens=${cost.totalTokens}`);
  if (cost.usd > 0) parts.push(`usd=${cost.usd}`);
  return parts.join(' ');
}

function buildDispatchHeadline(report) {
  const dispatchRun = report.dispatchRun || { ok: false, jobRuns: [], executorRegistry: [] };
  const mode = normalizeDispatchMode(dispatchRun);
  const blockedCount = dispatchRun.jobRuns.filter((jobRun) => jobRun.status === 'blocked').length;
  const executorSummary = dispatchRun.executorRegistry.length > 0
    ? dispatchRun.executorRegistry.join(',')
    : 'none';

  return dispatchRun.ok
    ? `orchestrate ${mode} ready: blueprint=${report.blueprint} jobs=${dispatchRun.jobRuns.length} executors=${executorSummary}`
    : `orchestrate ${mode} blocked: blueprint=${report.blueprint} jobs=${dispatchRun.jobRuns.length} blocked=${blockedCount} executors=${executorSummary}`;
}

function buildEventText(report, artifactPath) {
  const dispatchRun = report.dispatchRun || { ok: false, jobRuns: [] };
  const finalOutputs = Array.isArray(dispatchRun.finalOutputs) ? dispatchRun.finalOutputs.length : 0;
  const parts = [
    buildDispatchHeadline(report),
    `task=${report.taskTitle}`,
    `artifact=${artifactPath}`,
    `finalOutputs=${finalOutputs}`,
  ];
  if (hasDispatchCost(dispatchRun.cost)) {
    parts.push(`cost=${formatDispatchCostForEvent(dispatchRun.cost)}`);
  }
  return parts.join(' | ');
}

function buildCheckpointSummary(report) {
  const dispatchRun = report.dispatchRun || { ok: false, jobRuns: [] };
  const mode = normalizeDispatchMode(dispatchRun);
  const blockedCount = dispatchRun.jobRuns.filter((jobRun) => jobRun.status === 'blocked').length;
  const statusLabel = dispatchRun.ok ? 'ready' : 'blocked';
  return `Recorded orchestrate ${mode} ${statusLabel} for ${report.taskTitle}; jobs=${dispatchRun.jobRuns.length}; blocked=${blockedCount}.`;
}

function buildNextActions(report, artifactPath) {
  const dispatchRun = report.dispatchRun || { ok: false };
  const mode = normalizeDispatchMode(dispatchRun);
  if (dispatchRun.ok) {
    if (mode === 'live') {
      return [
        `Review live-dispatch artifact ${artifactPath}`,
        'Run learn-eval to inspect cost/token telemetry trends',
      ];
    }
    return [
      `Review dry-run artifact ${artifactPath}`,
      'Attach a real executor runtime when available',
    ];
  }

  return [
    `Inspect blocked handoffs in ${artifactPath}`,
    'Resolve merge-gate conflicts before rerunning orchestration',
  ];
}

function parseAttemptCount(jobRun) {
  const raw = Number.isFinite(jobRun?.attempts) ? Math.floor(jobRun.attempts) : 0;
  return raw > 0 ? raw : 1;
}

function buildTurnId({ stamp, jobId, attempt }) {
  const safeStamp = normalizeText(stamp);
  const safeJobId = normalizeText(jobId);
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  if (!safeStamp || !safeJobId) {
    return '';
  }
  return `${safeStamp}:${safeJobId}:a${safeAttempt}`;
}

function buildJobWorkItemRefMap(dispatchPlan = null) {
  const jobs = Array.isArray(dispatchPlan?.jobs) ? dispatchPlan.jobs : [];
  const map = new Map();
  for (const job of jobs) {
    const jobId = normalizeText(job?.jobId);
    if (!jobId) continue;
    const refs = normalizeStringArray(job?.launchSpec?.workItemRefs);
    if (refs.length > 0) {
      map.set(jobId, refs);
    }
  }
  return map;
}

function buildTurnRefs({ stamp, jobId, turnId, workItemRefs }) {
  const refs = [
    'env:orchestrate',
    stamp ? `dispatch:${stamp}` : '',
    turnId ? `turn:${turnId}` : '',
    jobId ? `job:${jobId}` : '',
    ...(Array.isArray(workItemRefs) ? workItemRefs.map((ref) => `work-item:${normalizeText(ref)}`) : []),
  ];
  return normalizeStringArray(refs);
}

function enrichDispatchRunForArtifact(dispatchRun, dispatchPlan, stamp) {
  if (!dispatchRun || typeof dispatchRun !== 'object') {
    return dispatchRun || null;
  }

  const workItemRefsByJobId = buildJobWorkItemRefMap(dispatchPlan);
  const rawJobRuns = Array.isArray(dispatchRun.jobRuns) ? dispatchRun.jobRuns : [];
  const jobRuns = rawJobRuns.map((jobRun) => {
    if (!jobRun || typeof jobRun !== 'object') return jobRun;
    const jobId = normalizeText(jobRun.jobId);
    if (!jobId) return { ...jobRun };

    const existingWorkItemRefs = normalizeStringArray(jobRun.workItemRefs);
    const resolvedWorkItemRefs = existingWorkItemRefs.length > 0
      ? existingWorkItemRefs
      : (workItemRefsByJobId.get(jobId) || []);

    const existingTurnId = normalizeText(jobRun.turnId);
    const attempt = parseAttemptCount(jobRun);
    const resolvedTurnId = existingTurnId || buildTurnId({ stamp, jobId, attempt });

    const existingRefs = normalizeStringArray(jobRun.refs);
    const resolvedRefs = uniqueStrings([
      ...existingRefs,
      ...buildTurnRefs({
        stamp,
        jobId,
        turnId: resolvedTurnId,
        workItemRefs: resolvedWorkItemRefs,
      }),
    ]);

    return {
      ...jobRun,
      turnId: resolvedTurnId,
      workItemRefs: resolvedWorkItemRefs,
      refs: resolvedRefs,
    };
  });

  return {
    ...dispatchRun,
    jobRuns,
  };
}

async function writeArtifact(absPath, payload) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function persistDispatchEvidence({ rootDir, sessionId, report, elapsedMs, now = null } = {}) {
  if (!report?.dispatchRun) {
    return { persisted: false, reason: 'dispatch-run-missing' };
  }

  const mode = normalizeDispatchMode(report.dispatchRun);
  if (mode !== 'dry-run' && mode !== 'live') {
    return { persisted: false, reason: 'mode-unsupported', mode };
  }
  if (mode === 'live' && (!Array.isArray(report.dispatchRun.jobRuns) || report.dispatchRun.jobRuns.length === 0)) {
    return { persisted: false, reason: 'mode-unsupported', mode };
  }

  if (!sessionId) {
    return { persisted: false, reason: 'session-required', mode: 'contextdb' };
  }

  const persistedAt = now instanceof Date ? now : new Date();
  const stamp = formatArtifactTimestamp(persistedAt);
  const artifactPath = buildArtifactPath(rootDir, sessionId, stamp);
  const artifactAbsPath = path.join(rootDir, artifactPath);
  const dispatchRunForArtifact = enrichDispatchRunForArtifact(report.dispatchRun, report.dispatchPlan, stamp);
  const artifactPayload = {
    schemaVersion: 1,
    kind: ORCHESTRATION_DISPATCH_EVENT_KIND,
    sessionId,
    persistedAt: persistedAt.toISOString(),
    blueprint: report.blueprint,
    taskTitle: report.taskTitle,
    contextSummary: report.contextSummary,
    workItems: Array.isArray(report.workItems) ? report.workItems.map((item) => ({ ...item })) : [],
    learnEvalOverlay: report.learnEvalOverlay || null,
    executorCapabilityManifest: report.executorCapabilityManifest || null,
    dispatchPlan: report.dispatchPlan || null,
    dispatchRun: dispatchRunForArtifact,
    workItemTelemetry: withWorkItemArtifactRef(report.workItemTelemetry || null, artifactPath),
    dispatchInsights: report.dispatchInsights || null,
  };

  await writeArtifact(artifactAbsPath, artifactPayload);

  try {
    const dispatchCost = normalizeDispatchCost(report.dispatchRun.cost);
    const dispatchSummaryTurnId = `dispatch:${stamp}:summary`;
    const dispatchWorkItemRefs = Array.isArray(report.workItems)
      ? report.workItems
        .map((item) => normalizeText(item?.itemId || item?.id || ''))
        .filter(Boolean)
      : [];
    const eventRefs = [
      artifactPath,
      'env:orchestrate',
      `dispatch:${stamp}`,
    ];
    const eventArgs = [
      'event:add',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--role',
      'assistant',
      '--kind',
      ORCHESTRATION_DISPATCH_EVENT_KIND,
      '--text',
      buildEventText(report, artifactPath),
      '--turn-id',
      dispatchSummaryTurnId,
      '--turn-type',
      'verification',
      '--environment',
      'orchestrate',
      '--hindsight-status',
      'evaluated',
      '--outcome',
      report.dispatchRun.ok ? 'success' : 'retry-needed',
      '--refs',
      formatRefsCsv(eventRefs),
    ];
    if (dispatchWorkItemRefs.length > 0) {
      eventArgs.push('--work-item-refs', dispatchWorkItemRefs.join(','));
    }
    const event = runContextDbCli(eventArgs);
    const eventId = `${sessionId}#${event.seq}`;

    const checkpointStatus = report.dispatchRun.ok ? 'running' : 'blocked';
    const checkpointArgs = [
      'checkpoint',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--summary',
      buildCheckpointSummary(report),
      '--status',
      checkpointStatus,
      '--artifacts',
      artifactPath,
      '--next',
      buildNextActions(report, artifactPath).join('|'),
      '--verify-result',
      report.dispatchRun.ok ? 'partial' : 'failed',
      '--verify-evidence',
      `event=${eventId}; artifact=${artifactPath}`,
      '--retry-count',
      '0',
      '--elapsed-ms',
      String(Math.max(0, Math.floor(elapsedMs || 0))),
      '--cost-input-tokens',
      String(dispatchCost.inputTokens),
      '--cost-output-tokens',
      String(dispatchCost.outputTokens),
      '--cost-total-tokens',
      String(dispatchCost.totalTokens),
      '--cost-usd',
      String(dispatchCost.usd),
    ];

    if (!report.dispatchRun.ok) {
      checkpointArgs.push('--failure-category', mode === 'live' ? 'dispatch-runtime-blocked' : 'merge-gate-blocked');
    }

    const checkpoint = runContextDbCli(checkpointArgs);
    const checkpointId = `${sessionId}#C${checkpoint.seq}`;
    const evidence = {
      persisted: true,
      mode: 'contextdb',
      artifactPath,
      eventKind: ORCHESTRATION_DISPATCH_EVENT_KIND,
      eventId,
      checkpointId,
      checkpointStatus,
    };

    await writeArtifact(artifactAbsPath, {
      ...artifactPayload,
      dispatchEvidence: evidence,
    });

    return evidence;
  } catch (error) {
    return {
      persisted: false,
      mode: 'contextdb',
      artifactPath,
      eventKind: ORCHESTRATION_DISPATCH_EVENT_KIND,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
