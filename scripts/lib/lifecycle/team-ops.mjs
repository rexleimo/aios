import { promises as fs } from 'node:fs';
import path from 'node:path';

import { listContextDbSessions, readHudDispatchSummary, readHudState } from '../hud/state.mjs';
import { normalizeHudPreset, renderHud } from '../hud/render.mjs';
import {
  filterSkillCandidateState,
  formatSkillCandidateDetails,
  formatSkillCandidatePatchTemplateDocument,
} from '../hud/skill-candidates.mjs';
import { buildWatchMeta } from '../hud/watch-meta.mjs';
import { resolveWatchCadence } from '../hud/watch-cadence.mjs';
import { createThrottledWatchRender, watchRenderLoop } from '../hud/watch.mjs';
import { buildTeamWatchdogState } from './watchdog.mjs';

const FAST_WATCH_DATA_REFRESH_MS = 1000;
const DEFAULT_SKILL_CANDIDATE_LIMIT = 6;
const FAST_WATCH_MINIMAL_SKILL_CANDIDATE_LIMIT = 3;
const MAX_SKILL_CANDIDATE_LIMIT = 20;
const SKILL_CANDIDATE_VIEWS = new Set(['inline', 'detail']);
const DEFAULT_WATCH_STALLED_MS = 30_000;
const MIN_WATCH_STALLED_MS = 1000;
const MAX_WATCH_STALLED_MS = 10 * 60 * 1000;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeCounter(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function toPosixPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/');
}

function normalizeSkillCandidateView(value, fallback = 'inline') {
  const normalized = normalizeText(value).toLowerCase();
  if (SKILL_CANDIDATE_VIEWS.has(normalized)) return normalized;
  if (normalized === 'list') return 'detail';
  return fallback;
}

function formatArtifactTimestamp(ts = new Date()) {
  return ts.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function normalizeConcurrency(value, fallback = 4) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(16, Math.max(1, Math.floor(parsed)));
}

function normalizeWatchStalledMs(rawValue, fallback = DEFAULT_WATCH_STALLED_MS) {
  const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
  const resolved = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.min(MAX_WATCH_STALLED_MS, Math.max(MIN_WATCH_STALLED_MS, Math.floor(resolved)));
}

function normalizeProvider(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'codex' || normalized === 'claude' || normalized === 'gemini' || normalized === 'kiro') {
    return normalized;
  }
  return 'codex';
}

function normalizeQualityOutcome(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'retry-needed') return 'failed';
  if (normalized === 'success') return 'ok';
  return normalized;
}

function normalizeQualityCategory(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeProgressCounts(progress = null) {
  if (!progress || typeof progress !== 'object') return null;
  const total = Number.isFinite(progress.total) ? Math.max(0, Math.floor(progress.total)) : 0;
  if (total <= 0) return null;
  return {
    total,
    done: Number.isFinite(progress.done) ? Math.max(0, Math.floor(progress.done)) : 0,
    running: Number.isFinite(progress.running) ? Math.max(0, Math.floor(progress.running)) : 0,
    blocked: Number.isFinite(progress.blocked) ? Math.max(0, Math.floor(progress.blocked)) : 0,
    queued: Number.isFinite(progress.queued) ? Math.max(0, Math.floor(progress.queued)) : 0,
  };
}

function normalizeToolProgress(toolProgress = []) {
  if (!Array.isArray(toolProgress)) return [];
  return toolProgress
    .map((entry) => ({
      tool: normalizeText(entry?.tool),
      counts: normalizeProgressCounts(entry),
    }))
    .filter((entry) => entry.tool && entry.counts)
    .sort((left, right) =>
      right.counts.blocked - left.counts.blocked
      || right.counts.running - left.counts.running
      || right.counts.total - left.counts.total
      || left.tool.localeCompare(right.tool)
    );
}

function buildProgressSnapshot(state = null) {
  const dispatch = state?.latestDispatch && typeof state.latestDispatch === 'object'
    ? state.latestDispatch
    : null;
  const jobCounts = normalizeProgressCounts(dispatch?.jobProgress);
  if (!dispatch || !jobCounts) return null;
  const tools = normalizeToolProgress(dispatch?.toolProgress);
  const active = jobCounts.done < jobCounts.total;
  const signature = JSON.stringify({
    ok: dispatch.ok === true,
    mode: normalizeText(dispatch.mode),
    jobCounts,
    tools: tools.map((entry) => ({ tool: entry.tool, ...entry.counts })),
  });
  return {
    active,
    jobCounts,
    tools,
    signature,
  };
}

function formatStalledToolSummary(tools = [], limit = 2) {
  const capped = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 2;
  if (!Array.isArray(tools) || tools.length === 0) return '';
  const top = tools.slice(0, capped).map((entry) => (
    `${entry.tool}:${entry.counts.done}/${entry.counts.total}(r=${entry.counts.running} b=${entry.counts.blocked} q=${entry.counts.queued})`
  ));
  if (tools.length > capped) {
    top.push(`+${tools.length - capped}`);
  }
  return top.join(' | ');
}

export function createStatusWatchStallTracker({
  thresholdMs = DEFAULT_WATCH_STALLED_MS,
  nowFn = () => Date.now(),
} = {}) {
  const normalizedThresholdMs = normalizeWatchStalledMs(thresholdMs, DEFAULT_WATCH_STALLED_MS);
  let previousSignature = '';
  let lastChangedAtMs = null;

  return {
    thresholdMs: normalizedThresholdMs,
    observe(state = null, { nowMs: injectedNowMs = null } = {}) {
      const rawNow = Number.isFinite(injectedNowMs)
        ? Number(injectedNowMs)
        : Number(nowFn());
      const nowMs = Number.isFinite(rawNow) ? rawNow : Date.now();
      const snapshot = buildProgressSnapshot(state);
      if (!snapshot || !snapshot.active) {
        previousSignature = snapshot?.signature || '';
        lastChangedAtMs = nowMs;
        return null;
      }

      if (!previousSignature || snapshot.signature !== previousSignature) {
        previousSignature = snapshot.signature;
        lastChangedAtMs = nowMs;
        return null;
      }

      if (!Number.isFinite(lastChangedAtMs)) {
        lastChangedAtMs = nowMs;
        return null;
      }

      const stalledForMs = Math.max(0, nowMs - lastChangedAtMs);
      if (stalledForMs < normalizedThresholdMs) {
        return null;
      }

      return {
        stalled: true,
        stalledForMs,
        stalledThresholdMs: normalizedThresholdMs,
        stalledJobCounts: snapshot.jobCounts,
        stalledToolSummary: formatStalledToolSummary(snapshot.tools),
      };
    },
  };
}

function normalizeQualityCategoryPrefixes(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value
      .map((item) => normalizeQualityCategory(item))
      .filter(Boolean)));
  }
  return Array.from(new Set(normalizeText(value)
    .split(',')
    .map((item) => normalizeQualityCategory(item))
    .filter(Boolean)));
}

function normalizeQualityCategoryPrefixMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === 'all' ? 'all' : 'any';
}

function resolveQualityCategory(record) {
  const qualityGate = record?.qualityGate && typeof record.qualityGate === 'object'
    ? record.qualityGate
    : null;
  return normalizeText(qualityGate?.failureCategory) || normalizeText(qualityGate?.categoryRef);
}

function hasFailedQualityGate(record) {
  const qualityGate = record?.qualityGate && typeof record.qualityGate === 'object'
    ? record.qualityGate
    : null;
  return normalizeQualityOutcome(qualityGate?.outcome) === 'failed';
}

function matchesQualityCategory(record, categoryFilter) {
  if (!categoryFilter) return true;
  if (!hasFailedQualityGate(record)) return false;
  return normalizeQualityCategory(resolveQualityCategory(record)) === categoryFilter;
}

function matchesQualityCategoryPrefix(record, categoryPrefixFilters = [], mode = 'any') {
  if (!Array.isArray(categoryPrefixFilters) || categoryPrefixFilters.length === 0) return true;
  if (!hasFailedQualityGate(record)) return false;
  const category = normalizeQualityCategory(resolveQualityCategory(record));
  if (mode === 'all') {
    return categoryPrefixFilters.every((prefix) => category.startsWith(prefix));
  }
  return categoryPrefixFilters.some((prefix) => category.startsWith(prefix));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const resolvedConcurrency = normalizeConcurrency(concurrency, 1);
  const results = new Array(items.length);
  let cursor = 0;

  const workerCount = Math.min(resolvedConcurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

export function resolveStatusSkillCandidateOptions({
  showSkillCandidates = false,
  requestedSkillCandidateLimit = 0,
  skillCandidateView = 'inline',
  exportSkillCandidatePatchTemplate = false,
  draftId = '',
  fastWatchMinimal = false,
} = {}) {
  const requestedLimit = Number.isFinite(requestedSkillCandidateLimit)
    ? Math.max(0, Math.floor(requestedSkillCandidateLimit))
    : 0;
  const normalizedDraftId = normalizeText(draftId);
  const shouldExportPatchTemplate = exportSkillCandidatePatchTemplate === true;
  const shouldShowSkillCandidates = showSkillCandidates === true || requestedLimit > 0 || shouldExportPatchTemplate || Boolean(normalizedDraftId);
  const boundedRequestedLimit = Math.min(MAX_SKILL_CANDIDATE_LIMIT, requestedLimit);
  const defaultLimit = fastWatchMinimal
    ? FAST_WATCH_MINIMAL_SKILL_CANDIDATE_LIMIT
    : DEFAULT_SKILL_CANDIDATE_LIMIT;
  const skillCandidateLimit = shouldShowSkillCandidates
    ? Math.max(1, boundedRequestedLimit || defaultLimit)
    : 0;
  const resolvedSkillCandidateView = shouldShowSkillCandidates
    ? normalizeSkillCandidateView(skillCandidateView, 'inline')
    : 'inline';

  return {
    showSkillCandidates: shouldShowSkillCandidates,
    skillCandidateLimit,
    skillCandidateView: resolvedSkillCandidateView,
    exportSkillCandidatePatchTemplate: shouldExportPatchTemplate && shouldShowSkillCandidates,
    draftId: normalizedDraftId,
  };
}

function buildSkillCandidatePatchTemplateArtifactPath(sessionId, { stamp = '' } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  const normalizedStamp = normalizeText(stamp) || formatArtifactTimestamp();
  return path.join(
    'memory',
    'context-db',
    'sessions',
    normalizedSessionId,
    'artifacts',
    `skill-candidate-patch-template-${normalizedStamp}.md`
  );
}

function resolveSkillCandidatePatchTemplateOutputPath({
  rootDir = '',
  sessionId = '',
  generatedAt = '',
  outputPath = '',
} = {}) {
  const normalizedRootDir = normalizeText(rootDir) || process.cwd();
  const normalizedOutputPath = normalizeText(outputPath);
  if (normalizedOutputPath) {
    const normalizedPath = path.normalize(normalizedOutputPath);
    if (path.isAbsolute(normalizedPath)) {
      return {
        artifactPath: toPosixPath(normalizedPath),
        artifactAbsPath: normalizedPath,
      };
    }
    return {
      artifactPath: toPosixPath(normalizedPath),
      artifactAbsPath: path.join(normalizedRootDir, normalizedPath),
    };
  }

  const artifactPath = buildSkillCandidatePatchTemplateArtifactPath(sessionId, {
    stamp: formatArtifactTimestamp(new Date(generatedAt)),
  });
  return {
    artifactPath: toPosixPath(artifactPath),
    artifactAbsPath: path.join(normalizedRootDir, artifactPath),
  };
}

async function persistSkillCandidatePatchTemplateArtifact({
  rootDir,
  state,
  skillCandidateLimit = DEFAULT_SKILL_CANDIDATE_LIMIT,
  draftId = '',
  outputPath = '',
} = {}) {
  const sessionId = normalizeText(state?.selection?.sessionId) || normalizeText(state?.session?.sessionId);
  if (!sessionId) return null;

  const generatedAt = new Date().toISOString();
  const resolvedOutputPath = resolveSkillCandidatePatchTemplateOutputPath({
    rootDir,
    sessionId,
    generatedAt,
    outputPath,
  });
  const content = formatSkillCandidatePatchTemplateDocument(state, {
    rootDir,
    limit: skillCandidateLimit,
    generatedAt,
    draftId,
  });

  await fs.mkdir(path.dirname(resolvedOutputPath.artifactAbsPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath.artifactAbsPath, `${content}\n`, 'utf8');

  return {
    artifactPath: resolvedOutputPath.artifactPath,
    generatedAt,
  };
}

function formatWatchdogStatusLine(state = {}) {
  const watchdog = state?.watchdog;
  if (!watchdog || typeof watchdog !== 'object') return '';
  const readiness = watchdog.readiness && typeof watchdog.readiness === 'object'
    ? watchdog.readiness
    : null;
  const readinessVerdict = normalizeText(readiness?.verdict);
  const readinessLabel = readinessVerdict ? ` readiness=${readinessVerdict}` : '';
  return `Watchdog: decision=${watchdog.decision}${readinessLabel} reason=${watchdog.reason}`;
}

export async function runTeamStatus(
  rawOptions = {},
  {
    rootDir,
    io = console,
    env = process.env,
    watchLoop = watchRenderLoop,
    nowFn = () => Date.now(),
  } = {}
) {
  const sessionId = normalizeText(rawOptions.sessionId || rawOptions.resumeSessionId);
  const provider = normalizeProvider(rawOptions.provider);
  const preset = normalizeHudPreset(rawOptions.preset || 'focused');
  let watch = rawOptions.watch === true;
  const fast = rawOptions.fast === true;
  const json = rawOptions.json === true;
  const includeWatchdog = rawOptions.watchdog === true;
  const watchCadence = resolveWatchCadence(rawOptions.intervalMs, { fallbackMs: 1000 });
  const intervalMs = watchCadence.renderIntervalMs;
  let fastWatchMinimal = fast && watch && !json && preset === 'minimal';
  let {
    showSkillCandidates,
    skillCandidateLimit,
    skillCandidateView,
    exportSkillCandidatePatchTemplate,
    draftId,
  } = resolveStatusSkillCandidateOptions({
    showSkillCandidates: rawOptions.showSkillCandidates === true,
    requestedSkillCandidateLimit: rawOptions.skillCandidateLimit,
    skillCandidateView: rawOptions.skillCandidateView,
    exportSkillCandidatePatchTemplate: rawOptions.exportSkillCandidatePatchTemplate === true,
    draftId: rawOptions.draftId,
    fastWatchMinimal,
  });
  if (watch && exportSkillCandidatePatchTemplate) {
    io.log('[warn] team status --watch is ignored when --export-skill-candidate-patch-template is set.');
    watch = false;
    fastWatchMinimal = false;
    ({
      showSkillCandidates,
      skillCandidateLimit,
      skillCandidateView,
      exportSkillCandidatePatchTemplate,
      draftId,
    } = resolveStatusSkillCandidateOptions({
      showSkillCandidates: rawOptions.showSkillCandidates === true,
      requestedSkillCandidateLimit: rawOptions.skillCandidateLimit,
      skillCandidateView: rawOptions.skillCandidateView,
      exportSkillCandidatePatchTemplate: rawOptions.exportSkillCandidatePatchTemplate === true,
      draftId: rawOptions.draftId,
      fastWatchMinimal,
    }));
  }
  const dataRefreshMs = fastWatchMinimal
    ? Math.max(intervalMs, FAST_WATCH_DATA_REFRESH_MS)
    : intervalMs;
  const dataRefreshLabel = watchCadence.adaptiveInterval
    ? fastWatchMinimal
      ? `auto(${dataRefreshMs}-${Math.max(dataRefreshMs, watchCadence.adaptiveInterval.maxIntervalMs)}ms)`
      : watchCadence.renderIntervalLabel
    : `${dataRefreshMs}ms`;
  const stalledThresholdMs = normalizeWatchStalledMs(env?.AIOS_WATCH_STALLED_MS, DEFAULT_WATCH_STALLED_MS);
  const stallTracker = watch
    ? createStatusWatchStallTracker({ thresholdMs: stalledThresholdMs, nowFn })
    : null;

  const renderOnce = async () => {
    const state = await readHudState({
      rootDir,
      sessionId,
      provider,
      fast: fastWatchMinimal,
      skillCandidateLimit,
      watchdog: includeWatchdog,
      nowMs: Number(nowFn()),
    });
    const filteredState = filterSkillCandidateState(state, { draftId });
    if (includeWatchdog && !filteredState.watchdog) {
      filteredState.watchdog = await buildTeamWatchdogState(
        { sessionId: filteredState.selection?.sessionId || sessionId, provider },
        { rootDir, nowFn }
      );
    }
    if (json) {
      if (exportSkillCandidatePatchTemplate) {
        io.log('[warn] team status --export-skill-candidate-patch-template is ignored when --json is set.');
      }
      io.log(JSON.stringify(filteredState, null, 2));
      return { exitCode: filteredState.selection?.sessionId ? 0 : 1 };
    }

    const hudText = renderHud(filteredState, {
      preset,
      watchMeta: watch
        ? buildWatchMeta(filteredState, {
          renderIntervalMs: intervalMs,
          renderIntervalLabel: watchCadence.renderIntervalLabel,
          dataRefreshMs,
          dataRefreshLabel,
          fast: fastWatchMinimal,
        })
        : null,
    }).trimEnd();
    const skillCandidateText = showSkillCandidates
      ? formatSkillCandidateDetails(filteredState, {
        limit: skillCandidateLimit,
        standalone: skillCandidateView === 'detail',
      })
      : '';

    const outputBlocks = skillCandidateView === 'detail'
      ? [skillCandidateText]
      : [hudText, skillCandidateText];
    if (includeWatchdog) {
      outputBlocks.push(formatWatchdogStatusLine(filteredState));
    }

    if (exportSkillCandidatePatchTemplate) {
      const artifact = await persistSkillCandidatePatchTemplateArtifact({
        rootDir,
        state: filteredState,
        skillCandidateLimit,
        draftId,
      });
      if (artifact?.artifactPath) {
        outputBlocks.push(`Skill candidate patch template artifact: ${artifact.artifactPath}`);
      } else {
        outputBlocks.push('Skill candidate patch template export skipped: no session selected.');
      }
    }

    io.log(outputBlocks.filter(Boolean).join('\n') + '\n');
    return { exitCode: filteredState.selection?.sessionId ? 0 : 1 };
  };

  if (!watch || json) {
    if (watch && json) {
      io.log('[warn] team status --watch is ignored when --json is set.');
    }
    return await renderOnce();
  }

  const readAndRender = async () => {
    const rawNow = Number(nowFn());
    const nowMs = Number.isFinite(rawNow) ? rawNow : Date.now();
    const state = await readHudState({
      rootDir,
      sessionId,
      provider,
      fast: fastWatchMinimal,
      skillCandidateLimit,
      watchdog: includeWatchdog,
      nowMs,
    });
    const filteredState = filterSkillCandidateState(state, { draftId });
    const stalledSignal = stallTracker?.observe(filteredState, { nowMs }) || null;
    const watchMeta = {
      ...buildWatchMeta(filteredState, {
        renderIntervalMs: intervalMs,
        renderIntervalLabel: watchCadence.renderIntervalLabel,
        dataRefreshMs,
        dataRefreshLabel,
        fast: fastWatchMinimal,
        nowMs,
      }),
      ...(stalledSignal ? stalledSignal : {}),
    };
    const hudText = renderHud(filteredState, {
      preset,
      watchMeta,
    }).trimEnd();
    const skillCandidateText = showSkillCandidates
      ? formatSkillCandidateDetails(filteredState, {
        limit: skillCandidateLimit,
        standalone: skillCandidateView === 'detail',
      })
      : '';
    const outputBlocks = skillCandidateView === 'detail'
      ? [skillCandidateText]
      : [hudText, skillCandidateText];
    if (includeWatchdog) {
      outputBlocks.push(formatWatchdogStatusLine(filteredState));
    }
    return outputBlocks.filter(Boolean).join('\n') + '\n';
  };

  const watchRender = fastWatchMinimal
    ? createThrottledWatchRender(readAndRender, {
      minIntervalMs: dataRefreshMs,
    })
    : readAndRender;

  await watchLoop(watchRender, {
    intervalMs,
    adaptiveInterval: watchCadence.adaptiveInterval,
    env,
  });

  return { exitCode: process.exitCode ?? 0 };
}

function formatHistoryLine(record) {
  const updatedAt = normalizeText(record.updatedAt);
  const status = normalizeText(record.status);
  const sessionId = normalizeText(record.sessionId);
  const goal = normalizeText(record.goal);
  const dispatch = record.dispatch;
  const dispatchLabel = dispatch
    ? dispatch.ok === true
      ? `dispatch=ok jobs=${dispatch.jobCount}`
      : `dispatch=blocked blocked=${dispatch.blockedJobs} jobs=${dispatch.jobCount}`
    : 'dispatch=none';
  const qualityGate = record.qualityGate && typeof record.qualityGate === 'object'
    ? record.qualityGate
    : null;
  const qualityOutcome = normalizeQualityOutcome(qualityGate?.outcome);
  const qualityCategory = normalizeText(qualityGate?.failureCategory) || normalizeText(qualityGate?.categoryRef);
  const qualityLabel = qualityOutcome
    ? (qualityCategory ? `quality=${qualityOutcome}(${qualityCategory})` : `quality=${qualityOutcome}`)
    : '';
  const hindsight = record.dispatchHindsight && typeof record.dispatchHindsight === 'object'
    ? record.dispatchHindsight
    : null;
  const hindsightPairs = normalizeCounter(hindsight?.pairsAnalyzed);
  const hindsightRepeatBlocked = normalizeCounter(hindsight?.repeatedBlockedTurns);
  const hindsightRegressions = normalizeCounter(hindsight?.regressions);
  const hindsightTopFailure = normalizeText(hindsight?.topFailureClass);
  const hindsightTopJob = normalizeText(hindsight?.topRepeatedJobId);
  const hindsightLabel = hindsightPairs > 0
    ? [
      `hindsight pairs=${hindsightPairs}`,
      hindsightRepeatBlocked > 0 ? `repeatBlocked=${hindsightRepeatBlocked}` : '',
      hindsightRegressions > 0 ? `regressions=${hindsightRegressions}` : '',
      hindsightTopFailure ? `topFailure=${hindsightTopFailure}` : '',
      hindsightTopJob ? `topJob=${hindsightTopJob}` : '',
    ].filter(Boolean).join(' ')
    : '';
  const fixHint = record.dispatchFixHint && typeof record.dispatchFixHint === 'object'
    ? record.dispatchFixHint
    : null;
  const fixHintLabel = normalizeText(fixHint?.targetId) ? `fixHint=${normalizeText(fixHint.targetId)}` : '';
  const skillCandidate = record.skillCandidate && typeof record.skillCandidate === 'object'
    ? record.skillCandidate
    : null;
  const skillId = normalizeText(skillCandidate?.skillId);
  const skillFailure = normalizeText(skillCandidate?.failureClass) || normalizeText(skillCandidate?.scope);
  const skillLessons = normalizeCounter(skillCandidate?.lessonCount);
  const skillCandidateLabel = skillId
    ? `skillCandidate=${skillId}${skillFailure ? `/${skillFailure}` : ''}${skillLessons > 0 ? `#${skillLessons}` : ''}`
    : '';
  const dispatchInsights = record.dispatchInsights && typeof record.dispatchInsights === 'object'
    ? record.dispatchInsights
    : null;
  const dispatchInsightsStatus = normalizeText(dispatchInsights?.status);
  const dispatchInsightsScore = normalizeCounter(dispatchInsights?.score);
  const dispatchInsightsTopSignalId = normalizeText(dispatchInsights?.topSignalId);
  const dispatchInsightsTopSignalSeverity = normalizeText(dispatchInsights?.topSignalSeverity);
  const dispatchInsightsTopActionId = normalizeText(dispatchInsights?.topActionId);
  const dispatchInsightsLabel = dispatchInsightsStatus
    ? (dispatchInsightsStatus === 'clear'
      ? `insights=clear(${dispatchInsightsScore})`
      : `insights=${dispatchInsightsStatus}(${dispatchInsightsScore})${dispatchInsightsTopSignalId ? ` signal=${dispatchInsightsTopSignalId}/${dispatchInsightsTopSignalSeverity || 'info'}` : ''}${dispatchInsightsTopActionId ? ` action=${dispatchInsightsTopActionId}` : ''}`)
    : '';

  const bits = [
    updatedAt ? `[${updatedAt}]` : '',
    sessionId ? `session=${sessionId}` : '',
    status ? `status=${status}` : '',
    dispatchLabel,
    dispatchInsightsLabel,
    qualityLabel,
    hindsightLabel,
    fixHintLabel,
    skillCandidateLabel,
    goal ? `goal="${goal.length > 80 ? goal.slice(0, 79) + '…' : goal}"` : '',
  ].filter(Boolean);
  return `- ${bits.join(' | ')}`;
}

function mapDispatchInsightsRecord(dispatchInsights = null) {
  if (!dispatchInsights || typeof dispatchInsights !== 'object') {
    return null;
  }

  const signals = Array.isArray(dispatchInsights.signals) ? dispatchInsights.signals : [];
  const suggestedActions = Array.isArray(dispatchInsights.suggestedActions) ? dispatchInsights.suggestedActions : [];
  const topSignal = signals.length > 0 ? signals[0] : null;
  const topAction = suggestedActions.length > 0 ? suggestedActions[0] : null;

  return {
    status: normalizeText(dispatchInsights.status) || null,
    score: normalizeCounter(dispatchInsights.score),
    topSignalId: normalizeText(topSignal?.id) || null,
    topSignalSeverity: normalizeText(topSignal?.severity) || null,
    signalCount: signals.length,
    topActionId: normalizeText(topAction?.id) || null,
  };
}

function summarizeHistory(records = []) {
  const total = Array.isArray(records) ? records.length : 0;
  let dispatchBlocked = 0;
  let hindsightUnstable = 0;
  const topFailureCounts = new Map();
  const topQualityFailureCounts = new Map();
  const fixHintCounts = new Map();
  const topJobCounts = new Map();
  const topSkillCandidateCounts = new Map();
  const topInsightSignalCounts = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const dispatch = record?.dispatch && typeof record.dispatch === 'object' ? record.dispatch : null;
    if (dispatch && dispatch.ok === false) {
      dispatchBlocked += 1;
    }

    const hindsight = record?.dispatchHindsight && typeof record.dispatchHindsight === 'object'
      ? record.dispatchHindsight
      : null;
    const pairs = normalizeCounter(hindsight?.pairsAnalyzed);
    const repeatBlocked = normalizeCounter(hindsight?.repeatedBlockedTurns);
    const regressions = normalizeCounter(hindsight?.regressions);
    if (pairs > 0 && (repeatBlocked > 0 || regressions > 0)) {
      hindsightUnstable += 1;
    }

    const topFailure = normalizeText(hindsight?.topFailureClass);
    if (topFailure) {
      topFailureCounts.set(topFailure, (topFailureCounts.get(topFailure) || 0) + 1);
    }

    const topJob = normalizeText(hindsight?.topRepeatedJobId);
    if (topJob) {
      topJobCounts.set(topJob, (topJobCounts.get(topJob) || 0) + 1);
    }

    const fixHint = record?.dispatchFixHint && typeof record.dispatchFixHint === 'object'
      ? record.dispatchFixHint
      : null;
    const fixHintId = normalizeText(fixHint?.targetId);
    if (fixHintId) {
      fixHintCounts.set(fixHintId, (fixHintCounts.get(fixHintId) || 0) + 1);
    }

    const skillCandidate = record?.skillCandidate && typeof record.skillCandidate === 'object'
      ? record.skillCandidate
      : null;
    const skillId = normalizeText(skillCandidate?.skillId);
    if (skillId) {
      const failureClass = normalizeText(skillCandidate?.failureClass);
      const scope = normalizeText(skillCandidate?.scope);
      const key = `${skillId}::${failureClass || scope || ''}`;
      const existing = topSkillCandidateCounts.get(key) || {
        skillId,
        failureClass: failureClass || null,
        scope: scope || null,
        count: 0,
      };
      existing.count += 1;
      topSkillCandidateCounts.set(key, existing);
    }

    const dispatchInsights = record?.dispatchInsights && typeof record.dispatchInsights === 'object'
      ? record.dispatchInsights
      : null;
    const topInsightSignalId = normalizeText(dispatchInsights?.topSignalId);
    if (topInsightSignalId) {
      topInsightSignalCounts.set(topInsightSignalId, (topInsightSignalCounts.get(topInsightSignalId) || 0) + 1);
    }

    const qualityGate = record?.qualityGate && typeof record.qualityGate === 'object'
      ? record.qualityGate
      : null;
    const qualityOutcome = normalizeQualityOutcome(qualityGate?.outcome);
    const qualityCategory = normalizeText(qualityGate?.failureCategory);
    if (qualityOutcome === 'failed' && qualityCategory) {
      topQualityFailureCounts.set(qualityCategory, (topQualityFailureCounts.get(qualityCategory) || 0) + 1);
    }
  }

  const topFailures = Array.from(topFailureCounts.entries())
    .map(([failureClass, count]) => ({ failureClass, count }))
    .sort((left, right) => right.count - left.count || left.failureClass.localeCompare(right.failureClass))
    .slice(0, 5);
  const topFixHints = Array.from(fixHintCounts.entries())
    .map(([targetId, count]) => ({ targetId, count }))
    .sort((left, right) => right.count - left.count || left.targetId.localeCompare(right.targetId))
    .slice(0, 5);
  const topJobs = Array.from(topJobCounts.entries())
    .map(([jobId, count]) => ({ jobId, count }))
    .sort((left, right) => right.count - left.count || left.jobId.localeCompare(right.jobId))
    .slice(0, 5);
  const topQualityFailures = Array.from(topQualityFailureCounts.entries())
    .map(([failureCategory, count]) => ({ failureCategory, count }))
    .sort((left, right) => right.count - left.count || left.failureCategory.localeCompare(right.failureCategory))
    .slice(0, 5);
  const topSkillCandidates = Array.from(topSkillCandidateCounts.values())
    .sort((left, right) => right.count - left.count
      || left.skillId.localeCompare(right.skillId)
      || String(left.failureClass || left.scope || '').localeCompare(String(right.failureClass || right.scope || '')))
    .slice(0, 5);
  const topInsightSignals = Array.from(topInsightSignalCounts.entries())
    .map(([signalId, count]) => ({ signalId, count }))
    .sort((left, right) => right.count - left.count || left.signalId.localeCompare(right.signalId))
    .slice(0, 5);

  return {
    total,
    dispatchBlocked,
    hindsightUnstable,
    topFailures,
    topQualityFailures,
    topFixHints,
    topJobs,
    topSkillCandidates,
    topInsightSignals,
  };
}

export async function runTeamHistory(rawOptions = {}, { rootDir, io = console } = {}) {
  const provider = normalizeProvider(rawOptions.provider);
  const limit = Number.isFinite(rawOptions.limit) ? Math.max(1, Math.floor(rawOptions.limit)) : Number.parseInt(String(rawOptions.limit ?? '').trim(), 10);
  const resolvedLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
  const json = rawOptions.json === true;
  const concurrency = normalizeConcurrency(rawOptions.concurrency, 4);
  const fast = rawOptions.fast === true;
  const qualityFailedOnly = rawOptions.qualityFailedOnly === true;
  const qualityCategory = normalizeText(rawOptions.qualityCategory);
  const qualityCategoryFilter = normalizeQualityCategory(qualityCategory);
  const qualityCategoryPrefix = normalizeText(rawOptions.qualityCategoryPrefix);
  const qualityCategoryPrefixFilters = normalizeQualityCategoryPrefixes(
    Array.isArray(rawOptions.qualityCategoryPrefixes)
      ? rawOptions.qualityCategoryPrefixes
      : qualityCategoryPrefix
  );
  const qualityCategoryPrefixMode = normalizeQualityCategoryPrefixMode(rawOptions.qualityCategoryPrefixMode);
  const qualityCategoryPrefixEnabled = qualityCategoryPrefixFilters.length > 0;
  const draftIdFilter = normalizeText(rawOptions.draftId);
  const sinceIso = normalizeText(rawOptions.since);
  const statusFilter = normalizeText(rawOptions.status);

  const agent = provider === 'claude'
    ? 'claude-code'
    : provider === 'gemini'
      ? 'gemini-cli'
      : 'codex-cli';

  const scanLimit = (sinceIso || statusFilter || qualityFailedOnly || qualityCategoryFilter || qualityCategoryPrefixEnabled || draftIdFilter)
    ? Math.max(resolvedLimit, resolvedLimit * 8)
    : resolvedLimit;
  const sessions = await listContextDbSessions(rootDir, { agent, limit: scanLimit });
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;

  const filteredSessions = sessions.filter((meta) => {
    if (statusFilter && normalizeText(meta?.status) !== statusFilter) return false;
    if (sinceIso) {
      const updatedAt = normalizeText(meta?.updatedAt) || normalizeText(meta?.createdAt);
      const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
      if (!Number.isFinite(updatedMs) || !Number.isFinite(sinceMs) || updatedMs < sinceMs) return false;
    }
    return true;
  });
  const targetSessions = (qualityFailedOnly || qualityCategoryFilter || qualityCategoryPrefixEnabled)
    ? filteredSessions
    : filteredSessions.slice(0, resolvedLimit);

  const records = await mapWithConcurrency(targetSessions, concurrency, async (meta) => {
    const sessionId = normalizeText(meta.sessionId);
    const state = await readHudDispatchSummary({ rootDir, sessionId, provider, meta, includeHindsight: !fast });
    const hindsight = state.dispatchHindsight && typeof state.dispatchHindsight === 'object'
      ? state.dispatchHindsight
      : null;
    const topFailure = Array.isArray(hindsight?.topRepeatedFailureClasses) && hindsight.topRepeatedFailureClasses.length > 0
      ? hindsight.topRepeatedFailureClasses[0]
      : null;
    const topJob = Array.isArray(hindsight?.topRepeatedJobs) && hindsight.topRepeatedJobs.length > 0
      ? hindsight.topRepeatedJobs[0]
      : null;
    const fixHint = state.dispatchFixHint && typeof state.dispatchFixHint === 'object'
      ? state.dispatchFixHint
      : null;
    const qualityGate = state.latestQualityGate && typeof state.latestQualityGate === 'object'
      ? state.latestQualityGate
      : null;
    const skillCandidate = state.latestSkillCandidate && typeof state.latestSkillCandidate === 'object'
      ? state.latestSkillCandidate
      : null;
    return {
      sessionId,
      updatedAt: normalizeText(meta.updatedAt) || normalizeText(meta.createdAt),
      status: normalizeText(meta.status),
      goal: normalizeText(meta.goal),
      dispatchInsights: mapDispatchInsightsRecord(state.latestDispatch?.dispatchInsights),
      dispatch: state.latestDispatch
        ? {
          ok: state.latestDispatch.ok === true,
          jobCount: Number.isFinite(state.latestDispatch.jobCount) ? state.latestDispatch.jobCount : 0,
          blockedJobs: Number.isFinite(state.latestDispatch.blockedJobs) ? state.latestDispatch.blockedJobs : 0,
          artifactPath: normalizeText(state.latestDispatch.artifactPath),
        }
        : null,
      dispatchHindsight: hindsight
        ? {
          pairsAnalyzed: normalizeCounter(hindsight.pairsAnalyzed),
          comparedJobs: normalizeCounter(hindsight.comparedJobs),
          resolvedBlockedTurns: normalizeCounter(hindsight.resolvedBlockedTurns),
          repeatedBlockedTurns: normalizeCounter(hindsight.repeatedBlockedTurns),
          regressions: normalizeCounter(hindsight.regressions),
          topFailureClass: normalizeText(topFailure?.failureClass) || null,
          topRepeatedJobId: normalizeText(topJob?.jobId) || null,
        }
        : null,
      qualityGate: qualityGate
        ? {
          outcome: normalizeText(qualityGate.outcome) || null,
          categoryRef: normalizeText(qualityGate.categoryRef) || null,
          failureCategory: normalizeText(qualityGate.failureCategory) || null,
        }
        : null,
      dispatchFixHint: fixHint
        ? {
          targetId: normalizeText(fixHint.targetId) || null,
          evidence: normalizeText(fixHint.evidence) || null,
          nextCommand: normalizeText(fixHint.nextCommand) || null,
          nextArtifact: normalizeText(fixHint.nextArtifact) || null,
        }
        : null,
      skillCandidate: skillCandidate
        ? {
          skillId: normalizeText(skillCandidate.skillId) || null,
          scope: normalizeText(skillCandidate.scope) || null,
          failureClass: normalizeText(skillCandidate.failureClass) || null,
          lessonKind: normalizeText(skillCandidate.lessonKind) || null,
          lessonCount: normalizeCounter(skillCandidate.lessonCount),
          reviewMode: normalizeText(skillCandidate.reviewMode) || null,
          reviewStatus: normalizeText(skillCandidate.reviewStatus) || null,
          sourceDraftTargetId: normalizeText(skillCandidate.sourceDraftTargetId) || null,
          artifactPath: normalizeText(skillCandidate.artifactPath) || null,
        }
        : null,
    };
  });

  const filteredByQualityFailed = qualityFailedOnly
    ? records.filter((record) => hasFailedQualityGate(record))
    : records;
  const filteredByCategory = qualityCategoryFilter
    ? filteredByQualityFailed.filter((record) => matchesQualityCategory(record, qualityCategoryFilter))
    : filteredByQualityFailed;
  const filteredByCategoryPrefix = qualityCategoryPrefixEnabled
    ? filteredByCategory.filter((record) => matchesQualityCategoryPrefix(record, qualityCategoryPrefixFilters, qualityCategoryPrefixMode))
    : filteredByCategory;
  const filteredByDraftId = draftIdFilter
    ? filteredByCategoryPrefix.filter((record) => normalizeText(record?.skillCandidate?.sourceDraftTargetId) === draftIdFilter)
    : filteredByCategoryPrefix;
  const selectedRecords = (qualityFailedOnly || qualityCategoryFilter || qualityCategoryPrefixEnabled || draftIdFilter)
    ? filteredByDraftId.slice(0, resolvedLimit)
    : filteredByDraftId;
  const summary = summarizeHistory(selectedRecords);
  if (json) {
    io.log(JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      provider,
      agent,
      limit: resolvedLimit,
      fast,
      qualityFailedOnly,
      qualityCategory: qualityCategory || null,
      qualityCategoryPrefix: qualityCategoryPrefix || null,
      qualityCategoryPrefixes: qualityCategoryPrefixEnabled ? qualityCategoryPrefixFilters : null,
      qualityCategoryPrefixMode,
      draftId: draftIdFilter || null,
      since: sinceIso || null,
      status: statusFilter || null,
      summary,
      records: selectedRecords,
    }, null, 2));
    return { exitCode: 0 };
  }

  const filterLabels = [];
  if (qualityFailedOnly) filterLabels.push('quality-gate failed only');
  if (qualityCategoryFilter) filterLabels.push(`quality-category=${qualityCategory}`);
  if (qualityCategoryPrefixEnabled) filterLabels.push(`quality-category-prefix=${qualityCategoryPrefixFilters.join(',')}`);
  if (qualityCategoryPrefixEnabled) filterLabels.push(`quality-category-prefix-mode=${qualityCategoryPrefixMode}`);
  if (draftIdFilter) filterLabels.push(`draft-id=${draftIdFilter}`);

  const lines = [
    `AIOS Team History (provider=${provider} agent=${agent})`,
    filterLabels.length > 0 ? `Filter: ${filterLabels.join('; ')}` : '',
    `Summary: sessions=${summary.total} dispatchBlocked=${summary.dispatchBlocked} hindsightUnstable=${summary.hindsightUnstable} topFailures=${summary.topFailures.map((item) => `${item.failureClass}=${item.count}`).join(', ') || 'none'} topQualityFailures=${summary.topQualityFailures.map((item) => `${item.failureCategory}=${item.count}`).join(', ') || 'none'} topFixHints=${summary.topFixHints.map((item) => `${item.targetId}=${item.count}`).join(', ') || 'none'} topJobs=${summary.topJobs.map((item) => `${item.jobId}=${item.count}`).join(', ') || 'none'} topSkillCandidates=${summary.topSkillCandidates.map((item) => `${item.skillId}${item.failureClass ? `/${item.failureClass}` : item.scope ? `/${item.scope}` : ''}=${item.count}`).join(', ') || 'none'} topInsightSignals=${summary.topInsightSignals.map((item) => `${item.signalId}=${item.count}`).join(', ') || 'none'}`,
    ...(selectedRecords.length > 0 ? selectedRecords.map((record) => formatHistoryLine(record)) : ['- (none)']),
  ];
  io.log(lines.join('\n') + '\n');
  return { exitCode: 0 };
}

