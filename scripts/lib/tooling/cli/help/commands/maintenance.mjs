/* 中文注释：帮助文案显式暴露 interception doctor/proof，让用户能直接验证压缩链路。 */
import { getPluginHelpText } from './plugin.mjs';

export function getMaintenanceCommandHelpText(command) {
  switch (command) {
    case 'status':
      return `Usage:
  aios status [options]

Description:
  Render the unified aios.status.v1 readiness surface. This ECC-inspired status
  view aggregates agent catalogue, workflow recipes, client capabilities, and
  blockers from one AIOS-native status contract.

Options:
  --format <text|json>
  --json
  -h, --help
`;
    case 'agents':
      return `Usage:
  aios agents list [options]
  aios agents doctor --strict [options]
  aios agents smoke --live --client <name> [options]

Description:
  Inspect the aios.agent-catalogue.v1 agent catalogue for default agents.
  Agents may be projected statically before they are smoke-verified; strict
  doctor fails when candidate agents are not yet enabled for live workflow
  orchestration. Smoke is fail-closed until --live and --client <name> are
  both explicit.

Warning:
  agents smoke --live --client <name> invokes an external coding client. It
  may consume that client's quota or incur charges; do not run it as a local
  test or without the operator's explicit approval.

Options:
  --strict             Fail when candidate agents are missing smoke evidence
  --live               Required before smoke invokes an external client
  --client <name>      Required client for live smoke, for example codex-cli
  --dry-run            Print the smoke plan without invoking any client
  --timeout-ms <ms>    Per-agent live probe timeout (default 60000, or AIOS_AGENT_SMOKE_TIMEOUT_MS); timeouts auto-retry at 2x/4x before blocking
  --format <text|json>
  --json
  -h, --help
`;
    case 'entropy-gc':
      return `Usage:
  aios entropy-gc [dry-run|auto|off] [options]

Options:
  --session <id>                 Required session id to clean
  --retain <n>                   Keep latest n dispatch artifacts (default: 5)
  --min-age-hours <n>            Only archive files older than n hours (default: 24)
  --format <text|json>
  -h, --help
`;
    case 'snapshot-rollback':
      return `Usage:
  aios snapshot-rollback [options]

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
  aios release-status [options]

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
    case 'refs':
      return `Usage:
  aios refs list [--session <id>] [--workspace <path>]
  aios refs grep <pattern> [--session <id>] [--limit N] [--workspace <path>]
  aios refs read <node_id> [--workspace <path>]
  aios refs prune [--keep-days N] [--session <id>] [--dry-run] [--workspace <path>]

Retention is decided from each ref's own metadata: created_at (business time, immune to
copies that reset mtime) plus ttl_days. Only when a ref carries neither does the sweep fall
back to filesystem mtime, and the receipt labels that weaker basis. The active session's refs
are never removed — a resumable long task may still be citing them.
An automatic pass runs on "aios session close" (bounded, cooldown-guarded, never fails the
close). It defaults to dry-run: it reports the backlog without deleting. Set AIOS_REFS_SWEEP=enforce
to let it prune, or AIOS_REFS_SWEEP=off to disable the pass.

Environment:
  AIOS_REFS_SWEEP                off | (default dry-run) | enforce
  AIOS_REFS_SWEEP_KEEP_DAYS      retention default when a ref declares no ttl_days (default 30)
  AIOS_REFS_SWEEP_BUDGET_MS      per-pass work budget (default 1500; a truncated pass retries
                                 on the next close instead of waiting out its own cooldown)
  AIOS_REFS_SWEEP_COOLDOWN_HOURS  hours between automatic passes (default 6)

Options:
  --session <id>                 Limit to one offload session
  --storage <file|split>         Override offload storage backend
  --workspace <path>             Workspace root containing .aios/offload
  --limit <n>                    Max refs to list/search (default: 20)
  --keep-days <n>                Prune refs older than n days when a ref declares no ttl_days (default: 30)
  --dry-run                      Report the backlog without deleting anything
  -h, --help
`;
    case 'search':
      return `Usage:
  aios search <query> [options]

Options:
  --source <list>                Sources: memory, docs, plans, code, all (default: all)
  --scope <scope>                Memo scope filter, e.g. project_shared or agent_private
  --agent <id>                   Agent id allowed to read matching agent_private memos
  --space <name>                 Memo space (default: default)
  --workspace <path>             Workspace root to search
  --limit <n>                    Max results (default: 20, max: 100)
  --format <text|json>
  --json
  -h, --help
`;
    case 'skill':
      return `Usage:
  aios skill add <source> [--client <list|all>] [--skill <names>] [--yes] [--force] [--json]
  aios skill comply <path> --dry-run [--client <client>] [--json]
  aios skill comply <path> --live [--client <client>] [--json]
  aios skill health [--dashboard] [--json]
  aios skill certify --changed [--base <ref>] [--json]
  aios skill certify --skill <id>[,<id>...] [--base <ref>] [--json]
  aios skill verify-training --changed [--base <ref>] [--json]
  aios skill verify-training --skill <id>[,<id>...] [--base <ref>] [--json]

Subcommands:
  add          Install an external skill (local dir or git URL) into every client's global skills root
  comply       Generate expected skill behavior and trigger-smoke scenarios
  health       Report skill observation success rates and failure clusters
  certify      Record reproducible V2 training evidence for changed Skills
  verify-training Recompute and validate recorded training evidence

Options:
  --client <list|all>            Clients to install into for add (default: all)
  --skill <names>                Pick skills from a multi-skill source (repeatable or comma-separated)
  --yes                          Non-interactive: install every skill found in the source
  --force                        Replace existing unmanaged skill directories
  --client <client>              Target client for compliance scenarios
  --skill <ids>                    Certify/verify named Skills (repeatable or comma-separated)
  --dry-run                      Generate spec/scenarios without live model execution
  --live                         Run deterministic local compliance scoring
  --dashboard                    Render text dashboard for health
  --format <text|json>
  --json
  -h, --help
`;
    case 'plugin':
      return getPluginHelpText();
    case 'integration':
      return `Usage:
  aios integration list [--json]
  aios integration add <id> [--clients <list|all>] [--scope <global|project>] [--dry-run] [--skip-skills] [--skip-mcp] [--json]
  aios integration doctor <id> [--clients <list|all>] [--json]
  aios integration remove <id> [--clients <list|all>] [--scope <global|project>] [--dry-run] [--json]

Subcommands:
  list         Show vendor integrations declared in config/integrations.json
  add          Install the pinned skill and register the docs MCP server
  doctor       Verify the skill hash, every client registration, and a live MCP handshake
  remove       Remove only entries AIOS wrote (never a user-edited entry)

Options:
  --clients <list>               Comma list of clients, or "all" (default: all)
  --scope <global|project>       MCP registration scope (default: global)
  --dry-run                      Print the plan and the exact per-client command without writing
  --skip-skills                  Only touch the MCP plane
  --skip-mcp                     Only touch the skill plane
  --format <text|json>
  --json
  -h, --help

Examples:
  aios integration list
  aios integration add typesafe --dry-run
  aios integration add typesafe --yes
  aios integration doctor typesafe --json
`;
    case 'plan':
      return `Usage:
  aios plan status [--workspace <path>] [--json]
  aios plan statusline [--workspace <path>]     One-line Claude Code status bar (plan state + caveman badge)
  aios plan set-status --status <active|approved|executing|done|blocked> [--note <text>] [--force] [--workspace <path>] [--json]
  aios plan show [--workspace <path>] [--html] [--json]
  aios plan start --title <text> --task <text> [--work-item <id>] [--workspace <path>] [--json]
  aios plan task <id> [--context <ref[:reason]>] [--target <path>] [--allow-write <glob>] [--workspace <path>] [--json]
  aios plan task <id> --propose-context [--target <path>] [--workspace <path>] [--json]
  aios plan task <id> --confirm-context-candidates [--candidate-ref <ref>] [--workspace <path>] [--json]
  aios plan auto-gate --task <text> [--message <text>] [--explicit-intent <value>] [--new-work-item] [--work-item <id>] [--workspace <path>] [--json]
  aios plan capability-evidence --activation <id> --command-token <token> --evidence-kind <kind> --evidence-ref <ref> [--testability-file <path>] [--workspace <path>] [--json]

Options:
  --title <text>                 Plan title or task title
  --task <text>                  Task/objective text
  --objective <text>             Objective text
  --message <text>               User message for auto-gate; a /plan /review /single prefix declares intent
  --explicit-intent <value>      Declare the workflow disposition for auto-gate (e.g. read-only, plan);
                                 unknown values are refused, never guessed from text
  --new-work-item                Open a second ledger: without it, a planned turn reuses the active
                                 not-done plan instead of writing a duplicate document
  --work-item <id>               Canonical work-item identity for plan start and auto-gate: re-registering
                                 the same id reuses its ledger instead of writing a slug-2 sibling, and the
                                 Capability activation is bound under that same id; identity is the id,
                                 never the objective text
  --status <status>              Plan or task status
  --context <ref[:reason]>       Required task context; repeat to add more
  --target <path>                Declared task target; repeat to add more
  --allow-write <glob>           Allowed task write glob; repeat to add more
  --propose-context               Derive reviewable target/codemap context candidates
  --confirm-context-candidates    Human-confirm the current candidate proposal
  --candidate-ref <ref>           Candidate ref to confirm; repeat to select a subset
  --confirmed-by <text>           Human confirmation label
  --activation <id>              Current rex Capability Activation id
  --evidence-kind <kind>         Evidence kind required by the current Command
  --command-token <token>        Execution token from the current persisted Command
  --evidence-ref <ref>           Artifact, command, diff, or log reference
  --testability-file <path>      Typed testability decision JSON for decide-testability
  --workspace <path>             Workspace root for planning state
  --html                         Also write .aios/planning/review.html
  --format <text|json|html|both>
  --json
  -h, --help

Examples:
  aios plan show --html
  aios plan set-status --status done --note "all work items delivered" --json
  aios plan show --workspace /tmp/demo --json
  aios plan task t3-implement --propose-context --target src/feature.mjs
  aios plan task t3-implement --confirm-context-candidates --candidate-ref src/feature.mjs
  aios plan capability-evidence --activation activation-1 --command-token <token> --evidence-kind focused-tests-pass --evidence-ref receipt:<id> --json
`;
    case 'dream':
      return `Usage:
  aios dream --preview [--space <name>] [--workspace <path>] [--json]
  aios dream --apply [--space <name>] [--workspace <path>] [--json]
  aios dream --preview --to pin [--workspace <path>] [--json]
  aios dream --apply --to both [--workspace <path>] [--json]
  aios dream --governance <list|inspect> [--proposal <id>] [--json]
  aios dream --governance <approve|reject|archive|restore|gc> [--proposal <id>] [--reason <text>] [--json]

Options:
  --preview                      Preview dream consolidation/export (default)
  --apply                        Apply consolidation/export changes
  --space <name>                 Target consolidation space
  --to <pin|agents|both>         Export durable notes to pin memo and/or AGENTS.md
  --governance <action>          Review proposal lifecycle action
  --proposal <id>                Dream proposal id for inspect/mutation
  --reason <text>                Required mutation reason; mutations currently only produce DENY audit receipts until a trusted broker is available
  --retention-days <n>           Days between archive and GC (default: 30)
  --workspace <path>             Workspace root for memo/planning state
  --format <text|json>
  --json
  -h, --help

Examples:
  aios dream --preview --to pin --json
  aios dream --apply --to both --workspace /tmp/demo --json
  aios dream --governance list --json
`;
    case 'session':
      return `Usage:
  aios session changed-files [--session <id>] [--json]

Subcommands:
  changed-files                  Show session-local changed file ledger

Options:
  --session <id>                 Session id (default: default)
  --format <text|json>
  --json
  -h, --help
`;
    case 'canvas':
      return `Usage:
  aios canvas show [--session <id>] [--format mmd|json] [--workspace <path>]
  aios canvas path [--session <id>] [--workspace <path>]
  aios canvas backfill --input <events.jsonl> --client <client> [--session <id>] [--workspace <path>]

Options:
  --session <id>                 Offload session id (default: default)
  --format <mmd|json>            Show Mermaid or raw canvas JSON (default: mmd)
  --input <path>                 JSONL tool-event log for backfill
  --client <client>              Client id recorded on generated refs
  --storage <file|split>         Override offload storage backend
  --workspace <path>             Workspace root containing .aios/offload
  -h, --help
`;
    case 'interception':
      return `Usage:
  aios interception doctor [--fix] [--dry-run] [--enforce-turns] [--json] [--workspace <path>]
  aios interception proof [--session <id>] [--json] [--workspace <path>]
  aios interception tail [--session <id> | --latest] [--limit <n>] [--json] [--workspace <path>]
  aios interception rewrite --command <cmd> [--hook claude] [--json]
  aios interception mcp-migrate [--dry-run] [--json]
  aios interception mcp-repair [--client <name>] [--fix] [--json]
  aios interception audit [--timezone <tz>] [--date <YYYY-MM-DD>] [--json] [--workspace <path>]

Subcommands:
  doctor       Verify RTK/Caveman-style interception, MCP proxy routing, refs, and metrics
  proof        Run deterministic shell + MCP sentinel proof and print savings metrics
  tail         Show recent interception metric events from the latest or selected session
  rewrite      Rewrite shell commands for host-native tool hooks
  mcp-migrate  Migrate browser MCP configs to direct browser-use delivery
  mcp-repair   Re-point AIOS-managed MCP entries that drifted to a stale temp path, onto the stable AIOS runtime root (preview by default; --fix writes)
  audit        Hourly token usage aggregation with timezone-aware query

Options:
  --session <id>                 Proof session id
  --latest                       Tail the newest interception metrics session
  --limit <n>                    Number of recent records to show (default: 10)
  --workspace <path>             Workspace root for proof refs/metrics
  --command <cmd>                 Shell command to rewrite through AIOS interception
  --hook <claude>                 Emit host-native hook response JSON
  --input <json>                  Host hook JSON payload
  --enforce-turns                Fail when latest or selected metrics lack pre_send/post_receive
  --fix                          Repair MCP proxy routing before proof
  --dry-run                      Preview repair actions without writing configs
  --timezone <tz>                Viewer timezone for audit (default: UTC)
  --date <YYYY-MM-DD>            Filter audit by local date
  --json                         Output machine-readable proof/audit
  -h, --help
`;
    case 'perception':
      return `Usage:
  aios perception record [options]
  aios perception insights [options]
  aios perception summary [options]

Subcommands:
  record      Record a structured outcome snapshot after content operation
  insights    Analyze outcomes and generate insight memos
  summary     Build perception layer markdown for explicit analysis/reporting

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
      return '';
  }
}
