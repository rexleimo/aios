import { Command } from 'commander';

export function parseEvolutionArgs(argv = []) {
  const program = new Command()
    .name('evolution')
    .helpOption(false)
    .exitOverride()
    .allowUnknownOption(false);
  program
    .command('status')
    .description('Show self-evolution candidates and trigger status')
    .option('--json', 'Output JSON')
    .option('--min-candidates <n>', 'Candidate threshold')
    .option('--cooldown-hours <n>', 'Cooldown in hours');
  program
    .command('run')
    .description('Run proposal-only self-evolution consolidation')
    .option('--json', 'Output JSON')
    .option('--preview', 'Preview without writing a proposal')
    .option('--min-candidates <n>', 'Candidate threshold')
    .option('--cooldown-hours <n>', 'Cooldown in hours');

  try {
    program.parse(['node', 'evolution', ...argv.slice(1)]);
  } catch (error) {
    if (error?.code === 'commander.helpDisplayed') {
      return { mode: 'help', help: true, command: 'evolution', options: {} };
    }
    throw error;
  }

  const command = program.args[0] || 'status';
  const raw = program.commands.find((item) => item.name() === command);
  const options = raw?.opts?.() || {};
  return {
    mode: 'command',
    help: false,
    command: 'evolution',
    options: {
      subcommand: command,
      json: Boolean(options.json),
      preview: Boolean(options.preview),
      minCandidates: options.minCandidates ? Number(options.minCandidates) : undefined,
      cooldownHours: options.cooldownHours ? Number(options.cooldownHours) : undefined,
    },
  };
}
