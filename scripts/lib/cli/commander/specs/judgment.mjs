export const JUDGMENT_COMMAND_SPECS = [
  {
    name: 'judgment',
    description: 'Opt-in System One judgment gate (default off; nothing calls a vendor until you enable it)',
    options: [
      ['--json', 'Output JSON'],
      ['--format <format>', 'Output format: text or json'],
      ['--vendor <name>', 'Judgment vendor (default: typesafe)'],
      ['--config <path>', 'Override the judgment config path'],
      ['--model <alias>', 'Model alias to request (enable)'],
      ['--act-floor <n>', 'Confidence at or above which the gate may act (enable)'],
      ['--confirm-floor <n>', 'Confidence below which the gate aborts (enable)'],
      ['--max-calls <n>', 'Session call budget (enable)'],
      ['--max-input-chars <n>', 'Request size budget in characters (enable)'],
      ['--probe', 'Send one real (metered) probe call after enabling'],
      ['--state <text|@file>', 'The state to evaluate (ask)'],
      ['--questions <json|@file>', 'JSON map of typed questions (ask)'],
      ['--risk <class>', 'Risk class: read-only, guarded, or destructive (ask)'],
    ],
  },
];
