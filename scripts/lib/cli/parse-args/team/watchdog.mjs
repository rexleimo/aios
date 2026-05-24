/* 中文注释：team watchdog 解析只保留自动恢复巡检需要的参数。 */
import { normalizeTeamProvider, parsePositiveInteger, takeValue } from '../shared.mjs';
import { createDefaultTeamWatchdogOptions } from './defaults.mjs';
import { finalizeTeamProvider, hydrateSessionFromResume } from './shared.mjs';

export function parseTeamWatchdogArgs(argv) {
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

  finalizeTeamProvider(options);
  hydrateSessionFromResume(options);
  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'team',
    options,
  };
}
