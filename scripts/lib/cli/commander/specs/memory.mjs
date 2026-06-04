export const MEMORY_COMMAND_SPECS = [
  {
    name: 'memo',
    description: 'Workspace memo and pinned memory helpers',
  },
  {
    name: 'search',
    description: 'Search project memory, docs, plans, and code references',
    options: [
      ['--source <list>', 'Sources: memory, docs, plans, code, all'],
      ['--scope <scope>', 'Memo scope filter'],
      ['--agent <id>', 'Runtime client id for private memo visibility'],
      ['--space <name>', 'Memo space'],
      ['--workspace <path>', 'Workspace root'],
      ['--limit <n>', 'Result limit'],
      ['--format <format>', 'Output format'],
      ['--json', 'Output JSON'],
    ],
  },
];
