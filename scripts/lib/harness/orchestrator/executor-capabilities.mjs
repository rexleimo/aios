import {
  LOCAL_CONTROL_EXECUTOR,
  LOCAL_MERGE_GATE_EXECUTOR,
  LOCAL_PHASE_EXECUTOR,
} from '../orchestrator-executors.mjs';

export const EXECUTOR_CAPABILITY_KEYS = Object.freeze(['read', 'write', 'network', 'browser', 'sideEffect']);
const EXECUTOR_CAPABILITY_LEVELS = new Set(['yes', 'no', 'unknown']);
const EXECUTOR_CAPABILITY_KEY_SET = new Set(EXECUTOR_CAPABILITY_KEYS);

import { normalizeText } from '../../../../src/shared/normalize.mjs';

// 纯函数：把能力值收敛到统一枚举，避免报告、策略、质量门各自处理异常输入。
export function normalizeExecutorCapabilityLevel(value, fallback = 'unknown') {
  const normalized = normalizeText(value).toLowerCase();
  return EXECUTOR_CAPABILITY_LEVELS.has(normalized) ? normalized : fallback;
}

// 纯函数：补齐执行器能力矩阵，让调用方只消费 read/write/network/browser/sideEffect 五个稳定字段。
export function normalizeExecutorCapabilities(raw = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(EXECUTOR_CAPABILITY_KEYS.map((key) => [
    key,
    normalizeExecutorCapabilityLevel(source[key], 'unknown'),
  ]));
}

// 纯函数：能力聚合采用保守策略；任一执行器需要能力即为 yes，未知能力会阻断 live 默认放行。
export function aggregateExecutorCapabilityLevels(levels = []) {
  const normalizedLevels = Array.isArray(levels)
    ? levels.map((level) => normalizeExecutorCapabilityLevel(level, 'unknown'))
    : [];
  if (normalizedLevels.some((level) => level === 'yes')) return 'yes';
  if (normalizedLevels.some((level) => level === 'unknown')) return 'unknown';
  return 'no';
}

// 纯函数：归一化执行器能力清单，集中维护 schema 容错和汇总逻辑。
export function normalizeExecutorCapabilityManifest(rawManifest = null) {
  if (!rawManifest || typeof rawManifest !== 'object') return null;

  const executors = Array.isArray(rawManifest.executors)
    ? rawManifest.executors
      .map((entry) => {
        const id = normalizeText(entry?.id);
        if (!id) return null;
        const notes = Array.isArray(entry?.notes)
          ? entry.notes.map((item) => normalizeText(item)).filter(Boolean)
          : [];
        return {
          id,
          label: normalizeText(entry?.label) || id,
          jobCount: Number.isFinite(entry?.jobCount) ? Math.max(0, Math.floor(entry.jobCount)) : 0,
          capabilities: normalizeExecutorCapabilities(entry?.capabilities),
          notes,
        };
      })
      .filter(Boolean)
    : [];

  const fallbackSummary = normalizeExecutorCapabilities(rawManifest.summary);
  const summary = executors.length > 0
    ? Object.fromEntries(EXECUTOR_CAPABILITY_KEYS.map((key) => [
      key,
      aggregateExecutorCapabilityLevels(executors.map((entry) => entry.capabilities[key])),
    ]))
    : fallbackSummary;

  return {
    schemaVersion: Number.isFinite(rawManifest.schemaVersion) ? Math.max(1, Math.floor(rawManifest.schemaVersion)) : 1,
    generatedAt: normalizeText(rawManifest.generatedAt),
    executionMode: normalizeText(rawManifest.executionMode) || 'none',
    runtimeId: normalizeText(rawManifest.runtimeId),
    summary,
    executors,
  };
}

