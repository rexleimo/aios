// scripts/lib/doctor/security-config/args.mjs — 统一参数解析
// 目标：消除手写 parseArgs 循环，基于 Commander 声明式解析
import { createCliParser } from '../../../../src/shared/cli-parser.mjs';

const cli = createCliParser({
  name: 'doctor-security-config',
  description: 'Scan workspace config files for security risks',
  options: [
    ['--workspace <path>', 'Scan this workspace root (default: git root or cwd)'],
    ['--global', 'Also scan small allowlisted global config files'],
    ['--strict', 'Exit non-zero when findings exist'],
  ],
});

export function usage() {
  return cli.program.helpInformation();
}

export function parseArgs(argv) {
  const parsed = cli.parse(argv);
  if (parsed.help) {
    return { workspace: '', scanGlobal: false, strict: false, help: true };
  }
  return {
    workspace: parsed.flags.workspace || '',
    scanGlobal: parsed.flags.global === true,
    strict: parsed.flags.strict === true,
    help: false,
  };
}