function collectSkillCandidateItems(state = null, limit = DEFAULT_SKILL_CANDIDATE_LIMIT) {
  const resolvedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.floor(limit))
    : DEFAULT_SKILL_CANDIDATE_LIMIT;
  const recent = Array.isArray(state?.recentSkillCandidates)
    ? state.recentSkillCandidates
    : [];
  if (recent.length > 0) {
    return recent.slice(0, resolvedLimit);
  }
  const latest = state?.latestSkillCandidate && typeof state.latestSkillCandidate === 'object'
    ? [state.latestSkillCandidate]
    : [];
  return latest.slice(0, resolvedLimit);
}

function mapSkillCandidateRecord(candidate = null) {
  return {
    skillId: normalizeText(candidate?.skillId) || null,
    scope: normalizeText(candidate?.scope) || null,
    failureClass: normalizeText(candidate?.failureClass) || null,
    lessonKind: normalizeText(candidate?.lessonKind) || null,
    lessonCount: normalizeCounter(candidate?.lessonCount),
    reviewMode: normalizeText(candidate?.reviewMode) || null,
    reviewStatus: normalizeText(candidate?.reviewStatus) || null,
    sourceDraftTargetId: normalizeText(candidate?.sourceDraftTargetId) || null,
    sourceArtifactPath: normalizeText(candidate?.sourceArtifactPath) || null,
    artifactPath: normalizeText(candidate?.artifactPath) || null,
    patchHint: normalizeText(candidate?.patchHint) || null,
  };
}

