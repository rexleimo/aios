export const INSIGHT_COMMAND_SPECS = [
  {
    name: 'learn-eval',
    description: 'Turn checkpoint telemetry into operator recommendations',
    options: [
      ['--session <id>', 'ContextDB session id'],
      ['--limit <n>', 'Recommendation limit'],
      ['--format <format>', 'Output format'],
      ['--apply-draft <id>', 'Apply one draft recommendation'],
      ['--apply-drafts', 'Apply all draft recommendations'],
      ['--apply-dry-run', 'Preview draft actions'],
    ],
  },
  {
    name: 'entropy-gc',
    description: 'Auto-archive stale ContextDB artifacts',
    aliases: ['entropy'],
    options: [
      ['--session <id>', 'ContextDB session id'],
      ['--retain <n>', 'Dispatch artifact retain count'],
      ['--min-age-hours <n>', 'Minimum artifact age'],
      ['--format <format>', 'Output format'],
    ],
  },
  {
    name: 'snapshot-rollback',
    description: 'Restore pre-mutation snapshot artifacts',
    aliases: ['rollback-snapshot'],
    options: [
      ['--manifest <path>', 'Explicit snapshot manifest path'],
      ['--session <id>', 'ContextDB session id'],
      ['--job <id>', 'Job id filter'],
      ['--dry-run', 'Preview restore actions'],
      ['--format <format>', 'Output format'],
    ],
  },
  {
    name: 'release-status',
    description: 'Show RL policy release gate state and recent trend',
    options: [
      ['--state-path <path>', 'Release gate state file path'],
      ['--recent <n>', 'Recent trend window'],
      ['--strict', 'Enforce health gate'],
      ['--min-samples <n>', 'Minimum strict samples'],
      ['--max-failure-rate <rate>', 'Maximum failure rate'],
      ['--max-fallback-rate <rate>', 'Maximum fallback rate'],
      ['--output <path>', 'Report output path'],
      ['--history-output <path>', 'History export path'],
      ['--history-format <format>', 'History export format'],
      ['--history-days <n>', 'History export day count'],
      ['--format <format>', 'Output format'],
    ],
  },
];
