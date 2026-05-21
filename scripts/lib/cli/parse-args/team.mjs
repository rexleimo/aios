import {
  createDefaultHarnessResumeOptions,
  createDefaultHarnessRunOptions,
  createDefaultHarnessStatusOptions,
  createDefaultHarnessStopOptions,
  createDefaultHudOptions,
  HARNESS_SUBCOMMANDS,
  SKILL_CANDIDATE_VIEWS,
  TEAM_PROVIDER_CLIENT_MAP,
  normalizeBaseRef,
  normalizeHarnessProfile,
  normalizeHudPreset,
  normalizeOrchestrateDispatchMode,
  normalizeOrchestrateExecutionMode,
  normalizeOrchestratePreflightMode,
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
  normalizeSkillCandidateView,
  normalizeSoloHarnessProvider,
  normalizeTeamProvider,
  parsePositiveInteger,
  parseTeamSpec,
  parseWatchInterval,
  takeValue,
} from "./shared.mjs";
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

export function parseTeamArgs(argv) {
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
