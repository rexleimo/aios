import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath, resolveContextDbRoot } from '../aios/state-root.mjs';

import {
  buildExecutorCapabilityManifest,
  buildDispatchPolicy,
  buildEffectiveDispatchPolicy,
  buildLocalDispatchPlan,
  buildOrchestrationPlan,
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
  renderOrchestrationReport,
} from '../harness/orchestrator.mjs';
import {
  createDispatchRuntimeRegistry,
  normalizeDispatchRuntimeResult,
  resolveDispatchRuntime,
} from '../harness/orchestrator-runtimes.mjs';
import { persistDispatchEvidence } from '../harness/orchestrator-evidence.mjs';
import { buildDispatchInsights } from '../harness/dispatch-insights.mjs';
import { buildLearnEvalReport } from '../harness/learn-eval.mjs';
import { buildWorkItemTelemetry } from '../harness/work-item-telemetry.mjs';
import { parseArgs } from '../cli/parse-args.mjs';
import { runDoctor } from './doctor.mjs';
import { executeEntropyGc } from './entropy-gc.mjs';
import { runQualityGate } from './quality-gate.mjs';
import { runReleaseStatus } from './release-status.mjs';
import { evaluateOwnershipEvidence, evaluatePlanEvidence, mergeReadinessVerdicts } from './preflight-contracts.mjs';
import { evaluateClarityGate, persistClarityGateDecision } from '../harness/clarity-gate.mjs';
import {
  normalizeOrchestrateDispatchMode,
  normalizeOrchestrateExecutionMode,
  normalizeOrchestratePreflightMode,
} from './options.mjs';

const DEFAULT_PREFLIGHT_ADAPTERS = {
  qualityGate: runQualityGate,
  releaseStatus: runReleaseStatus,
  doctor: runDoctor,
  orchestrate: runOrchestrate,
};
const PREFLIGHT_RELEASE_GUARD_SOURCE_ID = 'gate.release-health';
const PREFLIGHT_RELEASE_GUARD_COMMAND = 'node scripts/aios.mjs release-status --strict --format json';

