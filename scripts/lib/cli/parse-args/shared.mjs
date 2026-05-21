import {
  createDefaultDoctorOptions,
  createDefaultEntropyGcOptions,
  createDefaultHarnessResumeOptions,
  createDefaultHarnessRunOptions,
  createDefaultHarnessStatusOptions,
  createDefaultHarnessStopOptions,
  createDefaultLearnEvalOptions,
  createDefaultOrchestrateOptions,
  createDefaultQualityGateOptions,
  createDefaultReleaseStatusOptions,
  createDefaultSnapshotRollbackOptions,
  createDefaultSetupOptions,
  createDefaultUninstallOptions,
  createDefaultUpdateOptions,
  normalizeClient,
  normalizeComponents,
  normalizeEntropyGcFormat,
  normalizeEntropyGcMode,
  normalizeHarnessProfile,
  normalizeLearnEvalFormat,
  normalizeOrchestrateDispatchMode,
  normalizeOrchestrateExecutionMode,
  normalizeOrchestratePreflightMode,
  normalizeQualityGateMode,
  normalizeReleaseStatusFormat,
  normalizeReleaseStatusHistoryFormat,
  normalizeSnapshotRollbackFormat,
  normalizeSoloHarnessProvider,
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeWrapMode,
} from '../../lifecycle/options.mjs';
import { normalizeOrchestratorBlueprint, normalizeOrchestratorFormat } from '../../harness/orchestrator.mjs';

export {
  createDefaultDoctorOptions,
  createDefaultEntropyGcOptions,
  createDefaultHarnessResumeOptions,
  createDefaultHarnessRunOptions,
  createDefaultHarnessStatusOptions,
  createDefaultHarnessStopOptions,
  createDefaultLearnEvalOptions,
  createDefaultOrchestrateOptions,
  createDefaultQualityGateOptions,
  createDefaultReleaseStatusOptions,
  createDefaultSnapshotRollbackOptions,
  createDefaultSetupOptions,
  createDefaultUninstallOptions,
  createDefaultUpdateOptions,
  normalizeClient,
  normalizeComponents,
  normalizeEntropyGcFormat,
  normalizeEntropyGcMode,
  normalizeHarnessProfile,
  normalizeLearnEvalFormat,
  normalizeOrchestrateDispatchMode,
  normalizeOrchestrateExecutionMode,
  normalizeOrchestratePreflightMode,
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
  normalizeQualityGateMode,
  normalizeReleaseStatusFormat,
  normalizeReleaseStatusHistoryFormat,
  normalizeSnapshotRollbackFormat,
  normalizeSoloHarnessProvider,
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeWrapMode,
};

export const INTERNAL_TARGETS = new Set(['shell', 'skills', 'native', 'superpowers', 'browser', 'privacy', 'offload', 'codemap']);
export const PRIVACY_MODES = new Set(['regex', 'ollama', 'hybrid']);
export const TEAM_PROVIDERS = new Set(['codex', 'claude', 'gemini']);
export const HUD_PRESETS = new Set(['minimal', 'focused', 'full']);
export const SKILL_CANDIDATE_VIEWS = new Set(['inline', 'detail', 'list']);
export const TEAM_PROVIDER_CLIENT_MAP = Object.freeze({
  codex: 'codex-cli',
  claude: 'claude-code',
  gemini: 'gemini-cli',
});
export const HARNESS_SUBCOMMANDS = new Set(['run', 'status', 'resume', 'stop']);
export const INIT_AGENT_NAMES = new Set(['claude', 'codex', 'gemini', 'opencode']);

export function expandEqualsOptions(argv = []) {
  const expanded = [];
  for (const raw of argv) {
    const token = String(raw ?? '');
    if (token.startsWith('--') && token.includes('=')) {
      const equalsIndex = token.indexOf('=');
      expanded.push(token.slice(0, equalsIndex), token.slice(equalsIndex + 1));
      continue;
    }
    expanded.push(raw);
  }
  return expanded;
}

export function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parsePositiveInteger(raw, flag) {
  const value = Number.parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return value;
}

export function parseUnitInterval(raw, flag) {
  const value = Number.parseFloat(String(raw ?? '').trim());
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${flag} must be a number between 0 and 1`);
  }
  return value;
}

export function parseWatchInterval(raw, flag) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'auto') {
    return 'auto';
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer or "auto"`);
  }
  return parsed;
}

export function normalizeBaseRef(raw = 'HEAD') {
  const value = String(raw || 'HEAD').trim();
  if (!value) {
    throw new Error('--base-ref must not be empty');
  }
  return value;
}

export function parsePrivacyMode(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!PRIVACY_MODES.has(value)) {
    throw new Error('--mode must be one of: regex, ollama, hybrid');
  }
  return value;
}

export function normalizeTeamProvider(raw = 'codex') {
  const value = String(raw || 'codex').trim().toLowerCase();
  if (!TEAM_PROVIDERS.has(value)) {
    throw new Error(`--provider must be one of: ${[...TEAM_PROVIDERS].join(', ')}`);
  }
  return value;
}

export function parseTeamSpec(raw = '') {
  const value = String(raw || '').trim().toLowerCase();
  const match = /^(\d+):(codex|claude|gemini)$/u.exec(value);
  if (!match) {
    return null;
  }
  const workers = parsePositiveInteger(match[1], 'team workers');
  return {
    workers,
    provider: normalizeTeamProvider(match[2]),
  };
}

export function normalizeHudPreset(raw = '') {
  const value = String(raw || '').trim().toLowerCase();
  if (!HUD_PRESETS.has(value)) {
    throw new Error(`--preset must be one of: ${[...HUD_PRESETS].join(', ')}`);
  }
  return value;
}

export function normalizeSkillCandidateView(raw, flag = '--skill-candidate-view') {
  const value = String(raw || '').trim().toLowerCase();
  if (!SKILL_CANDIDATE_VIEWS.has(value)) {
    throw new Error(`${flag} must be one of: inline, detail`);
  }
  return value === 'list' ? 'detail' : value;
}

export function createDefaultHudOptions() {
  return {
    sessionId: '',
    provider: 'codex',
    preset: 'focused',
    watch: false,
    fast: false,
    showSkillCandidates: false,
    skillCandidateView: 'inline',
    skillCandidateLimit: 0,
    exportSkillCandidatePatchTemplate: false,
    draftId: '',
    watchdog: false,
    json: false,
    intervalMs: 1000,
  };
}
