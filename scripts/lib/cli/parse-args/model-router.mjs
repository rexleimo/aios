/* 中文注释：model-router 解析独立于维护命令，便于后续扩展模型路由参数。 */
import { takeValue } from './shared.mjs';

export function parseModelRouterArgs(argv) {
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
