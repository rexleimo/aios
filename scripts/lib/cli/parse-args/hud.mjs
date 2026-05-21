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
export function parseHudArgs(argv) {
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
