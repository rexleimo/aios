/* 中文注释：init 解析只校验 agent 名称和初始化开关，保持入口可预测。 */
import { INIT_AGENT_NAMES, takeValue } from './shared.mjs';

export function parseInitArgs(argv) {
  const rest = argv.slice(1);
  const options = {
    agent: '',
    all: false,
    dryRun: false,
    defaultMode: '',
  };
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--agent': {
        const agent = String(takeValue(rest, index, '--agent')).trim().toLowerCase();
        if (!INIT_AGENT_NAMES.has(agent)) {
          throw new Error(`--agent must be one of: ${[...INIT_AGENT_NAMES].join(', ')}`);
        }
        options.agent = agent;
        index += 1;
        break;
      }
      case '--default-mode': {
        options.defaultMode = String(takeValue(rest, index, '--default-mode')).trim();
        index += 1;
        break;
      }
      case '--all':
        options.all = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'init',
    options,
  };
}
