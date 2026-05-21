export const BOOTSTRAP_COMMAND_SPECS = [
  {
    name: 'init',
    description: 'Initialize ContextDB registry markers for this project',
    options: [
      ['--agent <agent>', 'Init only the specified agent'],
      ['--all', 'Init all supported agents'],
      ['--dry-run', 'Preview changes without writing files'],
    ],
  },
];