export async function runTeamSkillCandidatesList(rawOptions = {}, { rootDir, io = console } = {}) {
  const provider = normalizeProvider(rawOptions.provider);
  const sessionId = normalizeText(rawOptions.sessionId || rawOptions.resumeSessionId);
  const json = rawOptions.json === true;
  const draftId = normalizeText(rawOptions.draftId);
  const { skillCandidateLimit } = resolveStatusSkillCandidateOptions({
    showSkillCandidates: true,
    requestedSkillCandidateLimit: rawOptions.skillCandidateLimit,
    skillCandidateView: 'detail',
    exportSkillCandidatePatchTemplate: false,
    draftId,
    fastWatchMinimal: false,
  });

  const state = await readHudState({
    rootDir,
    sessionId,
    provider,
    fast: false,
    skillCandidateLimit,
  });
  const filteredState = filterSkillCandidateState(state, { draftId });
  const resolvedSessionId = normalizeText(filteredState?.selection?.sessionId) || normalizeText(filteredState?.session?.sessionId);
  const candidates = collectSkillCandidateItems(filteredState, skillCandidateLimit).map((candidate) => mapSkillCandidateRecord(candidate));
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider,
    sessionId: resolvedSessionId || null,
    draftId: draftId || null,
    skillCandidateLimit,
    candidateCount: candidates.length,
    candidates,
  };

  if (json) {
    io.log(JSON.stringify(result, null, 2));
  } else {
    io.log(`${formatSkillCandidateDetails(filteredState, {
      limit: skillCandidateLimit,
      standalone: true,
      draftId,
    })}\n`);
  }

  return { exitCode: resolvedSessionId ? 0 : 1, result };
}

