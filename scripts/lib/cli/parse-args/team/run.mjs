/* 中文注释：team run 解析只负责启动多客户端团队，不处理 status/history/watchdog。 */
import {
  normalizeOrchestratePreflightMode,
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
  normalizeTeamProvider,
  parsePositiveInteger,
  parseTeamSpec,
  takeValue,
} from '../shared.mjs';
import { createDefaultTeamOptions } from './defaults.mjs';
import { finalizeTeamProvider, hydrateSessionFromResume } from './shared.mjs';

export function parseTeamRunArgs(argv, rest) {
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

  finalizeTeamProvider(options);
  options.teamSpec = `${options.workers}:${options.provider}`;
  hydrateSessionFromResume(options);
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
