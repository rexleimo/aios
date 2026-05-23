import { parseBooleanEnv } from './shared.mjs';

const LIVE_CAPABILITY_GUARD_KEYS = ['network', 'browser', 'sideEffect'];

function normalizeCapabilityLevel(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'no' || normalized === 'unknown') return normalized;
  return 'unknown';
}

// 纯函数：提取 live 执行中仍为 unknown 的能力面，统一供阻断、提示和测试使用。
export function collectUnknownLiveCapabilities(manifest = null) {
  if (!manifest || typeof manifest !== 'object') {
    return { blocked: false, summaryKeys: [], executors: [] };
  }

  const summary = manifest.summary && typeof manifest.summary === 'object' ? manifest.summary : {};
  const summaryKeys = LIVE_CAPABILITY_GUARD_KEYS
    .filter((key) => normalizeCapabilityLevel(summary[key]) === 'unknown');
  const executors = (Array.isArray(manifest.executors) ? manifest.executors : [])
    .map((entry) => {
      const id = String(entry?.id || '').trim();
      const jobCount = Number.isFinite(entry?.jobCount) ? Math.max(0, Math.floor(entry.jobCount)) : 0;
      const capabilities = entry?.capabilities && typeof entry.capabilities === 'object' ? entry.capabilities : {};
      const unknown = LIVE_CAPABILITY_GUARD_KEYS
        .filter((key) => normalizeCapabilityLevel(capabilities[key]) === 'unknown');
      if (!id || unknown.length === 0) return null;
      return { id, jobCount, unknown };
    })
    .filter(Boolean);

  return { blocked: summaryKeys.length > 0, summaryKeys, executors };
}

// 纯函数：集中判断 live unknown 能力是否允许人工覆盖，避免各入口自行读取环境变量。
export function canOverrideUnknownLiveCapabilities(options = {}, env = process.env) {
  if (options?.force === true) return true;
  if (parseBooleanEnv(env?.AIOS_ALLOW_UNKNOWN_CAPABILITIES, false)) return true;
  if (parseBooleanEnv(env?.AIOS_ALLOW_UNKNOWN_LIVE_CAPABILITIES, false)) return true;
  return false;
}

// 纯函数：生成 unknown 能力阻断后的恢复命令，调用方只注入 preview 渲染函数。
export function buildUnknownCapabilityGuardSuggestedCommands(options = {}, renderPreview = null) {
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
  const preview = typeof renderPreview === 'function'
    ? renderPreview
    : (candidate) => JSON.stringify(candidate);
  const dryRunPreview = preview({ ...normalized, executionMode: 'dry-run', force: false, format: 'json' });
  const forceLivePreview = preview({ ...normalized, executionMode: 'live', force: true, format: 'json' });
  return [...new Set([dryRunPreview, forceLivePreview].filter(Boolean))];
}
