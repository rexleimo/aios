/* 中文注释：refs/canvas 同属离线输出召回入口，共用 session、storage、workspace 解析约定。 */
import { takeValue } from './shared.mjs';

export function parseRefsArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const options = { subcommand: 'list', session: '', limit: '20', keepDays: '30', pattern: '', nodeId: '', storage: '', workspaceRoot: '' };

  /* 中文注释：refs 子命令默认 list；grep/read/prune 显式出现时切换解析目标。 */
  if (rest[0] && !String(rest[0]).startsWith('-')) {
    const sub = String(rest[0]).trim().toLowerCase();
    if (['grep', 'read', 'list', 'prune'].includes(sub)) {
      options.subcommand = sub;
      rest.shift();
    }
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    switch (arg) {
      case '--session':
        options.session = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--limit':
        options.limit = takeValue(rest, index, '--limit');
        index += 1;
        break;
      case '--keep-days':
        options.keepDays = takeValue(rest, index, '--keep-days');
        index += 1;
        break;
      case '--storage':
        options.storage = takeValue(rest, index, '--storage');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      default:
        if (!arg.startsWith('-')) {
          if (options.subcommand === 'grep' && !options.pattern) {
            options.pattern = arg;
          } else if (options.subcommand === 'read' && !options.nodeId) {
            options.nodeId = arg;
          }
        } else {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }
  return { mode: help ? 'help' : 'command', help, command: 'refs', options };
}

/* 中文注释：canvas 是 offload 历史视图入口，和 refs 共用 workspace/storage 参数。 */
export function parseCanvasArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const options = { subcommand: 'show', session: 'default', format: 'mmd', storage: '', client: '', inputPath: '', workspaceRoot: '' };

  if (rest[0] && !String(rest[0]).startsWith('-')) {
    const sub = String(rest[0]).trim().toLowerCase();
    if (['show', 'path', 'backfill'].includes(sub)) {
      options.subcommand = sub;
      rest.shift();
    }
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    switch (arg) {
      case '--session':
        options.session = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--format':
        options.format = takeValue(rest, index, '--format');
        index += 1;
        break;
      case '--storage':
        options.storage = takeValue(rest, index, '--storage');
        index += 1;
        break;
      case '--client':
        options.client = takeValue(rest, index, '--client');
        index += 1;
        break;
      case '--input':
      case '--input-path':
        options.inputPath = takeValue(rest, index, arg);
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
  return { mode: help ? 'help' : 'command', help, command: 'canvas', options };
}
