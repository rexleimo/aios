export const INTEGRATION_COMMAND_SPECS = [
  {
    name: 'integration',
    description: 'Install and verify third-party vendor integrations (skill + docs MCP)',
    options: [
      ['--json', 'Output JSON'],
      ['--format <format>', 'Output format: text or json'],
      ['--clients <list>', 'Comma list of clients, or "all"'],
      ['--scope <scope>', 'MCP registration scope: global or project'],
      ['--dry-run', 'Preview without writing anything'],
      ['--skip-skills', 'Only touch the MCP plane'],
      ['--skip-mcp', 'Only touch the skill plane'],
    ],
  },
];
