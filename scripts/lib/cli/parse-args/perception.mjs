/* 中文注释：perception 解析只负责内容反馈入口，不和通用维护命令混写。 */
import { takeValue } from './shared.mjs';

export function parsePerceptionArgs(argv) {
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
