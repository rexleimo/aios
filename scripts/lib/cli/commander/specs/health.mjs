export const HEALTH_COMMAND_SPECS = [
  {
    name: 'doctor',
    description: 'Verify AIOS installation and repo health',
    aliases: ['verify'],
    options: [
      ['--strict', 'Enable strict checks'],
      ['--global-security', 'Include global security checks'],
      ['--client <client>', 'Target client'],
      ['--native', 'Run native enhancement checks only'],
      ['--verbose', 'Print detailed checks'],
      ['--fix', 'Apply supported repairs'],
      ['--dry-run', 'Preview repairs without writing'],
      ['--profile <profile>', 'Quality profile'],
    ],
  },
  {
    name: 'clients',
    description: 'Report strict rollout status for AIOS-supported clients',
    options: [
      ['--json', 'Output JSON'],
      ['--format <format>', 'Output format: text or json'],
    ],
  },
  {
    name: 'quality-gate',
    description: 'Run repo quality checks with harness profiles',
    aliases: ['quality'],
    options: [
      ['--profile <profile>', 'Quality profile'],
      ['--global-security', 'Include global security checks'],
      ['--session <id>', 'ContextDB session id'],
    ],
  },
];