function normalizePositiveInteger(rawValue, fallback) {
  const value = Number.parseInt(String(rawValue ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseBooleanEnv(rawValue, fallback = false) {
  const value = String(rawValue ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

const LIVE_CAPABILITY_GUARD_KEYS = ['network', 'browser', 'sideEffect'];

function normalizeCapabilityLevel(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'no' || normalized === 'unknown') return normalized;
  return 'unknown';
}

function collectUnknownLiveCapabilities(manifest = null) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      blocked: false,
      summaryKeys: [],
      executors: [],
    };
  }

  const summary = manifest.summary && typeof manifest.summary === 'object'
    ? manifest.summary
    : {};
  const summaryKeys = LIVE_CAPABILITY_GUARD_KEYS
    .filter((key) => normalizeCapabilityLevel(summary[key]) === 'unknown');
  const executors = (Array.isArray(manifest.executors) ? manifest.executors : [])
    .map((entry) => {
      const id = String(entry?.id || '').trim();
      const jobCount = Number.isFinite(entry?.jobCount) ? Math.max(0, Math.floor(entry.jobCount)) : 0;
      const capabilities = entry?.capabilities && typeof entry.capabilities === 'object'
        ? entry.capabilities
        : {};
      const unknown = LIVE_CAPABILITY_GUARD_KEYS
        .filter((key) => normalizeCapabilityLevel(capabilities[key]) === 'unknown');
      if (!id || unknown.length === 0) return null;
      return { id, jobCount, unknown };
    })
    .filter(Boolean);

  return {
    blocked: summaryKeys.length > 0,
    summaryKeys,
    executors,
  };
}

function canOverrideUnknownLiveCapabilities(options = {}, env = process.env) {
  if (options?.force === true) return true;
  if (parseBooleanEnv(env?.AIOS_ALLOW_UNKNOWN_CAPABILITIES, false)) return true;
  if (parseBooleanEnv(env?.AIOS_ALLOW_UNKNOWN_LIVE_CAPABILITIES, false)) return true;
  return false;
}

function buildUnknownCapabilityGuardSuggestedCommands(options = {}) {
  const normalized = {
    blueprint: options.blueprint,
    taskTitle: options.taskTitle,
    contextSummary: options.contextSummary,
    sessionId: options.sessionId,
    resumeSessionId: options.resumeSessionId,
    retryBlocked: options.retryBlocked,
    limit: options.limit,
    recommendationId: options.recommendationId,
    dispatchMode: options.dispatchMode,
    preflightMode: options.preflightMode,
  };

  const dryRunPreview = planOrchestrate({
    ...normalized,
    executionMode: 'dry-run',
    force: false,
    format: 'json',
  }).preview;
  const forceLivePreview = planOrchestrate({
    ...normalized,
    executionMode: 'live',
    force: true,
    format: 'json',
  }).preview;

  return [...new Set([dryRunPreview, forceLivePreview])];
}

function normalizeCounter(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function inferProviderFromClientId(clientId = '') {
  const normalized = String(clientId || '').trim().toLowerCase();
  if (normalized === 'codex-cli') return 'codex';
  if (normalized === 'claude-code') return 'claude';
  if (normalized === 'gemini-cli') return 'gemini';
  return '';
}

function extractDispatchHindsightSummary(learnEvalReport) {
  const hindsight = learnEvalReport?.signals?.dispatch?.hindsight && typeof learnEvalReport.signals.dispatch.hindsight === 'object'
    ? learnEvalReport.signals.dispatch.hindsight
    : null;

  return {
    pairsAnalyzed: normalizeCounter(hindsight?.pairsAnalyzed),
    repeatedBlockedTurns: normalizeCounter(hindsight?.repeatedBlockedTurns),
    regressions: normalizeCounter(hindsight?.regressions),
  };
}

function isRetryBlockedDispatchUnstable(hindsightSummary) {
  if (!hindsightSummary || typeof hindsightSummary !== 'object') return false;
  if (hindsightSummary.pairsAnalyzed <= 0) return false;
  return hindsightSummary.repeatedBlockedTurns > 0 || hindsightSummary.regressions > 0;
}

function buildRetryBlockedRecoveryCommands(sessionId, env = process.env) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return [];

  const commands = [
    `node scripts/aios.mjs learn-eval --session ${normalizedSessionId}`,
    `node scripts/aios.mjs orchestrate --session ${normalizedSessionId} --dispatch local --execute dry-run --format json`,
    `node scripts/aios.mjs hud --session ${normalizedSessionId} --preset full`,
  ];

  const provider = inferProviderFromClientId(env?.AIOS_SUBAGENT_CLIENT || '');
  const workers = normalizePositiveInteger(env?.AIOS_SUBAGENT_CONCURRENCY, 2);
  if (provider) {
    commands.splice(
      2,
      0,
      `node scripts/aios.mjs team --resume ${normalizedSessionId} --retry-blocked --provider ${provider} --workers ${workers} --dry-run`
    );
  }

  return commands;
}

function writeWarning(io, message) {
  const text = String(message || '').trim();
  if (!text) return;
  if (io && typeof io.warn === 'function') {
    io.warn(text);
    return;
  }
  if (io && typeof io.error === 'function') {
    io.error(text);
    return;
  }
  process.stderr.write(`${text}\n`);
}

function isReleaseStateUnavailable(result = {}) {
  return result?.ok === false && /state file not found/i.test(String(result?.error || ''));
}

function buildReleaseGuardAction() {
  return {
    type: 'command',
    sourceId: PREFLIGHT_RELEASE_GUARD_SOURCE_ID,
    action: PREFLIGHT_RELEASE_GUARD_COMMAND,
  };
}

function didReleaseGuardFail(dispatchPreflight = null) {
  if (!dispatchPreflight || !Array.isArray(dispatchPreflight.results)) return false;
  return dispatchPreflight.results.some(
    (item) => item?.sourceId === PREFLIGHT_RELEASE_GUARD_SOURCE_ID && item?.status === 'failed'
  );
}

function applyReleaseGuardBlock(policy = null, dispatchPreflight = null) {
  if (!policy || typeof policy !== 'object') return policy;
  if (!didReleaseGuardFail(dispatchPreflight)) {
    return policy;
  }

  const blockerIds = [...new Set([...(Array.isArray(policy.blockerIds) ? policy.blockerIds : []), PREFLIGHT_RELEASE_GUARD_SOURCE_ID])];
  const requiredActions = Array.isArray(policy.requiredActions) ? [...policy.requiredActions] : [];
  if (!requiredActions.some((item) => item?.sourceId === PREFLIGHT_RELEASE_GUARD_SOURCE_ID)) {
    requiredActions.push(buildReleaseGuardAction());
  }
  const notes = Array.isArray(policy.notes) ? [...policy.notes] : [];
  notes.push('Preflight release health guard failed: resolve release-status strict gate before continuing.');

  return {
    ...policy,
    status: 'blocked',
    parallelism: 'serial-only',
    blockerIds,
    requiredActions,
    notes,
  };
}

function extractBlueprintFromTargetId(targetId) {
  const match = /^blueprint\.([a-z0-9-]+)$/i.exec(String(targetId || '').trim());
  return match ? normalizeOrchestratorBlueprint(match[1]) : null;
}

function selectOverlayRecommendation(recommendations, recommendationId = '') {
  if (recommendationId) {
    const selected = recommendations.find((item) => item.targetId === recommendationId);
    if (!selected) {
      throw new Error(`Unknown learn-eval recommendation: ${recommendationId}`);
    }
    return selected;
  }

  return recommendations.find((item) => item.kind === 'promote' && item.targetType === 'blueprint') || null;
}

function buildOverlayContext(overlay) {
  if (!overlay || overlay.appliedRecommendations.length === 0) {
    return '';
  }

  const topItems = overlay.appliedRecommendations
    .slice(0, 3)
    .map((item) => `[${item.kind}] ${item.targetId}`)
    .join(', ');

  return `learn-eval overlay: session=${overlay.sourceSessionId}; selected=${overlay.selectedRecommendationId || 'none'}; top=${topItems}`;
}

function buildLearnEvalOverlay(report, recommendationId = '') {
  const appliedRecommendations = Array.isArray(report.recommendations?.all)
    ? report.recommendations.all.map((item) => ({ ...item }))
    : [];
  const selectedRecommendation = selectOverlayRecommendation(appliedRecommendations, recommendationId);

  return {
    sourceSessionId: report.session.sessionId,
    sourceGoal: report.session.goal,
    selectedRecommendationId: selectedRecommendation?.targetId || null,
    appliedRecommendationIds: appliedRecommendations.map((item) => item.targetId),
    appliedRecommendations,
  };
}

function tokenizeCliFragment(value = '') {
  const tokens = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g;
  for (const match of String(value || '').matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens.filter(Boolean);
}

function parseAiosCommandAction(action = '') {
  const trimmed = String(action || '').trim();
  const prefix = 'node scripts/aios.mjs ';
  if (!trimmed.startsWith(prefix)) {
    return null;
  }

  try {
    return parseArgs(tokenizeCliFragment(trimmed.slice(prefix.length)));
  } catch {
    return null;
  }
}

function createBufferedIo() {
  const lines = [];
  return {
    lines,
    io: {
      log(line) {
        lines.push(String(line));
      },
    },
  };
}

function isSupportedPreflightOrchestrateAction(options = {}) {
  return options.dispatchMode === 'local' && options.executionMode === 'dry-run';
}

function buildPreflightOrchestrateOptions(options = {}, sessionId = '') {
  const nestedOptions = sessionId && !options.sessionId
    ? { ...options, sessionId }
    : { ...options };
  nestedOptions.preflightMode = 'none';
  return nestedOptions;
}

async function runPreflightAction(item, { rootDir, env, sessionId, preflightAdapters }) {
  if (item.type !== 'command') {
    return {
      type: item.type,
      sourceId: item.sourceId || null,
      action: item.action,
      status: 'skipped',
      runner: 'unsupported',
      summary: 'artifact-only action is not executable in preflight',
      exitCode: null,
    };
  }

  const parsed = parseAiosCommandAction(item.action);
  if (!parsed || parsed.mode === 'help') {
    return {
      type: item.type,
      sourceId: item.sourceId || null,
      action: item.action,
      status: 'skipped',
      runner: 'unsupported',
      summary: 'unsupported orchestrate action',
      exitCode: null,
    };
  }

  const priorExitCode = process.exitCode;
  const buffered = createBufferedIo();
  try {
    if (parsed.command === 'quality-gate') {
      const qualityGateOptions = sessionId && !parsed.options.sessionId
        ? { ...parsed.options, sessionId }
        : parsed.options;
      const result = await preflightAdapters.qualityGate(qualityGateOptions, {
        rootDir,
        io: buffered.io,
        env,
      });
      process.exitCode = priorExitCode;
      return {
        type: item.type,
        sourceId: item.sourceId || null,
        action: item.action,
        status: result?.exitCode === 0 || result?.ok === true ? 'passed' : 'failed',
        runner: 'quality-gate',
        summary: buffered.lines.at(-1) || `quality-gate ${result?.mode || 'full'}`,
        exitCode: Number.isFinite(result?.exitCode) ? result.exitCode : (result?.ok === true ? 0 : 1),
      };
    }

    if (parsed.command === 'doctor') {
      const result = await preflightAdapters.doctor(parsed.options, {
        rootDir,
        io: buffered.io,
      });
      process.exitCode = priorExitCode;
      return {
        type: item.type,
        sourceId: item.sourceId || null,
        action: item.action,
        status: result?.exitCode === 0 || result?.ok === true ? 'passed' : 'failed',
        runner: 'doctor',
        summary: buffered.lines.at(-1) || 'doctor completed',
        exitCode: Number.isFinite(result?.exitCode) ? result.exitCode : (result?.ok === true ? 0 : 1),
      };
    }

    if (parsed.command === 'orchestrate') {
      if (!isSupportedPreflightOrchestrateAction(parsed.options)) {
        return {
          type: item.type,
          sourceId: item.sourceId || null,
          action: item.action,
          status: 'skipped',
          runner: 'unsupported',
          summary: 'unsupported orchestrate action: only local dry-run is executable in preflight',
          exitCode: null,
        };
      }

      const orchestrateOptions = buildPreflightOrchestrateOptions(parsed.options, sessionId);
      const orchestrateRunner = preflightAdapters.orchestrate || runOrchestrate;
      const result = await orchestrateRunner(orchestrateOptions, {
        rootDir,
        io: buffered.io,
        env,
        preflightAdapters,
      });
      const dispatchOk = result?.report?.dispatchRun?.ok === true;
      const jobCount = Array.isArray(result?.report?.dispatchRun?.jobRuns) ? result.report.dispatchRun.jobRuns.length : 0;
      process.exitCode = priorExitCode;
      return {
        type: item.type,
        sourceId: item.sourceId || null,
        action: item.action,
        status: dispatchOk ? 'passed' : 'failed',
        runner: 'orchestrate',
        summary: dispatchOk ? 'orchestrate dry-run ready jobs=' + String(jobCount) : 'orchestrate dry-run blocked jobs=' + String(jobCount),
        exitCode: dispatchOk ? 0 : (Number.isFinite(result?.exitCode) ? result.exitCode : 1),
      };
    }

    if (parsed.command === 'release-status') {
      const releaseStatusRunner = preflightAdapters.releaseStatus || runReleaseStatus;
      const releaseStatusOptions = {
        ...parsed.options,
        strict: true,
        format: 'json',
      };
      const result = await releaseStatusRunner(releaseStatusOptions, {
        rootDir,
        io: buffered.io,
      });
      const unavailable = isReleaseStateUnavailable(result);
      process.exitCode = priorExitCode;
      if (unavailable) {
        return {
          type: item.type,
          sourceId: item.sourceId || null,
          action: item.action,
          status: 'passed',
          runner: 'release-status',
          summary: 'release state unavailable (guard bypassed)',
          exitCode: 0,
        };
      }
      const passed = Number(result?.exitCode) === 0;
      const reasons = Array.isArray(result?.health?.reasons) ? result.health.reasons : [];
      return {
        type: item.type,
        sourceId: item.sourceId || null,
        action: item.action,
        status: passed ? 'passed' : 'failed',
        runner: 'release-status',
        summary: passed
          ? `release-status healthy samples=${result?.health?.metrics?.samples ?? 0}`
          : (reasons.length > 0 ? reasons.join(', ') : 'release-status strict gate failed'),
        exitCode: Number.isFinite(result?.exitCode) ? result.exitCode : (passed ? 0 : 1),
      };
    }
  } finally {
    process.exitCode = priorExitCode;
  }

  return {
    type: item.type,
    sourceId: item.sourceId || null,
    action: item.action,
    status: 'skipped',
    runner: 'unsupported',
    summary: `unsupported command: ${parsed.command}`,
    exitCode: null,
  };
}

async function executeDispatchPreflight(dispatchPolicy, {
  rootDir,
  env = process.env,
  sessionId = '',
  preflightMode = 'none',
  preflightAdapters = DEFAULT_PREFLIGHT_ADAPTERS,
  extraActions = [],
} = {}) {
  if (preflightMode === 'none' || !dispatchPolicy) {
    return null;
  }

  const results = [];
  const actionQueue = [
    ...(Array.isArray(dispatchPolicy.requiredActions) ? dispatchPolicy.requiredActions : []),
    ...(Array.isArray(extraActions) ? extraActions : []),
  ];
  for (const item of actionQueue) {
    results.push(await runPreflightAction(item, { rootDir, env, sessionId, preflightAdapters }));
  }

  return {
    mode: preflightMode,
    results,
  };
}

function normalizeJobRunStatus(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  if (value === 'blocked' || value === 'needs-input') return 'blocked';
  return value || 'unknown';
}

function isDispatchArtifactFileName(fileName = '') {
  return /^dispatch-run-.*\.json$/i.test(String(fileName || '').trim());
}

function uniq(items = []) {
  return [...new Set(items)];
}

async function readJsonOptional(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function listDispatchArtifacts(rootDir, sessionId) {
  const artifactsDir = path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', sessionId, 'artifacts');
  let entries = [];
  try {
    entries = await fs.readdir(artifactsDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && isDispatchArtifactFileName(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => String(right).localeCompare(String(left)))
    .map((name) => ({
      artifactPath: contextDbRelativePath(rootDir, 'sessions', sessionId, 'artifacts', name),
      artifactAbsPath: path.join(artifactsDir, name),
    }));
}

function normalizeSeedJobRun(rawJobRun = {}) {
  const jobId = String(rawJobRun?.jobId || '').trim();
  if (!jobId) {
    return null;
  }
  if (normalizeJobRunStatus(rawJobRun?.status) === 'blocked') {
    return null;
  }
  return {
    jobId,
    jobType: String(rawJobRun?.jobType || '').trim(),
    role: String(rawJobRun?.role || '').trim(),
    executor: String(rawJobRun?.executor || '').trim(),
    executorLabel: String(rawJobRun?.executorLabel || '').trim(),
    dependsOn: Array.isArray(rawJobRun?.dependsOn)
      ? rawJobRun.dependsOn.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    status: String(rawJobRun?.status || 'completed').trim() || 'completed',
    inputSummary: rawJobRun?.inputSummary && typeof rawJobRun.inputSummary === 'object'
      ? { ...rawJobRun.inputSummary }
      : { dependencyCount: 0, inputTypes: [] },
    output: rawJobRun?.output && typeof rawJobRun.output === 'object'
      ? { ...rawJobRun.output }
      : { outputType: 'handoff' },
  };
}

async function loadLatestBlockedDispatchReplay(rootDir, sessionId) {
  const artifactFiles = await listDispatchArtifacts(rootDir, sessionId);
  for (const file of artifactFiles) {
    const artifact = await readJsonOptional(file.artifactAbsPath);
    const jobRuns = Array.isArray(artifact?.dispatchRun?.jobRuns) ? artifact.dispatchRun.jobRuns : [];
    const blockedJobIds = uniq(
      jobRuns
        .filter((jobRun) => normalizeJobRunStatus(jobRun?.status) === 'blocked')
        .map((jobRun) => String(jobRun?.jobId || '').trim())
        .filter(Boolean)
    );
    if (blockedJobIds.length === 0) {
      continue;
    }
    const seedJobRuns = jobRuns
      .map((jobRun) => normalizeSeedJobRun(jobRun))
      .filter(Boolean);
    return {
      artifactPath: file.artifactPath,
      blockedJobIds,
      seedJobRuns,
    };
  }
  return null;
}

function applyRetryBlockedDispatchPlan(dispatchPlan, retryReplay) {
  const blockedJobIds = Array.isArray(retryReplay?.blockedJobIds)
    ? retryReplay.blockedJobIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (blockedJobIds.length === 0) {
    return {
      dispatchPlan,
      replay: {
        enabled: false,
        reason: 'no-blocked-jobs',
      },
    };
  }

  const blockedSet = new Set(blockedJobIds);
  const replayJobs = Array.isArray(dispatchPlan?.jobs)
    ? dispatchPlan.jobs.filter((job) => blockedSet.has(String(job?.jobId || '').trim()))
    : [];
  if (replayJobs.length === 0) {
    return {
      dispatchPlan,
      replay: {
        enabled: false,
        reason: 'blocked-jobs-not-found-in-current-plan',
        blockedJobIds,
      },
    };
  }

  const replayJobIdSet = new Set(replayJobs.map((job) => String(job?.jobId || '').trim()).filter(Boolean));
  const replayQueueEntries = Array.isArray(dispatchPlan?.workItemQueue?.entries)
    ? dispatchPlan.workItemQueue.entries.filter((entry) => replayJobIdSet.has(String(entry?.jobId || '').trim()))
    : [];
  const replayExecutors = uniq(
    replayJobs
      .map((job) => String(job?.launchSpec?.executor || '').trim())
      .filter(Boolean)
  );
  const replayExecutorDetails = Array.isArray(dispatchPlan?.executorDetails)
    ? dispatchPlan.executorDetails.filter((item) => replayExecutors.includes(String(item?.id || '').trim()))
    : [];
  const replayExecutorRegistry = replayExecutorDetails.length > 0
    ? replayExecutorDetails.map((item) => item.id)
    : replayExecutors;
  const seedJobRuns = Array.isArray(retryReplay?.seedJobRuns)
    ? retryReplay.seedJobRuns
      .filter((jobRun) => !replayJobIdSet.has(String(jobRun?.jobId || '').trim()))
      .map((jobRun) => ({ ...jobRun }))
    : [];

  return {
    dispatchPlan: {
      ...dispatchPlan,
      notes: [
        ...(Array.isArray(dispatchPlan?.notes) ? dispatchPlan.notes : []),
        `Retry-blocked replay from ${retryReplay.artifactPath}: jobs=${replayJobs.length}, seedDeps=${seedJobRuns.length}.`,
      ],
      executorRegistry: replayExecutorRegistry,
      executorDetails: replayExecutorDetails,
      workItemQueue: {
        ...(dispatchPlan?.workItemQueue && typeof dispatchPlan.workItemQueue === 'object' ? dispatchPlan.workItemQueue : {}),
        enabled: replayQueueEntries.length > 0,
        entries: replayQueueEntries,
      },
      jobs: replayJobs,
      seedJobRuns,
    },
    replay: {
      enabled: true,
      artifactPath: retryReplay.artifactPath,
      blockedJobIds,
      replayJobIds: replayJobs.map((job) => job.jobId),
      seedJobIds: seedJobRuns.map((jobRun) => jobRun.jobId),
    },
  };
}

export function normalizeOrchestrateOptions(rawOptions = {}) {
  const blueprintRaw = String(rawOptions.blueprint || '').trim();
  const taskTitleRaw = String(rawOptions.taskTitle || '').trim();
  const planPath = String(rawOptions.planPath || '').trim();
  const resumeSessionIdRaw = String(rawOptions.resumeSessionId || '').trim();
  let sessionId = String(rawOptions.sessionId || '').trim();
  if (!sessionId && resumeSessionIdRaw) {
    sessionId = resumeSessionIdRaw;
  }
  const resumeSessionId = resumeSessionIdRaw || sessionId;
  const retryBlocked = rawOptions.retryBlocked === true;
  const force = rawOptions.force === true;
  const recommendationId = String(rawOptions.recommendationId || '').trim();
  const dispatchModeRaw = String(rawOptions.dispatchMode ?? '').trim();
  const executionModeRaw = String(rawOptions.executionMode ?? '').trim();
  const preflightModeRaw = String(rawOptions.preflightMode ?? '').trim();
  const phaseExecutor = String(rawOptions.phaseExecutor || '').trim();
  const dispatchModeProvided = dispatchModeRaw.length > 0;
  const executionModeProvided = executionModeRaw.length > 0;
  const preflightModeProvided = preflightModeRaw.length > 0;

  let dispatchMode = dispatchModeProvided ? normalizeOrchestrateDispatchMode(dispatchModeRaw) : 'none';
  let executionMode = executionModeProvided ? normalizeOrchestrateExecutionMode(executionModeRaw) : 'none';
  let preflightMode = preflightModeProvided ? normalizeOrchestratePreflightMode(preflightModeRaw) : 'none';

  // Smart defaults: if the operator didn't specify dispatch/execute, default to
  // a local dry-run execution so we always produce a runnable DAG + evidence
  // (0 token cost).
  if (!dispatchModeProvided && !executionModeProvided) {
    dispatchMode = 'local';
    executionMode = 'dry-run';
  }

  // If an operator specifies an execution mode but omits dispatch mode, assume
  // local dispatch (we only support local execution in this harness).
  if (!dispatchModeProvided && executionModeProvided && executionMode !== 'none') {
    dispatchMode = 'local';
  }

  // If an operator opts into local dispatch but omits execution mode, default
  // to dry-run (keeps orchestration zero-cost unless explicitly set to live).
  if (dispatchMode === 'local' && !executionModeProvided) {
    executionMode = 'dry-run';
  }

  if (recommendationId && !sessionId) {
    throw new Error('--recommendation requires --session');
  }
  if (executionMode !== 'none' && dispatchMode !== 'local') {
    throw new Error('--execute requires --dispatch local');
  }
  if (preflightMode !== 'none' && !sessionId) {
    throw new Error('--preflight requires --session');
  }
  if (retryBlocked && !resumeSessionId) {
    throw new Error('--retry-blocked requires --resume <session-id> or --session <session-id>');
  }

  return {
    blueprint: blueprintRaw ? normalizeOrchestratorBlueprint(blueprintRaw) : 'feature',
    blueprintExplicit: blueprintRaw.length > 0,
    taskTitle: taskTitleRaw || 'Untitled task',
    taskTitleExplicit: taskTitleRaw.length > 0,
    contextSummary: String(rawOptions.contextSummary || '').trim(),
    planPath,
    sessionId,
    resumeSessionId,
    retryBlocked,
    force,
    limit: normalizePositiveInteger(rawOptions.limit, 10),
    recommendationId,
    dispatchMode,
    executionMode,
    preflightMode,
    phaseExecutor,
    format: normalizeOrchestratorFormat(rawOptions.format ?? 'text'),
  };
}

export function planOrchestrate(rawOptions = {}) {
  const options = normalizeOrchestrateOptions(rawOptions);
  const args = ['orchestrate'];

  if (!options.sessionId || options.blueprintExplicit) {
    args.push(options.blueprint);
  }
  if (!options.sessionId || options.taskTitleExplicit) {
    args.push('--task', JSON.stringify(options.taskTitle));
  }
  if (options.contextSummary) {
    args.push('--context', JSON.stringify(options.contextSummary));
  }
  if (options.planPath) {
    args.push('--plan', options.planPath);
  }
  if (options.sessionId) {
    args.push('--session', options.sessionId);
    if (options.limit !== 10) {
      args.push('--limit', String(options.limit));
    }
  }
  if (options.resumeSessionId && options.resumeSessionId !== options.sessionId) {
    args.push('--resume', options.resumeSessionId);
  }
  if (options.recommendationId) {
    args.push('--recommendation', options.recommendationId);
  }
  if (options.retryBlocked) {
    args.push('--retry-blocked');
  }
  if (options.force) {
    args.push('--force');
  }
  if (options.dispatchMode !== 'none') {
    args.push('--dispatch', options.dispatchMode);
  }
  if (options.executionMode !== 'none') {
    args.push('--execute', options.executionMode);
  }
  if (options.preflightMode !== 'none') {
    args.push('--preflight', options.preflightMode);
  }
  if (options.format !== 'text') {
    args.push('--format', options.format);
  }
  return {
    command: 'orchestrate',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}

export async function runOrchestrate(
  rawOptions = {},
  {
    rootDir,
    io = console,
    env = process.env,
    preflightAdapters = DEFAULT_PREFLIGHT_ADAPTERS,
    dispatchRuntimeRegistry = createDispatchRuntimeRegistry(),
    runtimeId = '',
  } = {}
) {
  const { options } = planOrchestrate(rawOptions);

  let blueprint = options.blueprint;
  let taskTitle = options.taskTitle;
  let contextSummary = options.contextSummary;
  let learnEvalOverlay = null;
  let learnEvalReport = null;
  let readiness = null;

  if (options.sessionId) {
    learnEvalReport = await buildLearnEvalReport(
      { sessionId: options.sessionId, limit: options.limit },
      { rootDir }
    );
    learnEvalOverlay = buildLearnEvalOverlay(learnEvalReport, options.recommendationId);

    if (!options.blueprintExplicit) {
      const recommendedBlueprint = extractBlueprintFromTargetId(learnEvalOverlay.selectedRecommendationId);
      if (recommendedBlueprint) {
        blueprint = recommendedBlueprint;
      }
    }

    if (!options.taskTitleExplicit && String(learnEvalReport.session.goal || '').trim()) {
      taskTitle = String(learnEvalReport.session.goal).trim();
    }

    const overlayContext = buildOverlayContext(learnEvalOverlay);
    contextSummary = [options.contextSummary, overlayContext].filter(Boolean).join(' | ');
  }

  const replaySessionId = options.resumeSessionId || options.sessionId;
  const dispatchHindsightSummary = extractDispatchHindsightSummary(learnEvalReport);
  const retryBlockedDispatchUnstable = options.retryBlocked && isRetryBlockedDispatchUnstable(dispatchHindsightSummary);

  if (retryBlockedDispatchUnstable && options.executionMode === 'live' && !options.force) {
    const message = `[guard] refusing live --retry-blocked for session ${replaySessionId}: dispatch hindsight pairs=${dispatchHindsightSummary.pairsAnalyzed} repeatBlocked=${dispatchHindsightSummary.repeatedBlockedTurns} regressions=${dispatchHindsightSummary.regressions}`;
    const recoveryCommands = buildRetryBlockedRecoveryCommands(replaySessionId, env);
    const suggestion = `Run: ${recoveryCommands[0] || `node scripts/aios.mjs learn-eval --session ${replaySessionId}`} (or retry with --dry-run / --force)`;

    if (options.format === 'json') {
      const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        kind: 'guardrail.retry-blocked',
        sessionId: replaySessionId,
        executionMode: options.executionMode,
        retryBlocked: true,
        force: false,
        dispatchHindsight: dispatchHindsightSummary,
        message: `${message}. ${suggestion}`,
        suggestedCommands: recoveryCommands,
      };
      io.log(JSON.stringify(report, null, 2));
      return { exitCode: 1, report };
    }

    writeWarning(io, `${message}\n${suggestion}\nSuggested:\n- ${recoveryCommands.slice(0, 4).join('\n- ')}`);
    return { exitCode: 1 };
  }

  if (retryBlockedDispatchUnstable) {
    if (options.force) {
      writeWarning(
        io,
        `[warn] live --retry-blocked override (--force): session ${replaySessionId} has unstable dispatch hindsight (pairs=${dispatchHindsightSummary.pairsAnalyzed} repeatBlocked=${dispatchHindsightSummary.repeatedBlockedTurns} regressions=${dispatchHindsightSummary.regressions})`
      );
    } else if (options.executionMode !== 'live') {
      writeWarning(
        io,
        `[warn] --retry-blocked: session ${replaySessionId} has unstable dispatch hindsight (pairs=${dispatchHindsightSummary.pairsAnalyzed} repeatBlocked=${dispatchHindsightSummary.repeatedBlockedTurns} regressions=${dispatchHindsightSummary.regressions})`
      );
    }
  }

  const rawDispatchPolicy = buildDispatchPolicy({
    learnEvalReport,
    learnEvalOverlay,
  });
  const preflightExtraActions = options.preflightMode === 'auto'
    ? [buildReleaseGuardAction()]
    : [];
  const dispatchPreflight = await executeDispatchPreflight(rawDispatchPolicy, {
    rootDir,
    env,
    sessionId: options.sessionId,
    preflightMode: options.preflightMode,
    preflightAdapters,
    extraActions: preflightExtraActions,
  });
  let effectiveLearnEvalReport = learnEvalReport;
  if (
    options.sessionId
    && dispatchPreflight?.results?.some((item) => (item.runner === 'quality-gate' || item.runner === 'orchestrate') && item.status !== 'skipped')
  ) {
    effectiveLearnEvalReport = await buildLearnEvalReport(
      { sessionId: options.sessionId, limit: options.limit },
      { rootDir }
    );
  }
  const preflightDispatchPolicy = buildDispatchPolicy({
    learnEvalReport: effectiveLearnEvalReport,
    learnEvalOverlay,
  }) || rawDispatchPolicy;
  const effectiveDispatchPolicy = buildEffectiveDispatchPolicy({
    dispatchPolicy: preflightDispatchPolicy,
    dispatchPreflight,
    learnEvalReport: effectiveLearnEvalReport,
  }) || preflightDispatchPolicy || rawDispatchPolicy;
  const releaseGuardedEffectiveDispatchPolicy = applyReleaseGuardBlock(effectiveDispatchPolicy, dispatchPreflight);

  const basePlan = buildOrchestrationPlan({
    blueprint,
    taskTitle,
    contextSummary,
    learnEvalOverlay,
    dispatchPolicy: rawDispatchPolicy,
    dispatchPreflight,
    effectiveDispatchPolicy: releaseGuardedEffectiveDispatchPolicy,
  });
  const dagPlan = {
    ...basePlan,
    dispatchPolicy: releaseGuardedEffectiveDispatchPolicy,
  };

  let dispatchPlan = options.dispatchMode === 'local'
    ? buildLocalDispatchPlan(dagPlan, { phaseExecutor: options.phaseExecutor, env })
    : null;
  let retryReplay = null;
  if (options.retryBlocked) {
    const replaySessionId = options.resumeSessionId || options.sessionId;
    const latestReplay = await loadLatestBlockedDispatchReplay(rootDir, replaySessionId);
    if (!latestReplay) {
      throw new Error(`No blocked dispatch artifact found for session: ${replaySessionId}`);
    }
    if (!dispatchPlan) {
      throw new Error('--retry-blocked requires --dispatch local');
    }
    const replayResult = applyRetryBlockedDispatchPlan(dispatchPlan, latestReplay);
    if (!replayResult.replay?.enabled) {
      throw new Error(
        `Cannot apply --retry-blocked for session ${replaySessionId}: ${replayResult.replay?.reason || 'unknown-reason'}`
      );
    }
    dispatchPlan = replayResult.dispatchPlan;
    retryReplay = {
      sessionId: replaySessionId,
      ...replayResult.replay,
    };
  }

  if (options.preflightMode === 'auto') {
    const planReadiness = await evaluatePlanEvidence({
      rootDir,
      planPath: options.planPath,
    });
    const ownershipReadiness = evaluateOwnershipEvidence({
      dispatchPlan,
      workItems: basePlan.workItems,
    });
    readiness = mergeReadinessVerdicts(planReadiness, ownershipReadiness);
  }

  if (options.executionMode === 'live' && readiness?.verdict === 'blocked' && !options.force) {
    const message = '[guard] refusing live execution: preflight readiness is blocked.';
    const suggestedCommands = readiness.nextActions || [];
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      kind: 'guardrail.preflight-readiness',
      sessionId: options.sessionId || null,
      executionMode: 'live',
      message,
      ...basePlan,
      readiness,
      suggestedCommands,
      ...(dispatchPlan ? { dispatchPlan } : {}),
      ...(dispatchPreflight ? { dispatchPreflight } : {}),
      ...(releaseGuardedEffectiveDispatchPolicy ? { effectiveDispatchPolicy: releaseGuardedEffectiveDispatchPolicy } : {}),
    };
    if (options.format === 'json') {
      io.log(JSON.stringify(report, null, 2));
      return { exitCode: 1, report };
    }
    writeWarning(io, `${message} ${readiness.blockedReasons.join(', ') || 'unknown reason'}`);
    return { exitCode: 1, report };
  }

  if (options.executionMode === 'live' && readiness?.verdict === 'blocked' && options.force) {
    writeWarning(io, `[warn] live preflight readiness override (--force): ${readiness.blockedReasons.join(', ')}`);
  }

  const dispatchRunStartedAt = Date.now();
  const dispatchRuntime = options.executionMode !== 'none'
    ? resolveDispatchRuntime({ executionMode: options.executionMode, runtimeId }, dispatchRuntimeRegistry)
    : null;
  const executorCapabilityManifest = dispatchPlan
    ? buildExecutorCapabilityManifest({
      dispatchPlan,
      executionMode: options.executionMode,
      runtimeId: dispatchRuntime?.id || '',
    })
    : null;
  const unknownCapabilityGuard = options.executionMode === 'live'
    ? collectUnknownLiveCapabilities(executorCapabilityManifest)
    : { blocked: false, summaryKeys: [], executors: [] };
  const allowUnknownCapabilities = options.executionMode === 'live'
    ? canOverrideUnknownLiveCapabilities(options, env)
    : true;

  if (options.executionMode === 'live' && unknownCapabilityGuard.blocked && !allowUnknownCapabilities) {
    const summaryLabel = unknownCapabilityGuard.summaryKeys.join(', ');
    const executorLabel = unknownCapabilityGuard.executors.length > 0
      ? unknownCapabilityGuard.executors
        .map((item) => `${item.id}(jobs=${item.jobCount} unknown=${item.unknown.join('/')})`)
        .join('; ')
      : '(none)';
    const suggestedCommands = buildUnknownCapabilityGuardSuggestedCommands(options);
    const message = `[guard] refusing live execution: capability manifest has unknown surfaces (${summaryLabel}).`;
    const suggestion = `Run dry-run first, then override with --force (or AIOS_ALLOW_UNKNOWN_CAPABILITIES=1) when you accept the risk.`;

    if (options.format === 'json') {
      const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        kind: 'guardrail.capability-unknown',
        sessionId: options.sessionId || null,
        executionMode: 'live',
        runtimeId: dispatchRuntime?.id || null,
        summary: executorCapabilityManifest?.summary || null,
        unknownCapabilities: unknownCapabilityGuard.summaryKeys,
        unknownExecutors: unknownCapabilityGuard.executors,
        message: `${message} ${suggestion}`,
        suggestedCommands,
      };
      io.log(JSON.stringify(report, null, 2));
      return { exitCode: 1, report };
    }

    writeWarning(
      io,
      `${message}\nExecutors: ${executorLabel}\n${suggestion}\nSuggested:\n- ${suggestedCommands.join('\n- ')}`
    );
    return { exitCode: 1 };
  }

  if (options.executionMode === 'live' && unknownCapabilityGuard.blocked && allowUnknownCapabilities) {
    const summaryLabel = unknownCapabilityGuard.summaryKeys.join(', ');
    const override = options.force === true ? '--force' : 'AIOS_ALLOW_UNKNOWN_CAPABILITIES=1';
    writeWarning(
      io,
      `[warn] live capability guard override (${override}): unknown surfaces=${summaryLabel}`
    );
  }

  const rawDispatchRun = dispatchRuntime
    ? await dispatchRuntime.execute({
      plan: dagPlan,
      dispatchPlan,
      dispatchPolicy: effectiveDispatchPolicy,
      io,
      env,
      rootDir,
    })
    : null;
  const dispatchRun = dispatchRuntime && rawDispatchRun
    ? normalizeDispatchRuntimeResult(rawDispatchRun, dispatchRuntime, options.executionMode)
    : null;

  const postDispatchPolicy = buildDispatchPolicy({
    learnEvalReport: effectiveLearnEvalReport,
    learnEvalOverlay,
    dispatchPlan,
    dispatchRun,
  }) || preflightDispatchPolicy || rawDispatchPolicy;
  const finalEffectiveDispatchPolicy = buildEffectiveDispatchPolicy({
    dispatchPolicy: postDispatchPolicy,
    dispatchPreflight,
    learnEvalReport: effectiveLearnEvalReport,
  }) || effectiveDispatchPolicy || postDispatchPolicy;
  const releaseGuardedFinalDispatchPolicy = applyReleaseGuardBlock(finalEffectiveDispatchPolicy, dispatchPreflight);
  const clarityGate = options.executionMode === 'live' && dispatchRun
    ? evaluateClarityGate(
      {
        sessionId: options.sessionId,
        learnEvalReport: effectiveLearnEvalReport,
        dispatchRun,
      },
      {
        blockedCheckpointThreshold: normalizePositiveInteger(env?.AIOS_HUMAN_GATE_BLOCKED_THRESHOLD, 2),
        maxFilesTouched: normalizePositiveInteger(env?.AIOS_HUMAN_GATE_MAX_FILES, 25),
      }
    )
    : null;
  const clarityGateEvidence = clarityGate?.needsHuman
    ? persistClarityGateDecision({
      rootDir,
      sessionId: options.sessionId,
      gate: clarityGate,
    })
    : null;
  const resolvedClarityGate = clarityGate
    ? {
      ...clarityGate,
      ...(clarityGateEvidence ? { evidence: clarityGateEvidence } : {}),
    }
    : null;
  const clarityAdjustedPolicy = resolvedClarityGate?.needsHuman
    ? {
      ...releaseGuardedFinalDispatchPolicy,
      status: 'blocked',
      parallelism: 'serial-only',
      blockerIds: [...new Set([...(releaseGuardedFinalDispatchPolicy?.blockerIds || []), 'gate.clarity-human'])],
      requiredActions: [
        ...(Array.isArray(releaseGuardedFinalDispatchPolicy?.requiredActions) ? releaseGuardedFinalDispatchPolicy.requiredActions : []),
        {
          type: 'command',
          action: `node scripts/aios.mjs entropy-gc dry-run --session ${options.sessionId} --format json`,
          sourceId: 'gate.clarity-human',
        },
        {
          type: 'command',
          action: `node scripts/aios.mjs orchestrate --session ${options.sessionId} --dispatch local --execute live --format json`,
          sourceId: 'gate.clarity-human',
        },
      ],
      notes: [
        ...(Array.isArray(releaseGuardedFinalDispatchPolicy?.notes) ? releaseGuardedFinalDispatchPolicy.notes : []),
        'Clarity gate required human input before continuing automation.',
      ],
    }
    : releaseGuardedFinalDispatchPolicy;
  const entropyGc = options.executionMode === 'live'
    && dispatchRun
    && dispatchRun.ok === true
    && options.sessionId
    && parseBooleanEnv(env?.AIOS_ENTROPY_AUTO, true)
    ? await executeEntropyGc(
      {
        sessionId: options.sessionId,
        mode: resolvedClarityGate?.needsHuman ? 'off' : 'auto',
        retain: normalizePositiveInteger(env?.AIOS_ENTROPY_RETAIN, 5),
        minAgeHours: normalizePositiveInteger(env?.AIOS_ENTROPY_MIN_AGE_HOURS, 24),
        format: 'json',
      },
      {
        rootDir,
        persistEvidence: true,
      }
    )
    : null;
  const dispatchPolicy = rawDispatchPolicy;
  const workItemTelemetry = buildWorkItemTelemetry({
    dispatchPlan,
    dispatchRun,
  });
  const dispatchInsights = buildDispatchInsights({
    dispatchPlan,
    dispatchRun,
    workItemTelemetry,
    executorCapabilityManifest,
    clarityGate: resolvedClarityGate,
  });

  const reportBasePlan = buildOrchestrationPlan({
    blueprint,
    taskTitle,
    contextSummary,
    learnEvalOverlay,
    dispatchPolicy,
    dispatchPreflight,
    effectiveDispatchPolicy: clarityAdjustedPolicy,
    executorCapabilityManifest,
    readiness,
  });
  const dispatchEvidence = dispatchRun
    ? await persistDispatchEvidence({
      rootDir,
      sessionId: options.sessionId,
      report: {
        ...reportBasePlan,
        ...(dispatchPlan ? { dispatchPlan } : {}),
        ...(dispatchRun ? { dispatchRun } : {}),
        ...(dispatchPolicy ? { dispatchPolicy } : {}),
        ...(dispatchPreflight ? { dispatchPreflight } : {}),
        ...(clarityAdjustedPolicy ? { effectiveDispatchPolicy: clarityAdjustedPolicy } : {}),
        ...(resolvedClarityGate ? { clarityGate: resolvedClarityGate } : {}),
        ...(entropyGc ? { entropyGc } : {}),
        ...(workItemTelemetry ? { workItemTelemetry } : {}),
        ...(dispatchInsights ? { dispatchInsights } : {}),
        ...(retryReplay ? { retryReplay } : {}),
        ...(readiness ? { readiness } : {}),
      },
      elapsedMs: Date.now() - dispatchRunStartedAt,
    })
    : null;

  const report = {
    ...reportBasePlan,
    ...(dispatchPlan ? { dispatchPlan } : {}),
    ...(dispatchRun ? { dispatchRun } : {}),
    ...(dispatchPolicy ? { dispatchPolicy } : {}),
    ...(dispatchPreflight ? { dispatchPreflight } : {}),
    ...(clarityAdjustedPolicy ? { effectiveDispatchPolicy: clarityAdjustedPolicy } : {}),
    ...(resolvedClarityGate ? { clarityGate: resolvedClarityGate } : {}),
    ...(entropyGc ? { entropyGc } : {}),
    ...(workItemTelemetry ? { workItemTelemetry } : {}),
    ...(dispatchInsights ? { dispatchInsights } : {}),
    ...(retryReplay ? { retryReplay } : {}),
    ...(readiness ? { readiness } : {}),
    ...(dispatchEvidence ? { dispatchEvidence } : {}),
  };

  if (options.format === 'json') {
    io.log(JSON.stringify(report, null, 2));
    return { exitCode: 0, report };
  }

  io.log(renderOrchestrationReport(report));
  return { exitCode: 0, report };
}
