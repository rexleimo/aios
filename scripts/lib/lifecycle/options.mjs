import { HARNESS_PROFILE_NAMES, normalizeHarnessProfile } from '../harness/profile.mjs';

export const COMPONENT_NAMES = ['browser', 'shell', 'skills', 'native', 'agents', 'superpowers'];
export const WRAP_MODES = ['all', 'repo-only', 'opt-in', 'off'];
export const CLIENT_NAMES = ['all', 'codex', 'claude', 'gemini', 'opencode'];
export const SKILL_SCOPE_NAMES = ['global', 'project'];
export const SKILL_INSTALL_MODE_NAMES = ['copy', 'link'];
export const QUALITY_GATE_MODES = ['quick', 'full', 'pre-pr'];
export const ORCHESTRATOR_FORMAT_NAMES = ['text', 'json'];
export const ORCHESTRATOR_BLUEPRINT_NAMES = ['feature', 'bugfix', 'refactor', 'security'];
export const ORCHESTRATOR_DISPATCH_MODE_NAMES = ['none', 'local'];
export const ORCHESTRATOR_EXECUTION_MODE_NAMES = ['none', 'dry-run', 'live'];
export const ORCHESTRATOR_PREFLIGHT_MODE_NAMES = ['none', 'auto'];
export const LEARN_EVAL_FORMAT_NAMES = ['text', 'json'];
export const ENTROPY_GC_MODE_NAMES = ['dry-run', 'auto', 'off'];
export const ENTROPY_GC_FORMAT_NAMES = ['text', 'json'];
export const SNAPSHOT_ROLLBACK_FORMAT_NAMES = ['text', 'json'];
export const RELEASE_STATUS_FORMAT_NAMES = ['text', 'json'];
export const RELEASE_STATUS_HISTORY_FORMAT_NAMES = ['csv', 'ndjson'];
export const SOLO_HARNESS_PROVIDER_NAMES = ['codex', 'claude', 'gemini', 'opencode'];

export function normalizeWrapMode(raw = 'opt-in') {
  const value = String(raw || 'opt-in').trim().toLowerCase();
  if (!WRAP_MODES.includes(value)) {
    throw new Error(`--mode must be one of: ${WRAP_MODES.join(', ')}`);
  }
  return value;
}

