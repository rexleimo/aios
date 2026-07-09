export function getWorkflowCommandHelpText(command) {
  switch (command) {
    case 'workflow':
      return `Usage:
  node scripts/aios.mjs workflow list [options]
  node scripts/aios.mjs workflow run <workflowId> --dry-run [options]

Description:
  List and dry-run aios.workflow-recipe.v1 recipes. Workflow recipes are the
  AIOS-native equivalent of ECC orchestrate/plan/tdd/loop commands: they bind
  default agents to ordered stages and block live execution until evidence exists.

Options:
  --task <title>       (run) Task title recorded in the dry-run
  --dry-run            Required for workflow run until managed live evidence gates pass
  --format <text|json>
  --json
  -h, --help
`;
    case 'orchestrate':
      return `Usage:
  node scripts/aios.mjs orchestrate [feature|bugfix|refactor|security] [options]
  node scripts/aios.mjs orchestrate --session <id> [options]

Options:
  --task <title>
  --context <summary>
  --plan <path>                 Plan artifact required by --preflight auto readiness checks
  --session <id>                 Load structured learn-eval recommendations for this session
  --limit <n>                   Number of checkpoints to inspect when loading learn-eval
  --recommendation <targetId>   Pin a specific learn-eval recommendation to the overlay
  --dispatch <none|local>       Build a local dispatch skeleton (defaults to local when omitted)
  --execute <none|dry-run|live> Execute dispatch through the selected runtime (defaults to dry-run; live is opt-in via AIOS_EXECUTE_LIVE=1 + AIOS_SUBAGENT_CLIENT=<codex-cli|claude-code|gemini-cli>)
  --force                       Override live safety guards (retry-blocked instability and unknown capability surfaces)
  --preflight <none|auto>       Run supported local gate/runbook actions before final DAG selection
  AIOS_SUBAGENT_PRE_MUTATION_SNAPSHOT=1 (env) In live mode, capture pre-mutation backups for editable phase owned paths before each subagent run
  --format <text|json>
  -h, --help
`;
    case 'team':
      return `Usage:
  node scripts/aios.mjs team [<workers:provider>] [task] [options]
  node scripts/aios.mjs team status [options]
  node scripts/aios.mjs team watchdog [options]
  node scripts/aios.mjs team history [options]
  node scripts/aios.mjs team skill-candidates [list|export] [options]

Examples:
  node scripts/aios.mjs team 3:codex "Ship X"
  node scripts/aios.mjs team 2:claude --session <id>
  node scripts/aios.mjs team --resume <id> --retry-blocked --provider codex --workers 2
  node scripts/aios.mjs team --provider gemini --workers 2 --task "Refactor Y" --dry-run
  node scripts/aios.mjs team status --provider codex --watch
  node scripts/aios.mjs team watchdog --session <id> --json
  node scripts/aios.mjs team status --session <id> --show-skill-candidates detail --export-skill-candidate-patch-template
  node scripts/aios.mjs team history --provider claude --limit 10
  node scripts/aios.mjs team skill-candidates list --session <id> --draft-id <targetId> --json
  node scripts/aios.mjs team skill-candidates export --session <id> --draft-id <targetId>

Options:
  --workers <n>                 Team worker concurrency (default: 3)
  --provider <codex|claude|gemini>
  --blueprint <feature|bugfix|refactor|security>
  --task <title>
  --context <summary>
  --plan <path>                 Plan artifact required by --preflight auto readiness checks
  --session <id>
  --resume <id>                 Resume from a prior orchestration session
  --limit <n>
  --recommendation <targetId>
  --preflight <none|auto>
  --retry-blocked               Replay only blocked jobs from latest dispatch artifact in the session
  --force                       Override live safety guards (retry-blocked instability and unknown capability surfaces)
  --format <text|json>
  --dry-run                     Local dispatch dry-run (no model calls)
  --live                        Force live execution (default)
  --watch                       (team status) Refresh display on an interval (TTY-only)
  --json                        (team status/history/skill-candidates list|export) Output structured JSON instead of text
  --watchdog                    (team status) Include watchdog recovery decision in JSON/text state
  --concurrency <n>             (team history) Process sessions concurrently (default: 4)
  --fast                        (team history) Skip dispatch hindsight evaluation for faster scans
  --show-skill-candidates [inline|detail] (team status) Show skill-candidate artifact rows (default mode: inline; "detail" prints candidate view directly)
  --skill-candidate-view <inline|detail> (team status) Explicitly choose how skill candidates are rendered
  --skill-candidate-limit <n>   (team status/hud/skill-candidates export) Cap detailed skill-candidate rows (implies --show-skill-candidates; default 6, team status --watch --fast defaults to 3)
  --draft-id <targetId>          (team status/history/hud/skill-candidates export) Filter skill-candidate rows/export by sourceDraftTargetId
  --output <path>               (team skill-candidates export) Write patch-template artifact to an explicit path
  --export-skill-candidate-patch-template (team status/hud) Export apply_patch templates derived from surfaced skill-candidate artifacts
  --quality-failed-only         (team history) Only include sessions with failed quality-gate outcomes
  --quality-category <name>     (team history) Only include sessions with failed quality-gate category match
  --quality-category-prefix <name> (team history) Only include sessions with failed quality-gate category prefix match (comma-separated)
  --quality-category-prefix-mode <any|all> (team history) Prefix matching mode (default: any)
  --fast                        (team status/hud) In --watch + minimal preset, skip heavy reads and throttle state refresh to ~1s
  --no-fast                     (team status/hud) Force disable fast mode (overrides auto-fast)
  --since <iso>                 (team history) Only include sessions updated at/after ISO timestamp
  --status <value>              (team history) Only include sessions with matching meta.status
  --preset <minimal|focused|full> (team status) Rendering preset (default: focused; with --watch defaults to minimal unless --preset provided)
  --interval-ms <n|auto>        (team status) Watch refresh interval (default: 1000; use "auto" for 250-2000ms adaptive cadence; auto-fast enabled when <=500 or auto with watch+minimal)
  AIOS_WATCH_STALLED_MS=<ms>    (env) Mark watch output as stalled when job/tool progress is unchanged beyond threshold (default: 30000)
  -h, --help
`;
    case 'harness':
      return `Usage:
  node scripts/aios.mjs harness run --objective <text> [options]
  node scripts/aios.mjs harness status --session <id> [options]
  node scripts/aios.mjs harness resume --session <id> [options]
  node scripts/aios.mjs harness stop --session <id> [options]

Examples:
  node scripts/aios.mjs harness run --objective "Ship release checklist" --worktree
  node scripts/aios.mjs harness run --objective "Draft tomorrow handoff" --session demo-session --dry-run --json
  node scripts/aios.mjs harness status --session demo-session --json
  node scripts/aios.mjs harness resume --session demo-session
  node scripts/aios.mjs harness stop --session demo-session

Options:
  --objective <text>            (run) Required objective for a new solo harness run
  --session <id>                Explicit ContextDB session id
  --workspace <path>            Workspace root for ContextDB session artifacts (default: current directory)
  --provider <codex|claude|gemini|opencode|hermes|grok> (run) Provider used by the solo harness
  --profile <minimal|standard|strict> (run) Harness profile for surrounding checks
  --worktree                    (run) Execute inside an isolated git worktree
  --base-ref <ref>              (run) Git ref used to seed worktree mode (default: HEAD)
  --max-iterations <n>          (run/resume) Iteration budget for the solo loop (default: 20)
  --hooks / --no-hooks          (run/resume) Enable or disable lifecycle hook evidence logging (default: enabled)
  --reason <text>               (stop) Operator note recorded in control.json
  --dry-run                     (run) Create/update the journal without invoking a provider
  --json                        Output structured JSON instead of text
  -h, --help
`;
    case 'hud':
      return `Usage:
  node scripts/aios.mjs hud [options]

Options:
  --session <id>                Explicit ContextDB session id
  --workspace <path>            Workspace root for ContextDB session artifacts (default: current directory)
  --provider <codex|claude|gemini>
  --preset <minimal|focused|full> Rendering preset (default: focused; with --watch defaults to minimal unless --preset provided)
  --watch                       Refresh display on an interval (TTY-only)
  --fast                        In --watch + minimal preset, skip heavy reads and throttle state refresh to ~1s
  --no-fast                     Force disable fast mode (overrides auto-fast)
  --watchdog                    Include watchdog decision + readiness (computed from worker signals)
  --show-skill-candidates [inline|detail] Show skill-candidate artifact rows (default mode: inline; "detail" prints candidate view directly)
  --skill-candidate-view <inline|detail> Explicitly choose how skill candidates are rendered
  --skill-candidate-limit <n>   Cap detailed skill-candidate rows (implies --show-skill-candidates, default 6)
  --draft-id <targetId>         Filter skill-candidate rows/export by sourceDraftTargetId
  --export-skill-candidate-patch-template Export apply_patch templates derived from surfaced skill-candidate artifacts
  --interval-ms <n|auto>        Watch refresh interval (default: 1000; use "auto" for 250-2000ms adaptive cadence; auto-fast enabled when <=500 or auto with watch+minimal)
  AIOS_WATCH_STALLED_MS=<ms>    (env) Mark watch output as stalled when job/tool progress is unchanged beyond threshold (default: 30000)
  --json                        Output structured JSON instead of text
  -h, --help
`;
    case 'learn-eval':
      return `Usage:
  node scripts/aios.mjs learn-eval [options]

Options:
  --session <id>
  --limit <n>
  --format <text|json>
  --apply-draft <targetId>      Apply a single draft.* recommendation action
  --apply-drafts                Apply all draft.* recommendation actions in priority order
  --apply-dry-run               Preview draft actions without executing
  -h, --help
`;
    default:
      return '';
  }
}
