import { Command } from 'commander';

import { parseArgs } from '../parse-args.mjs';
import { COMMAND_SPECS } from './specs/index.mjs';
import { argvFromActionCommand, getActionCommand, registerPassthroughCommand } from './runtime.mjs';

export function createAiosProgram({ version = 'unknown', dispatch } = {}) {
  if (typeof dispatch !== 'function') {
    throw new Error('createAiosProgram requires a dispatch function');
  }

  const program = new Command()
    .name('aios')
    .description('AIOS unified entry (Node-first CLI + TUI)')
    .version(`AIOS ${version}`, '-V, --version', 'Print the installed AIOS version')
    .option('-v, --legacy-version', 'Print the installed AIOS version')
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[args...]');

  program.action(async (...args) => {
    const actionCommand = getActionCommand(args);
    await dispatch(parseArgs(argvFromActionCommand(actionCommand)));
  });

  for (const spec of COMMAND_SPECS) {
    registerPassthroughCommand(program, spec, dispatch);
  }

  program
    .command('version')
    .description('Print the installed AIOS version')
    .helpOption(false)
    .action(async () => {
      await dispatch(parseArgs(['version']));
    });

  return program;
}
