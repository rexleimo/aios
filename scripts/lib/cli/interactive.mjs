import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';

import { parseArgs } from './parse-args.mjs';

const INTERACTIVE_COMMANDS = [
  {
    name: 'tui',
    summary: 'Open the AIOS TUI',
    argv: [],
  },
  {
    name: 'doctor',
    summary: 'Verify AIOS installation and repo health',
    argv: ['doctor'],
  },
  {
    name: 'setup',
    summary: 'Install AIOS integrations',
    argv: ['setup'],
  },
  {
    name: 'help',
    summary: 'Print command help',
    argv: ['help'],
  },
];

export function createInteractiveCommandCatalog() {
  const program = new Command()
    .description('AIOS unified entry')
    .helpOption('-h, --help', 'display help for command');

  for (const item of INTERACTIVE_COMMANDS) {
    program.addCommand(new Command(item.name).description(item.summary));
  }

  return program;
}

export function createInteractiveChoices({ program = createInteractiveCommandCatalog(), color = chalk } = {}) {
  return program.commands.map((command) => {
    const item = INTERACTIVE_COMMANDS.find((candidate) => candidate.name === command.name());
    return {
      name: `${color.cyan(command.name().padEnd(6))} ${command.description()}`,
      value: command.name(),
      description: item?.summary || command.description(),
    };
  });
}

export async function chooseInteractiveCommand({ selectFn = select, color = chalk } = {}) {
  const chosen = await selectFn({
    message: color.bold('AIOS: choose a command'),
    choices: createInteractiveChoices({ color }),
  });
  const item = INTERACTIVE_COMMANDS.find((candidate) => candidate.name === chosen);
  if (!item || item.name === 'tui') {
    return {
      mode: 'interactive',
      help: false,
      command: 'tui',
      options: {},
    };
  }
  return parseArgs(item.argv);
}
