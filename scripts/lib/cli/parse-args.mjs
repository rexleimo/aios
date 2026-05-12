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
} from '../lifecycle/options.mjs';
import { normalizeOrchestratorBlueprint, normalizeOrchestratorFormat } from '../harness/orchestrator.mjs';

const INTERNAL_TARGETS = new Set(['shell', 'skills', 'native', 'superpowers', 'browser', 'privacy']);
const PRIVACY_MODES = new Set(['regex', 'ollama', 'hybrid']);
const TEAM_PROVIDERS = new Set(['codex', 'claude', 'gemini']);
const HUD_PRESETS = new Set(['minimal', 'focused', 'full']);
const SKILL_CANDIDATE_VIEWS = new Set(['inline', 'detail', 'list']);
const TEAM_PROVIDER_CLIENT_MAP = Object.freeze({
  codex: 'codex-cli',
  claude: 'claude-code',
  gemini: 'gemini-cli',
});
const HARNESS_SUBCOMMANDS = new Set(['run', 'status', 'resume', 'stop']);

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parsePositiveInteger(raw, flag) {
  const value = Number.parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return value;
}

function parseUnitInterval(raw, flag) {
  const value = Number.parseFloat(String(raw ?? '').trim());
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${flag} must be a number between 0 and 1`);
  }
  return value;
}

function parseWatchInterval(raw, flag) {
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

function normalizeBaseRef(raw = 'HEAD') {
  const value = String(raw || 'HEAD').trim();
  if (!value) {
    throw new Error('--base-ref must not be empty');
  }
  return value;
}

function parsePrivacyMode(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!PRIVACY_MODES.has(value)) {
    throw new Error('--mode must be one of: regex, ollama, hybrid');
  }
  return value;
}

function normalizeTeamProvider(raw = 'codex') {
  const value = String(raw || 'codex').trim().toLowerCase();
  if (!TEAM_PROVIDERS.has(value)) {
    throw new Error(`--provider must be one of: ${[...TEAM_PROVIDERS].join(', ')}`);
  }
  return value;
}

function parseTeamSpec(raw = '') {
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

function normalizeHudPreset(raw = '') {
  const value = String(raw || '').trim().toLowerCase();
  if (!HUD_PRESETS.has(value)) {
    throw new Error(`--preset must be one of: ${[...HUD_PRESETS].join(', ')}`);
  }
  return value;
}

function normalizeSkillCandidateView(raw, flag = '--skill-candidate-view') {
  const value = String(raw || '').trim().toLowerCase();
  if (!SKILL_CANDIDATE_VIEWS.has(value)) {
    throw new Error(`${flag} must be one of: inline, detail`);
  }
  return value === 'list' ? 'detail' : value;
}

function createDefaultHudOptions() {
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

function parseHudArgs(argv) {
  const rest = argv.slice(1);
  const options = createDefaultHudOptions();
  let help = false;
  let presetExplicit = false;
  let fastExplicit = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--provider':
        options.provider = normalizeTeamProvider(takeValue(rest, index, '--provider'));
        index += 1;
        break;
      case '--preset':
        presetExplicit = true;
        options.preset = normalizeHudPreset(takeValue(rest, index, '--preset'));
        index += 1;
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--fast':
        options.fast = true;
        fastExplicit = true;
        break;
      case '--no-fast':
        options.fast = false;
        fastExplicit = true;
        break;
      case '--show-skill-candidates':
        options.showSkillCandidates = true;
        if (rest[index + 1] && !String(rest[index + 1]).startsWith('-')) {
          const nextToken = String(rest[index + 1] || '').trim().toLowerCase();
          if (SKILL_CANDIDATE_VIEWS.has(nextToken)) {
            options.skillCandidateView = normalizeSkillCandidateView(rest[index + 1], '--show-skill-candidates');
            index += 1;
          }
        }
        break;
      case '--skill-candidate-view':
        options.skillCandidateView = normalizeSkillCandidateView(
          takeValue(rest, index, '--skill-candidate-view'),
          '--skill-candidate-view'
        );
        options.showSkillCandidates = true;
        index += 1;
        break;
      case '--export-skill-candidate-patch-template':
        options.exportSkillCandidatePatchTemplate = true;
        options.showSkillCandidates = true;
        break;
      case '--draft-id':
        options.draftId = takeValue(rest, index, '--draft-id');
        options.showSkillCandidates = true;
        index += 1;
        break;
      case '--skill-candidate-limit':
        options.skillCandidateLimit = parsePositiveInteger(
          takeValue(rest, index, '--skill-candidate-limit'),
          '--skill-candidate-limit'
        );
        options.showSkillCandidates = true;
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      case '--watchdog':
        options.watchdog = true;
        break;
      case '--interval-ms':
        options.intervalMs = parseWatchInterval(takeValue(rest, index, '--interval-ms'), '--interval-ms');
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.provider = normalizeTeamProvider(options.provider);
  if (options.watch && !presetExplicit) {
    options.preset = 'minimal';
  }
  const intervalAutoFastEligible = options.intervalMs === 'auto'
    || (Number.isFinite(options.intervalMs) && options.intervalMs <= 500);
  if (!fastExplicit && options.watch && options.preset === 'minimal' && intervalAutoFastEligible) {
    options.fast = true;
  }
  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'hud',
    options,
  };
}

function createDefaultTeamOptions() {
  return {
    workers: 3,
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    blueprint: 'feature',
    taskTitle: '',
    contextSummary: '',
    planPath: '',
    sessionId: '',
    limit: 10,
    recommendationId: '',
    preflightMode: 'none',
    executionMode: 'live',
    resumeSessionId: '',
    retryBlocked: false,
    force: false,
    format: 'text',
    teamSpec: '3:codex',
  };
}

function parseHarnessArgs(argv) {
  const rest = argv.slice(1);
  if (rest[0] === '-h' || rest[0] === '--help') {
    return {
      mode: 'help',
      help: true,
      command: 'harness',
      options: createDefaultHarnessRunOptions(),
    };
  }
  const subcommand = rest[0] && !rest[0].startsWith('-') ? String(rest[0]).trim().toLowerCase() : 'run';
  if (!HARNESS_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`harness subcommand must be one of: ${[...HARNESS_SUBCOMMANDS].join(', ')}`);
  }
  if (subcommand === 'run') return parseHarnessRunArgs(argv);
  if (subcommand === 'status') return parseHarnessStatusArgs(argv);
  if (subcommand === 'resume') return parseHarnessResumeArgs(argv);
  return parseHarnessStopArgs(argv);
}

function parseHarnessRunArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultHarnessRunOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--objective':
        options.objective = takeValue(rest, index, '--objective');
        index += 1;
        break;
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--provider':
        options.provider = normalizeSoloHarnessProvider(takeValue(rest, index, '--provider'));
        index += 1;
        break;
      case '--profile':
        options.profile = normalizeHarnessProfile(takeValue(rest, index, '--profile'));
        index += 1;
        break;
      case '--worktree':
        options.worktree = true;
        break;
      case '--base-ref':
        options.baseRef = normalizeBaseRef(takeValue(rest, index, '--base-ref'));
        index += 1;
        break;
      case '--max-iterations':
        options.maxIterations = parsePositiveInteger(takeValue(rest, index, '--max-iterations'), '--max-iterations');
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--hooks':
        options.lifecycleHooks = true;
        break;
      case '--no-hooks':
        options.lifecycleHooks = false;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'harness',
    options,
  };
}

function parseHarnessStatusArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultHarnessStatusOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'harness',
    options,
  };
}

function parseHarnessResumeArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultHarnessResumeOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--max-iterations':
        options.maxIterations = parsePositiveInteger(takeValue(rest, index, '--max-iterations'), '--max-iterations');
        index += 1;
        break;
      case '--hooks':
        options.lifecycleHooks = true;
        break;
      case '--no-hooks':
        options.lifecycleHooks = false;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'harness',
    options,
  };
}

function parseHarnessStopArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultHarnessStopOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--reason':
        options.reason = takeValue(rest, index, '--reason');
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'harness',
    options,
  };
}

function createDefaultTeamStatusOptions() {
  return {
    subcommand: 'status',
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    sessionId: '',
    resumeSessionId: '',
    preset: 'focused',
    watch: false,
    fast: false,
    showSkillCandidates: false,
    skillCandidateView: 'inline',
    skillCandidateLimit: 0,
    exportSkillCandidatePatchTemplate: false,
    draftId: '',
    json: false,
    intervalMs: 1000,
    watchdog: false,
  };
}

function createDefaultTeamWatchdogOptions() {
  return {
    subcommand: 'watchdog',
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    sessionId: '',
    resumeSessionId: '',
    workers: 2,
    json: false,
  };
}

function parseTeamStatusArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultTeamStatusOptions();
  let help = false;
  let presetExplicit = false;
  let fastExplicit = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (!arg.startsWith('-')) {
      if (!options.sessionId) {
        options.sessionId = String(arg || '').trim();
        continue;
      }
      throw new Error(`Unexpected argument: ${arg}`);
    }

    switch (arg) {
      case '--provider':
        options.provider = normalizeTeamProvider(takeValue(rest, index, '--provider'));
        index += 1;
        break;
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--resume':
        options.resumeSessionId = takeValue(rest, index, '--resume');
        index += 1;
        break;
      case '--preset':
        presetExplicit = true;
        options.preset = normalizeHudPreset(takeValue(rest, index, '--preset'));
        index += 1;
        break;
      case '--watch':
      case '-w':
        options.watch = true;
        break;
      case '--fast':
        options.fast = true;
        fastExplicit = true;
        break;
      case '--show-skill-candidates':
        options.showSkillCandidates = true;
        if (rest[index + 1] && !String(rest[index + 1]).startsWith('-')) {
          const nextToken = String(rest[index + 1] || '').trim().toLowerCase();
          if (SKILL_CANDIDATE_VIEWS.has(nextToken)) {
            options.skillCandidateView = normalizeSkillCandidateView(rest[index + 1], '--show-skill-candidates');
            index += 1;
          }
        }
        break;
      case '--skill-candidate-view':
        options.skillCandidateView = normalizeSkillCandidateView(
          takeValue(rest, index, '--skill-candidate-view'),
          '--skill-candidate-view'
        );
        options.showSkillCandidates = true;
        index += 1;
        break;
      case '--export-skill-candidate-patch-template':
        options.exportSkillCandidatePatchTemplate = true;
        options.showSkillCandidates = true;
        break;
      case '--draft-id':
        options.draftId = takeValue(rest, index, '--draft-id');
        options.showSkillCandidates = true;
        index += 1;
        break;
      case '--skill-candidate-limit':
        options.skillCandidateLimit = parsePositiveInteger(
          takeValue(rest, index, '--skill-candidate-limit'),
          '--skill-candidate-limit'
        );
        options.showSkillCandidates = true;
        index += 1;
        break;
      case '--no-fast':
        options.fast = false;
        fastExplicit = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--watchdog':
        options.watchdog = true;
        break;
      case '--interval-ms':
        options.intervalMs = parseWatchInterval(takeValue(rest, index, '--interval-ms'), '--interval-ms');
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.provider = normalizeTeamProvider(options.provider);
  options.clientId = TEAM_PROVIDER_CLIENT_MAP[options.provider];
  if (!options.sessionId && options.resumeSessionId) {
    options.sessionId = options.resumeSessionId;
  }
  if (options.watch && !presetExplicit) {
    options.preset = 'minimal';
  }
  const intervalAutoFastEligible = options.intervalMs === 'auto'
    || (Number.isFinite(options.intervalMs) && options.intervalMs <= 500);
  if (!fastExplicit && options.watch && options.preset === 'minimal' && intervalAutoFastEligible) {
    options.fast = true;
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'team',
    options,
  };
}

function parseTeamWatchdogArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultTeamWatchdogOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (!arg.startsWith('-')) {
      if (!options.sessionId) {
        options.sessionId = String(arg || '').trim();
        continue;
      }
      throw new Error(`Unexpected argument: ${arg}`);
    }

    switch (arg) {
      case '--provider':
        options.provider = normalizeTeamProvider(takeValue(rest, index, '--provider'));
        index += 1;
        break;
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--resume':
        options.resumeSessionId = takeValue(rest, index, '--resume');
        index += 1;
        break;
      case '--workers':
        options.workers = parsePositiveInteger(takeValue(rest, index, '--workers'), '--workers');
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.provider = normalizeTeamProvider(options.provider);
  options.clientId = TEAM_PROVIDER_CLIENT_MAP[options.provider];
  if (!options.sessionId && options.resumeSessionId) {
    options.sessionId = options.resumeSessionId;
  }
  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'team',
    options,
  };
}

function createDefaultTeamHistoryOptions() {
  return {
    subcommand: 'history',
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    limit: 10,
    concurrency: 4,
    fast: false,
    qualityFailedOnly: false,
    qualityCategory: '',
    qualityCategoryPrefix: '',
    qualityCategoryPrefixMode: 'any',
    draftId: '',
    since: '',
    status: '',
    json: false,
  };
}

function createDefaultTeamSkillCandidatesExportOptions() {
  return {
    subcommand: 'skill-candidates',
    action: 'export',
    provider: 'codex',
    clientId: TEAM_PROVIDER_CLIENT_MAP.codex,
    sessionId: '',
    resumeSessionId: '',
    skillCandidateLimit: 0,
    draftId: '',
    outputPath: '',
    json: false,
  };
}

function normalizeQualityCategoryPrefixMode(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'any' || normalized === 'all') return normalized;
  throw new Error('--quality-category-prefix-mode must be one of: any, all');
}

function normalizeSinceIso(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    throw new Error('--since must be an ISO timestamp (e.g., 2026-04-06T00:00:00.000Z)');
  }
  return new Date(parsed).toISOString();
}

function parseTeamHistoryArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultTeamHistoryOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--provider':
        options.provider = normalizeTeamProvider(takeValue(rest, index, '--provider'));
        index += 1;
        break;
      case '--limit':
        options.limit = parsePositiveInteger(takeValue(rest, index, '--limit'), '--limit');
        index += 1;
        break;
      case '--concurrency':
        options.concurrency = parsePositiveInteger(takeValue(rest, index, '--concurrency'), '--concurrency');
        index += 1;
        break;
      case '--fast':
        options.fast = true;
        break;
      case '--quality-failed-only':
        options.qualityFailedOnly = true;
        break;
      case '--quality-category':
        options.qualityCategory = String(takeValue(rest, index, '--quality-category') ?? '').trim();
        index += 1;
        break;
      case '--quality-category-prefix':
        options.qualityCategoryPrefix = String(takeValue(rest, index, '--quality-category-prefix') ?? '').trim();
        index += 1;
        break;
      case '--quality-category-prefix-mode':
        options.qualityCategoryPrefixMode = normalizeQualityCategoryPrefixMode(takeValue(rest, index, '--quality-category-prefix-mode'));
        index += 1;
        break;
      case '--draft-id':
        options.draftId = String(takeValue(rest, index, '--draft-id') ?? '').trim();
        index += 1;
        break;
      case '--since':
        options.since = normalizeSinceIso(takeValue(rest, index, '--since'));
        index += 1;
        break;
      case '--status':
        options.status = String(takeValue(rest, index, '--status') ?? '').trim();
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.provider = normalizeTeamProvider(options.provider);
  options.clientId = TEAM_PROVIDER_CLIENT_MAP[options.provider];

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'team',
    options,
  };
}

function parseTeamSkillCandidatesArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultTeamSkillCandidatesExportOptions();
  let help = false;
  let index = 0;

  if (rest[0] && !String(rest[0]).startsWith('-')) {
    const action = String(rest[0] || '').trim().toLowerCase();
    if (!['list', 'export'].includes(action)) {
      throw new Error('team skill-candidates action must be one of: list, export');
    }
    options.action = action;
    index = 1;
  }

  for (; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--provider':
        options.provider = normalizeTeamProvider(takeValue(rest, index, '--provider'));
        index += 1;
        break;
      case '--session':
        options.sessionId = String(takeValue(rest, index, '--session') ?? '').trim();
        index += 1;
        break;
      case '--resume':
        options.resumeSessionId = String(takeValue(rest, index, '--resume') ?? '').trim();
        index += 1;
        break;
      case '--skill-candidate-limit':
        options.skillCandidateLimit = parsePositiveInteger(
          takeValue(rest, index, '--skill-candidate-limit'),
          '--skill-candidate-limit'
        );
        index += 1;
        break;
      case '--draft-id':
        options.draftId = String(takeValue(rest, index, '--draft-id') ?? '').trim();
        index += 1;
        break;
      case '--output':
        options.outputPath = String(takeValue(rest, index, '--output') ?? '').trim();
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.provider = normalizeTeamProvider(options.provider);
  options.clientId = TEAM_PROVIDER_CLIENT_MAP[options.provider];
  if (!options.sessionId && options.resumeSessionId) {
    options.sessionId = options.resumeSessionId;
  }
  if (options.action !== 'export' && options.outputPath) {
    throw new Error('--output is only supported by team skill-candidates export');
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'team',
    options,
  };
}

function parseTeamArgs(argv) {
  const rest = argv.slice(1);
  const subcommand = rest[0] && !rest[0].startsWith('-') ? String(rest[0]).trim().toLowerCase() : '';
  if (subcommand === 'status') {
    return parseTeamStatusArgs(argv);
  }
  if (subcommand === 'history') {
    return parseTeamHistoryArgs(argv);
  }
  if (subcommand === 'watchdog') {
    return parseTeamWatchdogArgs(argv);
  }
  if (subcommand === 'skill-candidates') {
    return parseTeamSkillCandidatesArgs(argv);
  }

  const options = createDefaultTeamOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (!arg.startsWith('-')) {
      const teamSpec = parseTeamSpec(arg);
      if (teamSpec) {
        options.workers = teamSpec.workers;
        options.provider = teamSpec.provider;
        continue;
      }
      options.taskTitle = options.taskTitle
        ? `${options.taskTitle} ${arg}`
        : arg;
      continue;
    }

    switch (arg) {
      case '--workers':
        options.workers = parsePositiveInteger(takeValue(rest, index, '--workers'), '--workers');
        index += 1;
        break;
      case '--provider':
        options.provider = normalizeTeamProvider(takeValue(rest, index, '--provider'));
        index += 1;
        break;
      case '--blueprint':
        options.blueprint = normalizeOrchestratorBlueprint(takeValue(rest, index, '--blueprint'));
        index += 1;
        break;
      case '--task':
        options.taskTitle = takeValue(rest, index, '--task');
        index += 1;
        break;
      case '--context':
        options.contextSummary = takeValue(rest, index, '--context');
        index += 1;
        break;
      case '--plan':
        options.planPath = takeValue(rest, index, '--plan');
        index += 1;
        break;
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--resume':
        options.resumeSessionId = takeValue(rest, index, '--resume');
        index += 1;
        break;
      case '--limit':
        options.limit = parsePositiveInteger(takeValue(rest, index, '--limit'), '--limit');
        index += 1;
        break;
      case '--recommendation':
        options.recommendationId = takeValue(rest, index, '--recommendation');
        index += 1;
        break;
      case '--preflight':
        options.preflightMode = normalizeOrchestratePreflightMode(takeValue(rest, index, '--preflight'));
        index += 1;
        break;
      case '--format':
        options.format = normalizeOrchestratorFormat(takeValue(rest, index, '--format'));
        index += 1;
        break;
      case '--retry-blocked':
        options.retryBlocked = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--dry-run':
        options.executionMode = 'dry-run';
        break;
      case '--live':
        options.executionMode = 'live';
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.provider = normalizeTeamProvider(options.provider);
  options.clientId = TEAM_PROVIDER_CLIENT_MAP[options.provider];
  options.teamSpec = `${options.workers}:${options.provider}`;
  if (!options.sessionId && options.resumeSessionId) {
    options.sessionId = options.resumeSessionId;
  }
  if (options.retryBlocked && !options.sessionId) {
    throw new Error('--retry-blocked requires --resume <session-id> or --session <session-id>');
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'team',
    options,
  };
}

function parseInternalArgs(argv) {
  const target = String(argv[0] || '').trim().toLowerCase();
  const action = String(argv[1] || '').trim().toLowerCase();
  if (!INTERNAL_TARGETS.has(target)) {
    throw new Error(`Unknown internal target: ${argv[0] || '<missing>'}`);
  }
  if (!action) {
    throw new Error(`Missing internal action for target: ${target}`);
  }

  const rest = argv.slice(2);
  let help = false;
  const options = { target, action };
  if (target === 'native' && action === 'repair') {
    options.repairAction = 'list';
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (target === 'native' && action === 'repair' && !arg.startsWith('-')) {
      const repairAction = String(arg || '').trim().toLowerCase();
      if (!['list', 'show'].includes(repairAction)) {
        throw new Error('native repair action must be one of: list, show');
      }
      options.repairAction = repairAction;
      continue;
    }

    switch (arg) {
      case '--mode':
        if (target === 'privacy') {
          options.mode = parsePrivacyMode(takeValue(rest, index, '--mode'));
        } else {
          options.mode = normalizeWrapMode(takeValue(rest, index, '--mode'));
        }
        index += 1;
        break;
      case '--client':
        options.client = normalizeClient(takeValue(rest, index, '--client'));
        index += 1;
        break;
      case '--scope':
        options.scope = normalizeSkillScope(takeValue(rest, index, '--scope'));
        index += 1;
        break;
      case '--skills':
        options.skills = normalizeSkillNames(takeValue(rest, index, '--skills'));
        index += 1;
        break;
      case '--install-mode':
        if (target !== 'skills') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.installMode = normalizeSkillInstallMode(takeValue(rest, index, '--install-mode'));
        index += 1;
        break;
      case '--rc-file':
        options.rcFile = takeValue(rest, index, '--rc-file');
        index += 1;
        break;
      case '--repo':
        options.repoUrl = takeValue(rest, index, '--repo');
        index += 1;
        break;
      case '--repair-id':
        if (target !== 'native' || (action !== 'rollback' && action !== 'repair')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.repairId = takeValue(rest, index, '--repair-id');
        index += 1;
        break;
      case '--limit':
        if (target !== 'native' || action !== 'repair') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.limit = parsePositiveInteger(takeValue(rest, index, '--limit'), '--limit');
        index += 1;
        break;
      case '--force':
        options.force = true;
        break;
      case '--update':
        options.update = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        if (target !== 'native' || action !== 'doctor') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.verbose = true;
        break;
      case '--fix':
        if (((target !== 'native' && target !== 'browser') || action !== 'doctor')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.fix = true;
        break;
      case '--skip-playwright-install':
        options.skipPlaywrightInstall = true;
        break;
      case '--enable':
        options.enable = true;
        break;
      case '--disable':
        options.disable = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'internal',
    options,
  };
}

function parseMemoArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const passthrough = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') {
      passthrough.push(...rest.slice(index + 1));
      break;
    }
    if (arg === '-h' || arg === '--help' || arg === 'help') {
      help = true;
      continue;
    }
    passthrough.push(arg);
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'memo',
    options: {
      argv: passthrough,
    },
  };
}

function parsePerceptionArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const options = {};

  let index = 0;
  if (rest[0] && !String(rest[0]).startsWith('-')) {
    options.subcommand = String(rest[0]).trim().toLowerCase();
    index = 1;
  }

  for (; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--space':
        options.space = takeValue(rest, index, '--space');
        index += 1;
        break;
      case '--format':
        options.format = takeValue(rest, index, '--format');
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--content-id':
        options.contentId = takeValue(rest, index, '--content-id');
        index += 1;
        break;
      case '--platform':
        options.platform = takeValue(rest, index, '--platform');
        index += 1;
        break;
      case '--content-type':
        options.contentType = takeValue(rest, index, '--content-type');
        index += 1;
        break;
      case '--title':
        options.title = takeValue(rest, index, '--title');
        index += 1;
        break;
      case '--publish-time':
        options.publishTime = takeValue(rest, index, '--publish-time');
        index += 1;
        break;
      case '--snapshot-window':
        options.snapshotWindow = takeValue(rest, index, '--snapshot-window');
        index += 1;
        break;
      case '--metrics':
        options.metrics = takeValue(rest, index, '--metrics');
        index += 1;
        break;
      case '--context':
        options.context = takeValue(rest, index, '--context');
        index += 1;
        break;
      case '--max-chars':
        options.maxChars = takeValue(rest, index, '--max-chars');
        index += 1;
        break;
      case '--min-sample':
        options.minSample = takeValue(rest, index, '--min-sample');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'perception',
    options,
  };
}

function getCommandDefaults(command) {
  if (command === 'setup') return createDefaultSetupOptions();
  if (command === 'update') return createDefaultUpdateOptions();
  if (command === 'uninstall') return createDefaultUninstallOptions();
  if (command === 'doctor') return createDefaultDoctorOptions();
  if (command === 'quality-gate') return createDefaultQualityGateOptions();
  if (command === 'orchestrate') return createDefaultOrchestrateOptions();
  if (command === 'entropy-gc') return createDefaultEntropyGcOptions();
  if (command === 'snapshot-rollback') return createDefaultSnapshotRollbackOptions();
  if (command === 'release-status') return createDefaultReleaseStatusOptions();
  return createDefaultLearnEvalOptions();
}

function parseTopLevelArgs(command, argv) {
  const rest = argv.slice(1);
  const defaults = getCommandDefaults(command);
  const options = { ...defaults };
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    if (command === 'quality-gate' && !arg.startsWith('-') && index === 0) {
      options.mode = normalizeQualityGateMode(arg);
      continue;
    }

    if (command === 'orchestrate' && !arg.startsWith('-') && index === 0) {
      options.blueprint = normalizeOrchestratorBlueprint(arg);
      continue;
    }

    if (command === 'entropy-gc' && !arg.startsWith('-') && index === 0) {
      options.mode = normalizeEntropyGcMode(arg);
      continue;
    }

    switch (arg) {
      case '--components':
        options.components = normalizeComponents(takeValue(rest, index, '--components'), defaults.components);
        index += 1;
        break;
      case '--mode':
        options.wrapMode = normalizeWrapMode(takeValue(rest, index, '--mode'));
        index += 1;
        break;
      case '--client':
        options.client = normalizeClient(takeValue(rest, index, '--client'));
        index += 1;
        break;
      case '--scope':
        if (command !== 'setup' && command !== 'update' && command !== 'uninstall') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.scope = normalizeSkillScope(takeValue(rest, index, '--scope'));
        index += 1;
        break;
      case '--skills':
        if (command !== 'setup' && command !== 'update' && command !== 'uninstall') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.skills = normalizeSkillNames(takeValue(rest, index, '--skills'));
        index += 1;
        break;
      case '--install-mode':
        if (command !== 'setup' && command !== 'update') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.installMode = normalizeSkillInstallMode(takeValue(rest, index, '--install-mode'));
        index += 1;
        break;
      case '--skip-playwright-install':
        options.skipPlaywrightInstall = true;
        break;
      case '--with-playwright-install':
        options.withPlaywrightInstall = true;
        break;
      case '--skip-doctor':
        options.skipDoctor = true;
        break;
      case '--strict':
        if (command === 'doctor' || command === 'release-status') {
          options.strict = true;
          break;
        }
        throw new Error(`Unknown option: ${arg}`);
      case '--min-samples':
        if (command !== 'release-status') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.minSamples = parsePositiveInteger(takeValue(rest, index, '--min-samples'), '--min-samples');
        index += 1;
        break;
      case '--max-failure-rate':
        if (command !== 'release-status') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.maxFailureRate = parseUnitInterval(takeValue(rest, index, '--max-failure-rate'), '--max-failure-rate');
        index += 1;
        break;
      case '--max-fallback-rate':
        if (command !== 'release-status') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.maxFallbackRate = parseUnitInterval(takeValue(rest, index, '--max-fallback-rate'), '--max-fallback-rate');
        index += 1;
        break;
      case '--output':
        if (command !== 'release-status') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.outputPath = takeValue(rest, index, '--output');
        index += 1;
        break;
      case '--history-output':
        if (command !== 'release-status') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.historyOutputPath = takeValue(rest, index, '--history-output');
        index += 1;
        break;
      case '--history-days':
        if (command !== 'release-status') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.historyDays = parsePositiveInteger(takeValue(rest, index, '--history-days'), '--history-days');
        index += 1;
        break;
      case '--global-security':
        options.globalSecurity = true;
        break;
      case '--native':
        if (command !== 'doctor') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.nativeOnly = true;
        break;
      case '--verbose':
        if (command !== 'doctor') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.verbose = true;
        break;
      case '--fix':
        if (command !== 'doctor') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.fix = true;
        break;
      case '--dry-run':
        if (command !== 'doctor' && command !== 'snapshot-rollback') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.dryRun = true;
        break;
      case '--profile':
        options.profile = normalizeHarnessProfile(takeValue(rest, index, '--profile'));
        index += 1;
        break;
      case '--task':
        options.taskTitle = takeValue(rest, index, '--task');
        index += 1;
        break;
      case '--context':
        options.contextSummary = takeValue(rest, index, '--context');
        index += 1;
        break;
      case '--plan':
        if (command !== 'orchestrate') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.planPath = takeValue(rest, index, '--plan');
        index += 1;
        break;
      case '--session':
        if (command !== 'learn-eval'
          && command !== 'orchestrate'
          && command !== 'quality-gate'
          && command !== 'entropy-gc'
          && command !== 'snapshot-rollback') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--manifest':
        if (command !== 'snapshot-rollback') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.manifestPath = takeValue(rest, index, '--manifest');
        index += 1;
        break;
      case '--job':
        if (command !== 'snapshot-rollback') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.jobId = takeValue(rest, index, '--job');
        index += 1;
        break;
      case '--state-path':
        if (command !== 'release-status') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.statePath = takeValue(rest, index, '--state-path');
        index += 1;
        break;
      case '--limit':
        if (command !== 'learn-eval' && command !== 'orchestrate') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.limit = parsePositiveInteger(takeValue(rest, index, '--limit'), '--limit');
        index += 1;
        break;
      case '--recent':
        if (command !== 'release-status') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.recent = parsePositiveInteger(takeValue(rest, index, '--recent'), '--recent');
        index += 1;
        break;
      case '--apply-draft':
        if (command !== 'learn-eval') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.applyDraftId = takeValue(rest, index, '--apply-draft');
        index += 1;
        break;
      case '--apply-drafts':
        if (command !== 'learn-eval') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.applyDrafts = true;
        break;
      case '--apply-dry-run':
        if (command !== 'learn-eval') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.applyDryRun = true;
        break;
      case '--recommendation':
        if (command !== 'orchestrate') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.recommendationId = takeValue(rest, index, '--recommendation');
        index += 1;
        break;
      case '--dispatch':
        if (command !== 'orchestrate') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.dispatchMode = normalizeOrchestrateDispatchMode(takeValue(rest, index, '--dispatch'));
        index += 1;
        break;
      case '--execute':
        if (command !== 'orchestrate') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.executionMode = normalizeOrchestrateExecutionMode(takeValue(rest, index, '--execute'));
        index += 1;
        break;
      case '--preflight':
        if (command !== 'orchestrate') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.preflightMode = normalizeOrchestratePreflightMode(takeValue(rest, index, '--preflight'));
        index += 1;
        break;
      case '--format': {
        const value = takeValue(rest, index, '--format');
        if (command === 'orchestrate') {
          options.format = normalizeOrchestratorFormat(value);
        } else if (command === 'learn-eval') {
          options.format = normalizeLearnEvalFormat(value);
        } else if (command === 'entropy-gc') {
          options.format = normalizeEntropyGcFormat(value);
        } else if (command === 'snapshot-rollback') {
          options.format = normalizeSnapshotRollbackFormat(value);
        } else if (command === 'release-status') {
          options.format = normalizeReleaseStatusFormat(value);
        } else {
          throw new Error(`Unknown option: ${arg}`);
        }
        index += 1;
        break;
      }
      case '--history-format':
        if (command !== 'release-status') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.historyFormat = normalizeReleaseStatusHistoryFormat(takeValue(rest, index, '--history-format'));
        index += 1;
        break;
      case '--retain':
        if (command !== 'entropy-gc') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.retain = parsePositiveInteger(takeValue(rest, index, '--retain'), '--retain');
        index += 1;
        break;
      case '--min-age-hours':
        if (command !== 'entropy-gc') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.minAgeHours = parsePositiveInteger(takeValue(rest, index, '--min-age-hours'), '--min-age-hours');
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command,
    options,
  };
}

export function parseArgs(argv = []) {
  if (argv.length === 0) {
    return {
      mode: 'interactive',
      help: false,
      command: 'tui',
      options: {},
    };
  }

  const first = String(argv[0] || '').trim().toLowerCase();
  if (first === '-h' || first === '--help' || first === 'help') {
    return {
      mode: 'help',
      help: true,
      command: 'root',
      options: {},
    };
  }

  if (first === 'memo') {
    return parseMemoArgs(argv);
  }

  if (first === 'perception') {
    return parsePerceptionArgs(argv);
  }

  if (first === 'model-router') {
    return parseModelRouterArgs(argv);
  }

function parseModelRouterArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const options = {};

  let index = 0;
  if (rest[0] && !String(rest[0]).startsWith('-')) {
    options.subcommand = String(rest[0]).trim().toLowerCase();
    index = 1;
  }

  for (; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--task':
      case '--prompt':
        options.task = takeValue(rest, index, arg);
        index += 1;
        break;
      case '--task-type':
        options.taskType = takeValue(rest, index, '--task-type');
        index += 1;
        break;
      case '--format':
        options.format = takeValue(rest, index, '--format');
        index += 1;
        break;
      case '--profile':
        options.profile = takeValue(rest, index, '--profile');
        index += 1;
        break;
      case '--explain':
        options.explain = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'model-router',
    options,
  };
}

  if (first === 'internal') {
    return parseInternalArgs(argv.slice(1));
  }

  if (first === 'team') {
    return parseTeamArgs(argv);
  }

  if (first === 'hud') {
    return parseHudArgs(argv);
  }

  if (first === 'harness') {
    return parseHarnessArgs(argv);
  }

  const command = first === 'verify'
    ? 'doctor'
    : first === 'quality' || first === 'quality-gate'
      ? 'quality-gate'
      : first === 'entropy'
        ? 'entropy-gc'
      : first === 'rollback-snapshot'
        ? 'snapshot-rollback'
      : first;

  if (!['setup', 'update', 'uninstall', 'doctor', 'quality-gate', 'orchestrate', 'team', 'hud', 'harness', 'learn-eval', 'entropy-gc', 'snapshot-rollback', 'release-status'].includes(command)) {
    throw new Error(`Unknown command: ${argv[0]}`);
  }

  return parseTopLevelArgs(command, argv);
}
