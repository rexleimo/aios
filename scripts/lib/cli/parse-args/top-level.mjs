/* 中文注释：顶层参数解析器只做命令级调度，具体选项归属拆到 top-level/*。 */
import { applyComponentOption } from './top-level/component-options.mjs';
import { getCommandDefaults } from './top-level/defaults.mjs';
import { applyDoctorOption } from './top-level/doctor-options.mjs';
import { applyTopLevelPositional } from './top-level/positionals.mjs';
import { applyReleaseStatusOption } from './top-level/release-options.mjs';
import { applyWorkflowOption } from './top-level/workflow-options.mjs';

const OPTION_HANDLERS = Object.freeze([
  applyComponentOption,
  applyDoctorOption,
  applyWorkflowOption,
  applyReleaseStatusOption,
]);

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

    if (applyTopLevelPositional(command, options, arg, index)) {
      continue;
    }

    let consumed = null;
    for (const handler of OPTION_HANDLERS) {
      consumed = handler({ command, options, defaults, rest, index, arg });
      if (consumed !== null) break;
    }
    if (consumed === null) {
      throw new Error(`Unknown option: ${arg}`);
    }
    index += consumed;
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command,
    options,
  };
}
