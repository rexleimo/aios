export const WORK_COMMAND_SPECS = [
  {
    name: 'work',
    description: 'Run a task through automatic planning and concurrent multi-agent dispatch (live by default)',
    options: [
      ['--task <title>', 'Task title'],
      ['--context <summary>', 'Context summary'],
      ['--client <id>', 'Subagent client id'],
      ['--concurrency <n>', 'Subagent concurrency'],
      ['--serial', 'Force serial execution (concurrency=1)'],
      ['--dry-run', 'Zero-cost preview, no client spawn'],
      ['--blueprint <name>', 'Orchestrate blueprint'],
      ['--plan <path>', 'Plan file path'],
      ['--session <id>', 'ContextDB session id'],
      ['--resume <id>', 'Resume from session id'],
      ['--retry-blocked', 'Replay blocked jobs'],
      ['--force', 'Override safety guards'],
      ['--preflight <mode>', 'Preflight mode'],
      ['--format <format>', 'Output format'],
      ['--json', 'Output JSON'],
    ],
  },
];
