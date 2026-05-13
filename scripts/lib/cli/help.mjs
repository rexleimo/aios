export function getRootHelpText() {
  return `AIOS unified entry (Node-first CLI + TUI)

Usage:
  node scripts/aios.mjs
  node scripts/aios.mjs <command> [options]

Commands:
  setup         Install AIOS integrations
  update        Update AIOS integrations
  uninstall     Remove selected AIOS integrations
  doctor        Verify AIOS installation and repo health
  memo          Workspace memo + pinned memory helpers
  perception    Content outcome recording, insight generation, and perception summary
  quality-gate  Run repo quality checks with harness profiles
  orchestrate   Preview reusable subagent workflow blueprints
  team          One-click multi-client live team runtime (codex/claude/gemini/kiro)
  harness       Solo overnight harness with run journal + resume controls
  hud           Show ContextDB + dispatch HUD (CLI/TUI)
  learn-eval    Turn checkpoint telemetry into operator recommendations
  entropy-gc    Auto-archive stale ContextDB artifacts with rollback manifests
  snapshot-rollback Restore pre-mutation snapshot artifacts (manifest-driven)
  release-status Show RL policy release gate state and recent trend

Examples:
  node scripts/aios.mjs setup --components all --mode opt-in --client all
  node scripts/aios.mjs update --components shell,skills,native --skip-doctor
  node scripts/aios.mjs uninstall --components shell,skills,native
  node scripts/aios.mjs doctor --strict --native --verbose --profile standard
  node scripts/aios.mjs doctor --native --fix --dry-run
  node scripts/aios.mjs internal native repair list --limit 20
  node scripts/aios.mjs internal native repair show --repair-id latest
  node scripts/aios.mjs internal native rollback --repair-id latest
  node scripts/aios.mjs memo add "note #tag"
  node scripts/aios.mjs quality-gate pre-pr --profile strict
  node scripts/aios.mjs orchestrate feature --task "Ship orchestrator blueprints"
  node scripts/aios.mjs team 3:codex "Ship orchestrator blueprints"
  node scripts/aios.mjs team 2:claude --session codex-cli-20260303T080437-065e16c0 --dry-run
  node scripts/aios.mjs harness run --objective "Ship release checklist" --worktree
  node scripts/aios.mjs harness status --session codex-cli-20260303T080437-065e16c0 --json
  node scripts/aios.mjs hud --provider codex
  node scripts/aios.mjs hud --watch --preset focused
  node scripts/aios.mjs team status --provider codex --watch
  node scripts/aios.mjs orchestrate --session codex-cli-20260303T080437-065e16c0 --format json
  node scripts/aios.mjs learn-eval --limit 5
  node scripts/aios.mjs entropy-gc auto --session codex-cli-20260303T080437-065e16c0
  node scripts/aios.mjs snapshot-rollback --session codex-cli-20260303T080437-065e16c0 --job phase.implement --dry-run
  node scripts/aios.mjs release-status --recent 12
  node scripts/aios.mjs perception record --content-id note_001 --platform xiaohongshu --content-type note --title "test" --metrics '{"likes":100}'
  node scripts/aios.mjs perception insights --min-sample 3
  node scripts/aios.mjs perception summary --format json
  node scripts/aios.mjs internal browser doctor --fix
  node scripts/aios.mjs internal browser mcp-migrate
  node scripts/aios.mjs internal browser cdp-start
  node scripts/aios.mjs internal browser cdp-status
`;
}