export function normalizeClient(raw = 'all') {
  const value = String(raw || 'all').trim().toLowerCase();
  if (!CLIENT_NAMES.includes(value)) {
    throw new Error(`--client must be one of: ${CLIENT_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeSkillScope(raw = 'global') {
  const value = String(raw || 'global').trim().toLowerCase();
  if (!SKILL_SCOPE_NAMES.includes(value)) {
    throw new Error(`--scope must be one of: ${SKILL_SCOPE_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeSkillInstallMode(raw = 'copy') {
  const value = String(raw || 'copy').trim().toLowerCase();
  if (!SKILL_INSTALL_MODE_NAMES.includes(value)) {
    throw new Error(`--install-mode must be one of: ${SKILL_INSTALL_MODE_NAMES.join(', ')}`);
  }
  return value;
}

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
  const value = String(raw || 'full').trim().toLowerCase();
  if (!QUALITY_GATE_MODES.includes(value)) {
    throw new Error(`quality-gate mode must be one of: ${QUALITY_GATE_MODES.join(', ')}`);
  }
  return value;
}

export function normalizeLearnEvalFormat(raw = 'text') {
  const value = String(raw || 'text').trim().toLowerCase();
  if (!LEARN_EVAL_FORMAT_NAMES.includes(value)) {
    throw new Error(`learn-eval format must be one of: ${LEARN_EVAL_FORMAT_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeEntropyGcMode(raw = 'auto') {
  const value = String(raw || 'auto').trim().toLowerCase();
  if (!ENTROPY_GC_MODE_NAMES.includes(value)) {
    throw new Error(`entropy-gc mode must be one of: ${ENTROPY_GC_MODE_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeEntropyGcFormat(raw = 'text') {
  const value = String(raw || 'text').trim().toLowerCase();
  if (!ENTROPY_GC_FORMAT_NAMES.includes(value)) {
    throw new Error(`entropy-gc format must be one of: ${ENTROPY_GC_FORMAT_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeSnapshotRollbackFormat(raw = 'text') {
  const value = String(raw || 'text').trim().toLowerCase();
  if (!SNAPSHOT_ROLLBACK_FORMAT_NAMES.includes(value)) {
    throw new Error(`snapshot-rollback format must be one of: ${SNAPSHOT_ROLLBACK_FORMAT_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeReleaseStatusFormat(raw = 'text') {
  const value = String(raw || 'text').trim().toLowerCase();
  if (!RELEASE_STATUS_FORMAT_NAMES.includes(value)) {
    throw new Error(`release-status format must be one of: ${RELEASE_STATUS_FORMAT_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeReleaseStatusHistoryFormat(raw = 'csv') {
  const value = String(raw || 'csv').trim().toLowerCase();
  if (!RELEASE_STATUS_HISTORY_FORMAT_NAMES.includes(value)) {
    throw new Error(`release-status history format must be one of: ${RELEASE_STATUS_HISTORY_FORMAT_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeSoloHarnessProvider(raw = 'codex') {
  const value = String(raw || 'codex').trim().toLowerCase();
  if (!SOLO_HARNESS_PROVIDER_NAMES.includes(value)) {
    throw new Error(`--provider must be one of: ${SOLO_HARNESS_PROVIDER_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeOrchestrateDispatchMode(raw = 'none') {
  const value = String(raw || 'none').trim().toLowerCase();
  if (!ORCHESTRATOR_DISPATCH_MODE_NAMES.includes(value)) {
    throw new Error(`orchestrate dispatch mode must be one of: ${ORCHESTRATOR_DISPATCH_MODE_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeOrchestrateExecutionMode(raw = 'none') {
  const value = String(raw || 'none').trim().toLowerCase();
  if (!ORCHESTRATOR_EXECUTION_MODE_NAMES.includes(value)) {
    throw new Error(`orchestrate execution mode must be one of: ${ORCHESTRATOR_EXECUTION_MODE_NAMES.join(', ')}`);
  }
  return value;
}

export function normalizeOrchestratePreflightMode(raw = 'none') {
  const value = String(raw || 'none').trim().toLowerCase();
  if (!ORCHESTRATOR_PREFLIGHT_MODE_NAMES.includes(value)) {
    throw new Error(`orchestrate preflight mode must be one of: ${ORCHESTRATOR_PREFLIGHT_MODE_NAMES.join(', ')}`);
  }
  return value;
}

export { HARNESS_PROFILE_NAMES, normalizeHarnessProfile };

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

export function hasComponent(components, needle) {
  return components.includes('all') || components.includes(needle);
}

export function createDefaultSetupOptions() {
  return {
    components: ['browser', 'shell', 'skills', 'native', 'superpowers'],
    wrapMode: 'opt-in',
    client: 'all',
    scope: 'global',
    installMode: 'copy',
    skills: [],
    skipPlaywrightInstall: false,
    skipDoctor: false,
  };
}

export function createDefaultUpdateOptions() {
  return {
    selfUpdate: false,
    components: ['browser', 'shell', 'skills', 'native', 'superpowers'],
    wrapMode: 'opt-in',
    client: 'all',
    scope: 'global',
    installMode: 'copy',
    skills: [],
    withPlaywrightInstall: false,
    skipDoctor: false,
  };
}

export function createDefaultUninstallOptions() {
  return {
    components: ['shell', 'skills'],
    client: 'all',
    scope: 'global',
    skills: [],
  };
}

export function createDefaultDoctorOptions() {
  return {
    strict: false,
    globalSecurity: false,
    profile: 'standard',
    nativeOnly: false,
    verbose: false,
    fix: false,
    dryRun: false,
  };
}

export function createDefaultQualityGateOptions() {
  return {
    mode: 'full',
    profile: 'standard',
    globalSecurity: false,
    sessionId: '',
  };
}

export function createDefaultOrchestrateOptions() {
  return {
    blueprint: '',
    taskTitle: '',
    contextSummary: '',
    planPath: '',
    sessionId: '',
    limit: 10,
    recommendationId: '',
    // Sentinel empty strings mean "flag not provided" so orchestrate can apply
    // smarter defaults (for example auto local dry-run) without losing the
    // ability to explicitly request "none".
    dispatchMode: '',
    executionMode: '',
    preflightMode: '',
    format: 'text',
  };
}

export function createDefaultLearnEvalOptions() {
  return {
    sessionId: '',
    limit: 10,
    format: 'text',
    applyDraftId: '',
    applyDrafts: false,
    applyDryRun: false,
  };
}

export function createDefaultEntropyGcOptions() {
  return {
    sessionId: '',
    mode: 'auto',
    retain: 5,
    minAgeHours: 24,
    format: 'text',
  };
}

export function createDefaultSnapshotRollbackOptions() {
  return {
    manifestPath: '',
    sessionId: '',
    jobId: '',
    dryRun: false,
    format: 'text',
  };
}

export function createDefaultReleaseStatusOptions() {
  return {
    statePath: '',
    recent: 10,
    format: 'text',
    strict: false,
    minSamples: 8,
    maxFailureRate: 0.2,
    maxFallbackRate: 0.1,
    wowFailureRateDeltaWarn: 0.05,
    wowFallbackRateDeltaWarn: 0.03,
    outputPath: '',
    historyOutputPath: '',
    historyFormat: 'csv',
    historyDays: 14,
  };
}

export function createDefaultHarnessRunOptions() {
  return {
    subcommand: 'run',
    objective: '',
    sessionId: '',
    workspaceRoot: '',
    provider: 'codex',
    profile: 'standard',
    worktree: false,
    baseRef: 'HEAD',
    maxIterations: 20,
    lifecycleHooks: true,
    dryRun: false,
    json: false,
  };
}

export function createDefaultHarnessStatusOptions() {
  return {
    subcommand: 'status',
    sessionId: '',
    workspaceRoot: '',
    json: false,
  };
}

export function createDefaultHarnessResumeOptions() {
  return {
    subcommand: 'resume',
    sessionId: '',
    workspaceRoot: '',
    maxIterations: 20,
    lifecycleHooks: true,
    json: false,
  };
}

export function createDefaultHarnessStopOptions() {
  return {
    subcommand: 'stop',
    sessionId: '',
    workspaceRoot: '',
    json: false,
    reason: 'operator-request',
  };
}
