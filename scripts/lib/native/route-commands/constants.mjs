export const AIOS_ROUTE_COMMAND_BEGIN = '<!-- AIOS ROUTE COMMAND BEGIN -->';
export const AIOS_ROUTE_COMMAND_END = '<!-- AIOS ROUTE COMMAND END -->';

export const ROUTE_COMMANDS = [
  {
    route: 'single',
    description: 'AIOS route: single',
    purpose: 'keep this task in the current client.',
  },
  {
    route: 'plan',
    description: 'AIOS intelligent planning',
    purpose: 'force AIOS planning contract (writing-plans + docs/plans artifact), not host-only Plan UI.',
  },
  {
    route: 'subagent',
    description: 'AIOS route: subagent',
    purpose: 'run one staged AIOS subagent route with verification gates.',
  },
  {
    route: 'team',
    description: 'AIOS route: team',
    purpose: 'run an AIOS team route for independent parallel work-items.',
  },
  {
    route: 'harness',
    description: 'AIOS route: harness',
    purpose: 'run the AIOS solo harness for long-running resumable work.',
  },
];

export const CLIENT_LAYOUTS = {
  codex: {
    commandDir: 'prompts',
    extension: 'md',
    trigger: '/prompts',
    placeholder: '$ARGUMENTS',
    harnessProvider: 'codex',
  },
  claude: {
    commandDir: 'commands',
    extension: 'md',
    trigger: '',
    placeholder: '$ARGUMENTS',
    harnessProvider: 'claude',
  },
  gemini: {
    commandDir: 'commands',
    extension: 'toml',
    trigger: '',
    placeholder: '{{args}}',
    harnessProvider: 'gemini',
  },
  opencode: {
    commandDir: 'commands',
    extension: 'md',
    trigger: '',
    placeholder: '$ARGUMENTS',
    harnessProvider: 'opencode',
  },
  grok: {
    commandDir: 'commands',
    extension: 'md',
    trigger: '',
    placeholder: '$ARGUMENTS',
    harnessProvider: 'grok',
  },
  hermes: {
    commandDir: 'commands',
    extension: 'md',
    trigger: '',
    placeholder: '$ARGUMENTS',
    harnessProvider: 'hermes',
  },
};
