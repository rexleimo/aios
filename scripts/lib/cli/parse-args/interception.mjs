/* 中文注释：interception 参数解析独立成模块，避免 maintenance 解析器继续膨胀。 */
import { takeValue } from './shared.mjs';

const INTERCEPTION_SUBCOMMANDS = new Set(['doctor', 'proof', 'mcp-migrate']);

/* 中文注释：只解析 interception 的验证/修复入口，不掺杂 refs、canvas 或内部维护命令。 */
export function parseInterceptionArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const options = { subcommand: 'doctor', session: '', json: false, fix: false, dryRun: false, workspaceRoot: '' };

  if (rest[0] && !String(rest[0]).startsWith('-')) {
    const sub = String(rest[0]).trim().toLowerCase();
    if (!INTERCEPTION_SUBCOMMANDS.has(sub)) {
      throw new Error('interception subcommand must be one of: doctor, proof, mcp-migrate');
    }
    options.subcommand = sub;
    rest.shift();
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '-h' || arg === '--help') { help = true; continue; }
    switch (arg) {
      case '--session':
        options.session = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      case '--fix':
        options.fix = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { mode: help ? 'help' : 'command', help, command: 'interception', options };
}
