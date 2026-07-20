export const BOOTSTRAP_COMMAND_SPECS = [
  {
    name: 'init',
    description: 'Initialize ContextDB registry markers for this project',
    options: [
      ['--agent <agent>', 'Init only the specified agent'],
      ['--all', 'Init all supported agents'],
      ['--dry-run', 'Preview changes without writing files'],
      ['--adopt-legacy-superpowers', 'Explicit cleanup; preview first with --dry-run'],
      ['--yes-compression-tools', 'Authorize unattended RTK/Caveman/Headroom installation'],
      ['--yes-headroom-mcp', 'Authorize unattended Gemini/Grok Headroom MCP registration'],
    ],
  },
];