export async function runTeamSkillCandidatesExport(rawOptions = {}, { rootDir, io = console } = {}) {
  const provider = normalizeProvider(rawOptions.provider);
  const sessionId = normalizeText(rawOptions.sessionId || rawOptions.resumeSessionId);
  const json = rawOptions.json === true;
  const draftId = normalizeText(rawOptions.draftId);
  const outputPath = normalizeText(rawOptions.outputPath);
  const { skillCandidateLimit } = resolveStatusSkillCandidateOptions({
    showSkillCandidates: true,
    requestedSkillCandidateLimit: rawOptions.skillCandidateLimit,
    skillCandidateView: 'detail',
    exportSkillCandidatePatchTemplate: true,
    draftId,
    fastWatchMinimal: false,
  });

  const state = await readHudState({
    rootDir,
    sessionId,
    provider,
    fast: false,
    skillCandidateLimit,
  });
  const filteredState = filterSkillCandidateState(state, { draftId });
  const artifact = await persistSkillCandidatePatchTemplateArtifact({
    rootDir,
    state: filteredState,
    skillCandidateLimit,
    draftId,
    outputPath,
  });

  const candidates = collectSkillCandidateItems(filteredState, skillCandidateLimit);
  const candidateCount = candidates.length;
  const resolvedSessionId = normalizeText(filteredState?.selection?.sessionId) || normalizeText(filteredState?.session?.sessionId);
  const exported = Boolean(artifact?.artifactPath);
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider,
    sessionId: resolvedSessionId || null,
    draftId: draftId || null,
    skillCandidateLimit,
    candidateCount,
    exported,
    requestedOutputPath: outputPath || null,
    artifactPath: artifact?.artifactPath || null,
    message: exported
      ? `Skill candidate patch template artifact: ${artifact.artifactPath}`
      : 'Skill candidate patch template export skipped: no session selected.',
  };

  if (json) {
    io.log(JSON.stringify(result, null, 2));
  } else {
    io.log(result.message);
  }

  return { exitCode: exported ? 0 : 1, result };
}
