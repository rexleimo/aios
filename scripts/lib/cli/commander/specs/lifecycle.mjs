export const LIFECYCLE_COMMAND_SPECS = [
  {
    name: 'status',
    description: 'Show unified AIOS readiness status',
    options: [
      ['--format <format>', 'Output format'],
      ['--json', 'Output JSON'],
    ],
  },
  {
    name: 'agents',
    description: 'Inspect AIOS default agent catalogue',
    options: [
      ['--strict', 'Fail when candidate agents are not smoke-verified'],
      ['--format <format>', 'Output format'],
      ['--json', 'Output JSON'],
    ],
  },
  {
    name: 'setup',
    description: 'Install AIOS integrations',
    options: [
      ['--components <list>', 'Comma list of components to install'],
      ['--mode <mode>', 'Integration mode: all, repo-only, opt-in, off'],
      ['--client <client>', 'Target client'],
      ['--scope <scope>', 'Skill install scope'],
      ['--install-mode <mode>', 'Skill install mode'],
      ['--skills <list>', 'Comma list of skill names'],
      ['--adopt-legacy-superpowers', 'Explicit cleanup; preview first with the standalone reconciler --dry-run'],
      ['--skip-playwright-install', 'Skip browser-use runtime installation'],
      ['--skip-doctor', 'Skip post-install doctor checks'],
    ],
  },
  {
    name: 'update',
    description: 'Update Harness CLI and AIOS integrations',
    options: [
      ['--self-update', 'Refresh Harness CLI before component updates'],
      ['--skip-self-update', 'Only update selected integrations'],
      ['--components <list>', 'Comma list of components to update'],
      ['--mode <mode>', 'Integration mode: all, repo-only, opt-in, off'],
      ['--client <client>', 'Target client'],
      ['--scope <scope>', 'Skill install scope'],
      ['--install-mode <mode>', 'Skill install mode'],
      ['--skills <list>', 'Comma list of skill names'],
      ['--adopt-legacy-superpowers', 'Explicit cleanup; preview first with the standalone reconciler --dry-run'],
      ['--with-playwright-install', 'Force browser-use runtime installation'],
      ['--skip-doctor', 'Skip post-update doctor checks'],
    ],
  },
  {
    name: 'uninstall',
    description: 'Remove selected AIOS integrations',
    options: [
      ['--components <list>', 'Comma list of components to remove'],
      ['--client <client>', 'Target client'],
      ['--scope <scope>', 'Skill uninstall scope'],
      ['--skills <list>', 'Comma list of skill names'],
    ],
  },
];
