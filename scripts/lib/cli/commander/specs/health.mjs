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
      ['--native-strict', 'Fail when native shims are missing, not first in PATH, or lack a real downstream client'],
    ],
  },
  {
    name: 'skill',
    description: 'Run AIOS skill compliance and health tools',
    options: [
      ['--client <client>', 'Target client'],
      ['--dry-run', 'Generate compliance spec/scenarios without live model execution'],
      ['--json', 'Output JSON'],
      ['--format <format>', 'Output format: text or json'],
      ['--dashboard', 'Render skill health dashboard'],
    ],
  },
  {
    name: 'session',
    description: 'Inspect AIOS session-local state',
    options: [
      ['--session <id>', 'Session id'],
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
