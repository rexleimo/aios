// 纯函数：生成稳定哈希，供可重复的决策采样和证据打分使用。
// 注意：`export ... from` 只对外转发绑定，**不会**把名字引入本模块作用域。
// 本文件下文要直接调用 normalizeText，所以必须 import 后再 export（2026-09-21 修复：
// 之前只写了 `export { computeHash, normalizeText } from ...`，导致 normalizeText
// 在本文件内是未定义引用，凡走 executor 证据路径的调用都抛 ReferenceError。
import { computeHash, normalizeText } from '../../../../src/shared/normalize.mjs';

export { computeHash, normalizeText };

// 纯函数：只保留任务允许的执行器，避免上游传入非法选择。
export function resolveRequestedExecutor({ task, selectedExecutor }) {
  const normalized = typeof selectedExecutor === 'string' ? selectedExecutor.trim() : '';
  if (!normalized) {
    return null;
  }
  return task.available_executors.includes(normalized) ? normalized : null;
}

const DECISION_BLUEPRINT_BY_TYPE = Object.freeze({
  dispatch: 'feature',
  retry: 'bugfix',
  stop: 'refactor',
  handoff: 'security',
  preflight: 'bugfix',
});

// 纯函数：去重并过滤空字符串，供状态摘要和事件字段归一化复用。
export function toUniqueStrings(values = []) {
  const seen = new Set();
  const unique = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

export function summarizeDispatchRun(dispatchRun = {}) {
  const jobRuns = Array.isArray(dispatchRun.jobRuns) ? dispatchRun.jobRuns : [];
  let blockedCount = 0;
  let completedCount = 0;
  const statuses = [];
  for (const jobRun of jobRuns) {
    const status = String(jobRun?.status || '').trim().toLowerCase();
    if (!status) continue;
    statuses.push(status);
    if (status === 'blocked' || status === 'failed' || status === 'error') {
      blockedCount += 1;
    }
    if (status === 'completed' || status === 'simulated' || status === 'success') {
      completedCount += 1;
    }
  }
  return {
    jobCount: jobRuns.length,
    blockedCount,
    completedCount,
    jobStatuses: toUniqueStrings(statuses),
  };
}

export function mapDecisionToBlueprint(decisionType) {
  const normalized = String(decisionType || '').trim().toLowerCase();
  return DECISION_BLUEPRINT_BY_TYPE[normalized] || 'feature';
}

export function normalizeExecutionMode(mode = 'dry-run') {
  const normalized = String(mode || 'dry-run').trim().toLowerCase();
  if (normalized !== 'dry-run' && normalized !== 'live') {
    return 'dry-run';
  }
  return normalized;
}

export function resolveExecutionModePlan({
  executionMode = 'dry-run',
  fallbackExecutionMode = 'dry-run',
  fallbackOnMissingDispatchRun = true,
} = {}) {
  const primary = normalizeExecutionMode(executionMode);
  if (!fallbackOnMissingDispatchRun) {
    return [primary];
  }
  const fallback = normalizeExecutionMode(fallbackExecutionMode);
  if (fallback === primary) {
    return [primary];
  }
  return [primary, fallback];
}

export function buildRealOrchestrateOptions({
  task,
  checkpointId,
  attempt,
  mode,
  dispatchMode = 'local',
  executionMode = 'dry-run',
  phaseExecutor = '',
  sessionId = '',
}) {
  const contextSummary = [
    `checkpoint=${checkpointId}`,
    `decision=${task.decision_type}`,
    `mode=${mode}`,
    `attempt=${attempt}`,
    `snapshot=${task.context_snapshot_id}`,
  ].join(' | ');

  return {
    blueprint: mapDecisionToBlueprint(task.decision_type),
    taskTitle: `RL ${task.task_id}`,
    contextSummary,
    dispatchMode,
    executionMode,
    ...(normalizeText(phaseExecutor) ? { phaseExecutor: normalizeText(phaseExecutor) } : {}),
    preflightMode: task.decision_type === 'preflight' ? 'auto' : 'none',
    format: 'json',
    ...(sessionId ? { sessionId } : {}),
  };
}

export function createSilentIo() {
  return {
    log() {},
    warn() {},
    error() {},
  };
}

export function resolveDispatchPhaseExecutorSelection(report = {}) {
  const phaseExecutor = report?.dispatchPlan?.phaseExecutor;
  if (!phaseExecutor || typeof phaseExecutor !== 'object' || Array.isArray(phaseExecutor)) {
    return {
      requested_executor: null,
      applied_executor: null,
      reason: null,
    };
  }
  return {
    requested_executor: normalizeText(phaseExecutor.requested_executor) || null,
    applied_executor: normalizeText(phaseExecutor.applied_executor) || null,
    reason: normalizeText(phaseExecutor.reason) || null,
  };
}

export function resolveExecutorSelected({
  task,
  selectedExecutor = null,
  report = {},
  dispatchRun = {},
}) {
  const dispatchPhaseSelection = resolveDispatchPhaseExecutorSelection(report);
  if (dispatchPhaseSelection.applied_executor) {
    return dispatchPhaseSelection.applied_executor;
  }

  const requestedExecutor = resolveRequestedExecutor({ task, selectedExecutor });
  const runtimeExecutors = toUniqueStrings(dispatchRun.executorRegistry || []);
  if (requestedExecutor && runtimeExecutors.includes(requestedExecutor)) {
    return requestedExecutor;
  }
  if (requestedExecutor && runtimeExecutors.length === 0) {
    return requestedExecutor;
  }

  const runtimePhaseExecutor = runtimeExecutors.find((executor) => executor !== 'local-merge-gate');
  if (runtimePhaseExecutor) {
    return runtimePhaseExecutor;
  }
  return runtimeExecutors[0] || task.expected_executor;
}