export function getCommandHelpText(command) {
  switch (command) {
    case 'setup':
      return `Usage:
  node scripts/aios.mjs setup [options]

Options:
  --components <list>            Comma list: browser,shell,skills,native,agents,superpowers (default: browser,shell,skills,native,superpowers)
  --mode <all|repo-only|opt-in|off>
  --client <all|codex|claude|gemini|opencode|kiro>
  --scope <global|project>       Skills install scope (default: global)
  --install-mode <copy|link>     Skills install mode (default: copy)
  --skills <list>                Comma list of skill names to install
  --skip-playwright-install     Skip browser-use runtime installation (legacy flag name)
  --skip-doctor
  -h, --help
`;
    case 'update':
      return `Usage:
  node scripts/aios.mjs update [options]

Options:
  --components <list>            Comma list: browser,shell,skills,native,agents,superpowers (default: browser,shell,skills,native,superpowers)
  --mode <all|repo-only|opt-in|off>
  --client <all|codex|claude|gemini|opencode|kiro>
  --scope <global|project>       Skills install scope (default: global)
  --install-mode <copy|link>     Skills install mode (default: copy)
  --skills <list>                Comma list of skill names to install
  --with-playwright-install     Force browser-use runtime installation (legacy flag name)
  --skip-doctor
  -h, --help
`;
    case 'uninstall':
      return `Usage:
  node scripts/aios.mjs uninstall [options]

Options:
  --components <list>            Comma list: shell,skills,native,agents,browser,superpowers (default: shell,skills)
  --client <all|codex|claude|gemini|opencode|kiro>
  --scope <global|project>       Skills uninstall scope (default: global)
  --skills <list>                Comma list of skill names to uninstall
  -h, --help
`;
    case 'doctor':
      return `Usage:
  node scripts/aios.mjs doctor [options]

Options:
  --strict
  --global-security
  --native
  --verbose
  --fix
  --dry-run
  --profile <minimal|standard|strict>
  -h, --help
`;
    case 'memo':
      return `Usage:
  node scripts/aios.mjs memo <subcommand> [options]

Subcommands:
  use <space>                         Set active workspace memory space
  space list                          List existing spaces
  add <text>                          Append memo event (supports #tag)
  list [--limit N]                    List recent memos (default: 20)
  search <query> [--limit N] [--semantic]
                                      Search memos in current space
  pin show                            Print pinned memory for current space
  pin set <text>                      Replace pinned memory for current space
  pin add <text>                      Append to pinned memory for current space
  persona init|show|path              Initialize/read global persona baseline
  persona set <text>                  Replace global persona baseline
  persona add <text>                  Append to global persona baseline
  user init|show|path                 Initialize/read global user profile memory
  user set <text>                     Replace global user profile memory
  user add <text>                     Append to global user profile memory
  recall [query] [--limit N] [--highlight-limit N]
                                      Human-readable session recall digest

Environment:
  WORKSPACE_MEMORY_SPACE              Override active space for this run
  WORKSPACE_MEMORY_MEMO_ENTRY_MAX_CHARS
                                      Max chars for a single memo add payload
  WORKSPACE_MEMORY_PINNED_MAX_CHARS   Max chars for pinned memory content
  AIOS_IDENTITY_HOME                  Default directory for SOUL.md/USER.md
  AIOS_PERSONA_PATH                   Explicit global persona file path
  AIOS_PERSONA_MAX_CHARS              Max chars for global persona memory
  AIOS_USER_PROFILE_PATH              Explicit global user profile file path
  AIOS_USER_PROFILE_MAX_CHARS         Max chars for global user profile memory
`;
    case 'quality-gate':
      return `Usage:
  node scripts/aios.mjs quality-gate [quick|full|pre-pr] [options]

Options:
  --profile <minimal|standard|strict>
  --global-security
  --session <id>
  AIOS_RELEASE_GATE_MIN_SAMPLES=<n>        (env) Override release strict gate sample floor (default: 8)
  AIOS_RELEASE_GATE_MAX_FAILURE_RATE=<0-1> (env) Override release strict gate max failure rate (default: 0.2)
  AIOS_RELEASE_GATE_MAX_FALLBACK_RATE=<0-1> (env) Override release strict gate max fallback rate (default: 0.1)
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
  --execute <none|dry-run|live> Execute dispatch through the selected runtime (defaults to dry-run; live is opt-in via AIOS_EXECUTE_LIVE=1 + AIOS_SUBAGENT_CLIENT=<codex-cli|claude-code|gemini-cli|opencode-cli|kiro-cli>)
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
  --provider <codex|claude|gemini|kiro>
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
  --provider <codex|claude|gemini|opencode|kiro> (run) Provider used by the solo harness
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
  --provider <codex|claude|gemini|kiro>
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
    case 'entropy-gc':
      return `Usage:
  node scripts/aios.mjs entropy-gc [dry-run|auto|off] [options]

Options:
  --session <id>                 Required session id to clean
  --retain <n>                   Keep latest n dispatch artifacts (default: 5)
  --min-age-hours <n>            Only archive files older than n hours (default: 24)
  --format <text|json>
  -h, --help
`;
    case 'snapshot-rollback':
      return `Usage:
  node scripts/aios.mjs snapshot-rollback [options]

Options:
  --manifest <path>              Explicit snapshot manifest path (relative to workspace or absolute)
  --session <id>                 Auto-select latest snapshot manifest under session artifacts
  --job <jobId>                  Optional job filter when auto-selecting snapshot manifest
  --dry-run                      Preview restore actions without mutating files
  --format <text|json>
  -h, --help
`;
    case 'release-status':
      return `Usage:
  node scripts/aios.mjs release-status [options]

Options:
  --state-path <path>            Override release gate state file path
  --recent <n>                   Limit recent trend window (default: 10)
  --strict                       Enforce health gate and return non-zero when not passed
  --min-samples <n>              Strict gate minimum recent samples (default: 8)
  --max-failure-rate <0-1>       Strict gate max recent failure rate (default: 0.2)
  --max-fallback-rate <0-1>      Strict gate max recent fallback rate (default: 0.1)
  --output <path>                Write rendered report to file
  --history-output <path>        Write daily trend history export file
  --history-format <csv|ndjson>  History export format (default: csv)
  --history-days <n>             Number of recent days included in history export (default: 14)
  AIOS_RELEASE_TREND_WOW_FAILURE_DELTA_WARN=<0-1>   (env) WoW failure-rate delta warning threshold (default: 0.05)
  AIOS_RELEASE_TREND_WOW_FALLBACK_DELTA_WARN=<0-1>  (env) WoW fallback-rate delta warning threshold (default: 0.03)
  --format <text|json>
  -h, --help
`;
    case 'perception':
      return `Usage:
  node scripts/aios.mjs perception record [options]
  node scripts/aios.mjs perception insights [options]
  node scripts/aios.mjs perception summary [options]

Subcommands:
  record      Record a structured outcome snapshot after content operation
  insights    Analyze outcomes and generate insight memos
  summary     Build perception layer markdown for agent context injection

Options:
  --content-id <id>               (record) Required content identifier
  --platform <name>               (record) Required platform (e.g. xiaohongshu)
  --content-type <type>           (record) Required content type (e.g. note, video)
  --title <text>                  (record) Content title
  --publish-time <iso>            (record) Publish timestamp
  --snapshot-window <duration>    (record) Metrics snapshot window (default: immediate)
  --metrics <json>                (record) Metrics JSON: likes, comments, saves, views, etc.
  --context <json>                (record) Context JSON: topic, format, publishHour, etc.
  --space <name>                  Workspace memory space (default: default)
  --min-sample <n>                (insights) Minimum sample size per dimension group (default: 3)
  --max-chars <n>                 (summary) Max output characters (default: 10000)
  --format <text|json>            Output format
  --dry-run                       Preview without storing
  --json                          Output as JSON
  -h, --help

Environment:
  CTXDB_PERCEPTION                Enable/disable perception overlay (default: true)
  PERCEPTION_MAX_CHARS            Max chars for perception overlay (default: 3000)
  PERCEPTION_OUTCOMES_LIMIT       Max outcomes loaded (default: 20)
  PERCEPTION_INSIGHTS_LIMIT       Max insights loaded (default: 10)
  PERCEPTION_MIN_SAMPLE           Min sample for insight generation (default: 3)
`;
    default:
      return getRootHelpText();
  }
}

export function getInternalHelpText(target, action) {
  if (target === 'shell' && (action === 'install' || action === 'update')) {
    return `Usage:
  node scripts/aios.mjs internal shell ${action} [--force] [--mode <all|repo-only|opt-in|off>] [--rc-file <path>]
`;
  }

  if (target === 'shell' && action === 'uninstall') {
    return `Usage:
  node scripts/aios.mjs internal shell uninstall [--rc-file <path>]
`;
  }

  if (target === 'shell' && action === 'doctor') {
    return `Usage:
  node scripts/aios.mjs internal shell doctor [--rc-file <path>]
`;
  }

  if (target === 'skills' && (action === 'install' || action === 'update')) {
    return `Usage:
  node scripts/aios.mjs internal skills ${action} [--client <all|codex|claude|gemini|opencode|kiro>] [--scope <global|project>] [--install-mode <copy|link>] [--skills <list>] [--force]
`;
  }

  if (target === 'skills' && (action === 'uninstall' || action === 'doctor')) {
    return `Usage:
  node scripts/aios.mjs internal skills ${action} [--client <all|codex|claude|gemini|opencode|kiro>] [--scope <global|project>] [--skills <list>]
`;
  }

  if (target === 'native' && (action === 'install' || action === 'update' || action === 'uninstall')) {
    return `Usage:
  node scripts/aios.mjs internal native ${action} [--client <all|codex|claude|gemini|opencode|kiro>]
`;
  }

  if (target === 'native' && action === 'doctor') {
    return `Usage:
  node scripts/aios.mjs internal native doctor [--client <all|codex|claude|gemini|opencode|kiro>] [--verbose] [--fix] [--dry-run]
`;
  }

  if (target === 'native' && action === 'repair') {
    return `Usage:
  node scripts/aios.mjs internal native repair [list|show] [--repair-id <id|latest>] [--limit <n>]
`;
  }

  if (target === 'native' && action === 'rollback') {
    return `Usage:
  node scripts/aios.mjs internal native rollback [--repair-id <id|latest>] [--dry-run]
`;
  }

  if (target === 'superpowers' && action === 'install') {
    return `Usage:
  node scripts/aios.mjs internal superpowers install [--repo <url>] [--update] [--force]
`;
  }

  if (target === 'superpowers' && action === 'update') {
    return `Usage:
  node scripts/aios.mjs internal superpowers update [--repo <url>] [--force]
`;
  }

  if (target === 'superpowers' && action === 'doctor') {
    return `Usage:
  node scripts/aios.mjs internal superpowers doctor
`;
  }

  if (target === 'superpowers' && action === 'sync-claude-permissions') {
    return `Usage:
  node scripts/aios.mjs internal superpowers sync-claude-permissions
`;
  }

  if (target === 'browser' && action === 'install') {
    return `Usage:
  node scripts/aios.mjs internal browser install [--dry-run] [--skip-playwright-install]
`;
  }

  if (target === 'browser' && action === 'doctor') {
    return `Usage:
  node scripts/aios.mjs internal browser doctor [--fix] [--dry-run]
`;
  }

  if (target === 'browser' && action === 'mcp-migrate') {
    return `Usage:
  node scripts/aios.mjs internal browser mcp-migrate [--dry-run]
`;
  }

  if (target === 'browser' && action === 'cdp-start') {
    return `Usage:
  node scripts/aios.mjs internal browser cdp-start
`;
  }

  if (target === 'browser' && action === 'cdp-stop') {
    return `Usage:
  node scripts/aios.mjs internal browser cdp-stop
`;
  }

  if (target === 'browser' && (action === 'cdp-restart' || action === 'cdp-reload')) {
    return `Usage:
  node scripts/aios.mjs internal browser cdp-restart
`;
  }

  if (target === 'browser' && action === 'cdp-status') {
    return `Usage:
  node scripts/aios.mjs internal browser cdp-status
`;
  }

  if (target === 'privacy' && action === 'install') {
    return `Usage:
  node scripts/aios.mjs internal privacy install [--enable] [--disable] [--mode <regex|ollama|hybrid>]
`;
  }

  return getRootHelpText();
}
