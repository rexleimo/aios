import {
  CLIENT_NAMES,
  COMPONENT_NAMES,
  ENTROPY_GC_FORMAT_NAMES,
  ENTROPY_GC_MODE_NAMES,
  LEARN_EVAL_FORMAT_NAMES,
  ORCHESTRATOR_DISPATCH_MODE_NAMES,
  ORCHESTRATOR_EXECUTION_MODE_NAMES,
  ORCHESTRATOR_PREFLIGHT_MODE_NAMES,
  QUALITY_GATE_MODES,
  RELEASE_STATUS_FORMAT_NAMES,
  RELEASE_STATUS_HISTORY_FORMAT_NAMES,
  SKILL_INSTALL_MODE_NAMES,
  SKILL_SCOPE_NAMES,
  SNAPSHOT_ROLLBACK_FORMAT_NAMES,
  SOLO_HARNESS_PROVIDER_NAMES,
  TOKEN_PROFILE_NAMES,
  WRAP_MODES,
} from './constants.mjs';

// 纯函数：把用户输入规整成小写枚举值，并统一输出可读的校验错误。
function normalizeEnum(raw, fallback, allowedValues, label) {
  const value = String(raw || fallback).trim().toLowerCase();
  if (!allowedValues.includes(value)) {
    throw new Error(`${label} must be one of: ${allowedValues.join(', ')}`);
  }
  return value;
}

export function normalizeWrapMode(raw = 'opt-in') {
  return normalizeEnum(raw, 'opt-in', WRAP_MODES, '--mode');
}

export function normalizeClient(raw = 'all') {
  return normalizeEnum(raw, 'all', CLIENT_NAMES, '--client');
}

export function normalizeSkillScope(raw = 'global') {
  return normalizeEnum(raw, 'global', SKILL_SCOPE_NAMES, '--scope');
}

export function normalizeSkillInstallMode(raw = 'copy') {
  return normalizeEnum(raw, 'copy', SKILL_INSTALL_MODE_NAMES, '--install-mode');
}

export function normalizeTokenProfile(raw = 'balanced') {
  return normalizeEnum(raw, 'balanced', TOKEN_PROFILE_NAMES, '--token-profile');
}

// 纯函数：支持数组或逗号分隔输入，去重后保留用户声明的技能顺序。
export function normalizeSkillNames(raw = []) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((item) => String(item || '').trim()).filter(Boolean))];
  }

  const input = String(raw ?? '').trim();
  if (!input) {
    return [];
  }

  return [...new Set(input.split(',').map((item) => item.trim()).filter(Boolean))];
}

export function normalizeQualityGateMode(raw = 'full') {
  return normalizeEnum(raw, 'full', QUALITY_GATE_MODES, 'quality-gate mode');
}

export function normalizeLearnEvalFormat(raw = 'text') {
  return normalizeEnum(raw, 'text', LEARN_EVAL_FORMAT_NAMES, 'learn-eval format');
}

export function normalizeEntropyGcMode(raw = 'auto') {
  return normalizeEnum(raw, 'auto', ENTROPY_GC_MODE_NAMES, 'entropy-gc mode');
}

export function normalizeEntropyGcFormat(raw = 'text') {
  return normalizeEnum(raw, 'text', ENTROPY_GC_FORMAT_NAMES, 'entropy-gc format');
}

export function normalizeSnapshotRollbackFormat(raw = 'text') {
  return normalizeEnum(raw, 'text', SNAPSHOT_ROLLBACK_FORMAT_NAMES, 'snapshot-rollback format');
}

export function normalizeReleaseStatusFormat(raw = 'text') {
  return normalizeEnum(raw, 'text', RELEASE_STATUS_FORMAT_NAMES, 'release-status format');
}

export function normalizeReleaseStatusHistoryFormat(raw = 'csv') {
  return normalizeEnum(raw, 'csv', RELEASE_STATUS_HISTORY_FORMAT_NAMES, 'release-status history format');
}

export function normalizeSoloHarnessProvider(raw = 'codex') {
  return normalizeEnum(raw, 'codex', SOLO_HARNESS_PROVIDER_NAMES, '--provider');
}

export function normalizeOrchestrateDispatchMode(raw = 'none') {
  return normalizeEnum(raw, 'none', ORCHESTRATOR_DISPATCH_MODE_NAMES, 'orchestrate dispatch mode');
}

export function normalizeOrchestrateExecutionMode(raw = 'none') {
  return normalizeEnum(raw, 'none', ORCHESTRATOR_EXECUTION_MODE_NAMES, 'orchestrate execution mode');
}

export function normalizeOrchestratePreflightMode(raw = 'none') {
  return normalizeEnum(raw, 'none', ORCHESTRATOR_PREFLIGHT_MODE_NAMES, 'orchestrate preflight mode');
}

// 纯函数：把对象、数组或逗号字符串统一解析为组件列表，方便 CLI 与生命周期复用。
export function normalizeComponents(raw, fallback = COMPONENT_NAMES) {
  if (Array.isArray(raw)) {
    return normalizeComponents(raw.join(','), fallback);
  }

  if (raw && typeof raw === 'object') {
    const selected = COMPONENT_NAMES.filter((name) => raw[name] === true);
    return selected.length > 0 ? selected : [...fallback];
  }

  const input = String(raw ?? '').trim();
  const normalized = input.length > 0
    ? input.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
    : [...fallback];

  if (normalized.length === 0) {
    return [...fallback];
  }

  if (normalized.includes('all')) {
    return ['all'];
  }

  for (const item of normalized) {
    if (!COMPONENT_NAMES.includes(item)) {
      throw new Error(`Unsupported component: ${item}. Allowed: ${COMPONENT_NAMES.join(', ')} (or all)`);
    }
  }

  return [...new Set(normalized)];
}

// 纯函数：集中判断 all 语义，避免调用方重复写 includes 分支。
export function hasComponent(components, needle) {
  return components.includes('all') || components.includes(needle);
}
