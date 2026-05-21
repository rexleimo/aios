import {
  createDefaultDoctorOptions,
  createDefaultEntropyGcOptions,
  createDefaultLearnEvalOptions,
  createDefaultOrchestrateOptions,
  createDefaultQualityGateOptions,
  createDefaultReleaseStatusOptions,
  createDefaultSetupOptions,
  createDefaultSnapshotRollbackOptions,
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
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeSnapshotRollbackFormat,
  normalizeWrapMode,
  parsePositiveInteger,
  parseUnitInterval,
  takeValue,
} from "./shared.mjs";

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

export function parseTopLevelArgs(command, argv) {
  const rest = argv.slice(1);
  const defaults = getCommandDefaults(command);
  const options = { ...defaults };
  if (command === 'update') {
    options.selfUpdate = true;
  }
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
      case '--self-update':
        if (command !== 'update') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.selfUpdate = true;
        break;
      case '--skip-self-update':
        if (command !== 'update') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.selfUpdate = false;
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
