/* 中文注释：signals 模块只从 dispatch/learn-eval 中提取风险信号，不做最终 gate 决策。 */
import {
  BOUNDARY_PATTERNS,
  CLARITY_NEEDS_INPUT_FAILURE_CATEGORY,
  MAX_SIGNAL_SAMPLES,
  SENSITIVE_COMMAND_PATTERNS,
} from './constants.mjs';
import { normalizeStringArray, normalizeText } from './shared.mjs';

export function collectFilesTouched(dispatchRun = null) {
  const touched = new Set();
  for (const jobRun of Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : []) {
    const files = Array.isArray(jobRun?.output?.payload?.filesTouched) ? jobRun.output.payload.filesTouched : [];
    for (const filePath of files) {
      const normalized = normalizeText(filePath);
      if (normalized) touched.add(normalized);
    }
  }
  return [...touched];
}

export function normalizeSnippet(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function clipSnippet(value, maxLength = 160) {
  const text = normalizeSnippet(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1))}...`;
}

export function collectPayloadSnippets(dispatchRun = null) {
  const snippets = [];
  for (const jobRun of Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : []) {
    const payload = jobRun?.output?.payload;
    const candidates = [
      payload?.taskTitle,
      payload?.contextSummary,
      ...(Array.isArray(payload?.findings) ? payload.findings : []),
      ...(Array.isArray(payload?.openQuestions) ? payload.openQuestions : []),
      ...(Array.isArray(payload?.recommendations) ? payload.recommendations : []),
      jobRun?.output?.error,
    ];
    for (const item of candidates) {
      const normalized = normalizeSnippet(item);
      if (normalized) {
        snippets.push(normalized);
      }
    }
  }
  return snippets;
}

export function collectBoundarySnippets(dispatchRun = null) {
  const snippets = [];
  for (const jobRun of Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : []) {
    const payload = jobRun?.output?.payload;
    const candidates = [
      payload?.taskTitle,
      ...(Array.isArray(payload?.openQuestions) ? payload.openQuestions : []),
      jobRun?.output?.error,
    ];
    for (const item of candidates) {
      const normalized = normalizeSnippet(item);
      if (normalized) {
        snippets.push(normalized);
      }
    }
  }
  return snippets;
}

export function collectDispatchTurnIds(dispatchRun = null) {
  return normalizeStringArray(
    (Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : []).map((jobRun) => jobRun?.turnId)
  );
}

export function collectDispatchWorkItemRefs(dispatchRun = null) {
  const refs = [];
  for (const jobRun of Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : []) {
    const items = Array.isArray(jobRun?.workItemRefs) ? jobRun.workItemRefs : [];
    refs.push(...items);
  }
  return normalizeStringArray(refs);
}

export function getFailureCategoryCount(learnEvalReport = null, category = '') {
  const target = normalizeText(category).toLowerCase();
  if (!target) {
    return 0;
  }
  const failureTop = Array.isArray(learnEvalReport?.signals?.failures?.top) ? learnEvalReport.signals.failures.top : [];
  for (const item of failureTop) {
    const failureCategory = normalizeText(item?.category).toLowerCase();
    if (failureCategory !== target) {
      continue;
    }
    const count = Number(item?.count);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  }
  return 0;
}

export function resolveBlockedCheckpointMetrics(learnEvalReport = null) {
  const blockedCheckpointsTotal = Number(learnEvalReport?.status?.counts?.blocked || 0);
  const clarityExcludedRaw = getFailureCategoryCount(learnEvalReport, CLARITY_NEEDS_INPUT_FAILURE_CATEGORY);
  const blockedCheckpointsExcluded = Math.max(0, Math.min(blockedCheckpointsTotal, clarityExcludedRaw));
  const blockedCheckpoints = Math.max(0, blockedCheckpointsTotal - blockedCheckpointsExcluded);
  return {
    blockedCheckpoints,
    blockedCheckpointsTotal,
    blockedCheckpointsExcluded,
  };
}

export function collectPatternSignals(snippets = [], patterns = []) {
  const signals = [];
  const seen = new Set();
  for (const snippet of snippets) {
    for (const descriptor of patterns) {
      if (!descriptor.pattern.test(snippet)) {
        continue;
      }
      if (seen.has(descriptor.id)) {
        continue;
      }
      seen.add(descriptor.id);
      signals.push({
        id: descriptor.id,
        label: descriptor.label,
        sample: clipSnippet(snippet),
      });
      if (signals.length >= MAX_SIGNAL_SAMPLES) {
        return signals;
      }
    }
  }
  return signals;
}

export function isLikelyExternalWritePath(filePath = '') {
  const value = normalizeText(filePath).replace(/\\/g, '/');
  if (!value) return false;
  if (/^[A-Za-z]:\//.test(value)) return true;
  if (value.startsWith('/') || value.startsWith('~')) return true;
  if (value.startsWith('../') || value.includes('/../')) return true;
  return false;
}

export function collectExternalWriteSignals(filesTouchedList = []) {
  const signals = [];
  for (const filePath of filesTouchedList) {
    if (!isLikelyExternalWritePath(filePath)) {
      continue;
    }
    signals.push({
      id: 'path-outside-repo',
      label: 'outside-repo write target',
      sample: clipSnippet(filePath),
    });
    if (signals.length >= MAX_SIGNAL_SAMPLES) {
      break;
    }
  }
  return signals;
}

export function collectRiskSignals({ dispatchRun, filesTouchedList }) {
  const payloadSnippets = collectPayloadSnippets(dispatchRun);
  const boundarySnippets = collectBoundarySnippets(dispatchRun);
  const sensitiveCommandSignals = collectPatternSignals(payloadSnippets, SENSITIVE_COMMAND_PATTERNS);
  const externalWriteSignals = collectExternalWriteSignals(filesTouchedList);
  const boundaryCrossingSignals = collectPatternSignals(boundarySnippets, BOUNDARY_PATTERNS);
  return {
    payloadSnippets,
    boundarySnippets,
    sensitiveCommandSignals,
    externalWriteSignals,
    boundaryCrossingSignals,
  };
}