function deriveExecutorCapabilities({
  executorId = '',
  executionMode = 'none',
  jobCount = 0,
  hasEditableJobs = false,
} = {}) {
  const id = normalizeText(executorId);
  const mode = normalizeText(executionMode).toLowerCase() || 'none';
  const hasJobs = Number.isFinite(jobCount) ? Math.max(0, Math.floor(jobCount)) > 0 : false;

  if (!hasJobs) {
    return normalizeExecutorCapabilities({ read: 'no', write: 'no', network: 'no', browser: 'no', sideEffect: 'no' });
  }

  if (id === LOCAL_MERGE_GATE_EXECUTOR) {
    return normalizeExecutorCapabilities({ read: 'yes', write: 'no', network: 'no', browser: 'no', sideEffect: 'no' });
  }

  if (id === LOCAL_PHASE_EXECUTOR || id === LOCAL_CONTROL_EXECUTOR) {
    if (mode === 'live') {
      const writeLevel = hasEditableJobs ? 'yes' : 'no';
      return normalizeExecutorCapabilities({
        read: 'yes',
        write: writeLevel,
        network: 'unknown',
        browser: 'unknown',
        sideEffect: writeLevel === 'yes' ? 'yes' : 'unknown',
      });
    }

    return normalizeExecutorCapabilities({ read: 'yes', write: 'no', network: 'no', browser: 'no', sideEffect: 'no' });
  }

  return normalizeExecutorCapabilities(Object.fromEntries(EXECUTOR_CAPABILITY_KEYS.map((key) => [
    key,
    mode === 'none' ? 'no' : 'unknown',
  ])));
}

function normalizeExecutorDetails(plan = {}) {
  if (Array.isArray(plan.executorDetails) && plan.executorDetails.length > 0) {
    return plan.executorDetails;
  }
  if (Array.isArray(plan.executorRegistry)) {
    return plan.executorRegistry
      .map((id) => ({ id: normalizeText(id), label: normalizeText(id) }))
      .filter((entry) => entry.id);
  }
  return [];
}

// 纯函数：从调度计划生成能力清单，作为 live 能力守卫和报告渲染的唯一来源。
export function buildExecutorCapabilityManifest({
  dispatchPlan = null,
  executionMode = 'none',
  runtimeId = '',
} = {}) {
  const normalizedPlan = dispatchPlan && typeof dispatchPlan === 'object' ? dispatchPlan : null;
  if (!normalizedPlan) return null;

  const jobs = Array.isArray(normalizedPlan.jobs) ? normalizedPlan.jobs : [];
  const executorRows = [];
  const jobsByExecutor = new Map();

  for (const job of jobs) {
    const executorId = normalizeText(job?.launchSpec?.executor);
    if (!executorId) continue;
    const bucket = jobsByExecutor.get(executorId) || [];
    bucket.push(job);
    jobsByExecutor.set(executorId, bucket);
  }

  for (const entry of normalizeExecutorDetails(normalizedPlan)) {
    const id = normalizeText(entry?.id);
    if (!id) continue;
    const matchedJobs = jobsByExecutor.get(id) || [];
    const jobCount = matchedJobs.length;
    const hasEditableJobs = matchedJobs.some((job) => job?.launchSpec?.canEditFiles === true);
    const capabilities = deriveExecutorCapabilities({ executorId: id, executionMode, jobCount, hasEditableJobs });
    const declaredModes = Array.isArray(entry?.executionModes)
      ? entry.executionModes.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const notes = [];

    if (executionMode === 'live' && (id === LOCAL_PHASE_EXECUTOR || id === LOCAL_CONTROL_EXECUTOR)) {
      notes.push('Live mode delegates phase execution to subagent-runtime; network/browser access depends on client tooling and prompt constraints.');
    }
    if (declaredModes.length > 0 && executionMode !== 'none' && !declaredModes.includes(executionMode)) {
      notes.push(`Declared executionModes=${declaredModes.join(',')} differ from requested mode=${executionMode}.`);
    }
    if (executionMode === 'dry-run') {
      notes.push('Dry-run mode is simulation-only and does not mutate workspace files.');
    }

    executorRows.push({
      id,
      label: normalizeText(entry?.label) || id,
      jobCount,
      capabilities,
      notes,
    });
  }

  const summary = normalizeExecutorCapabilities(Object.fromEntries(EXECUTOR_CAPABILITY_KEYS.map((key) => [
    key,
    aggregateExecutorCapabilityLevels(executorRows.map((entry) => entry.capabilities[key])),
  ])));

  return normalizeExecutorCapabilityManifest({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    executionMode: normalizeText(executionMode) || 'none',
    runtimeId: normalizeText(runtimeId),
    summary,
    executors: executorRows,
  });
}
