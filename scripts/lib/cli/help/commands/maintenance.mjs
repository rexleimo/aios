/* 中文注释：帮助文案显式暴露 interception doctor/proof，让用户能直接验证压缩链路。 */
export function getMaintenanceCommandHelpText(command) {
  switch (command) {
    case 'status':
      return `Usage:
  node scripts/aios.mjs status [options]

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
  node scripts/aios.mjs agents list [options]
  node scripts/aios.mjs agents doctor --strict [options]

Description:
  Inspect the aios.agent-catalogue.v1 agent catalogue for default agents.
  Agents may be projected statically before they are smoke-verified; strict
  doctor fails when candidate agents are not yet enabled for live workflow
  orchestration.

Options:
  --strict             Fail when candidate agents are missing smoke evidence
  --format <text|json>
  --json
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
    case 'refs':
      return `Usage:
  node scripts/aios.mjs refs list [--session <id>] [--workspace <path>]
  node scripts/aios.mjs refs grep <pattern> [--session <id>] [--limit N] [--workspace <path>]
  node scripts/aios.mjs refs read <node_id> [--workspace <path>]
  node scripts/aios.mjs refs prune [--keep-days N] [--workspace <path>]

Options:
  --session <id>                 Limit to one offload session
  --storage <file|split>         Override offload storage backend
  --workspace <path>             Workspace root containing .aios/offload
  --limit <n>                    Max refs to list/search (default: 20)
  --keep-days <n>                Prune refs older than n days (default: 30)
  -h, --help
`;
    case 'search':
      return `Usage:
  node scripts/aios.mjs search <query> [options]

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
  node scripts/aios.mjs skill comply <path> --dry-run [--client <client>] [--json]
  node scripts/aios.mjs skill comply <path> --live [--client <client>] [--json]
  node scripts/aios.mjs skill health [--dashboard] [--json]

Subcommands:
  comply       Generate expected skill behavior and trigger-smoke scenarios
  health       Report skill observation success rates and failure clusters

Options:
  --client <client>              Target client for compliance scenarios
  --dry-run                      Generate spec/scenarios without live model execution
  --live                         Run deterministic local compliance scoring
  --dashboard                    Render text dashboard for health
  --format <text|json>
  --json
  -h, --help
`;
    case 'plan':
      return `Usage:
  node scripts/aios.mjs plan status [--workspace <path>] [--json]
  node scripts/aios.mjs plan show [--workspace <path>] [--html] [--json]
  node scripts/aios.mjs plan start --title <text> --task <text> [--workspace <path>] [--json]
  node scripts/aios.mjs plan auto-gate --task <text> [--workspace <path>] [--json]

Options:
  --title <text>                 Plan title or task title
  --task <text>                  Task/objective text
  --objective <text>             Objective text
  --status <status>              Plan or task status
  --workspace <path>             Workspace root for planning state
  --html                         Also write .aios/planning/review.html
  --format <text|json|html|both>
  --json
  -h, --help

Examples:
  node scripts/aios.mjs plan show --html
  node scripts/aios.mjs plan show --workspace /tmp/demo --json
`;
    case 'dream':
      return `Usage:
  node scripts/aios.mjs dream --preview [--space <name>] [--workspace <path>] [--json]
  node scripts/aios.mjs dream --apply [--space <name>] [--workspace <path>] [--json]
  node scripts/aios.mjs dream --preview --to pin [--workspace <path>] [--json]
  node scripts/aios.mjs dream --apply --to both [--workspace <path>] [--json]

Options:
  --preview                      Preview dream consolidation/export (default)
  --apply                        Apply consolidation/export changes
  --space <name>                 Target consolidation space
  --to <pin|agents|both>         Export durable notes to pin memo and/or AGENTS.md
  --workspace <path>             Workspace root for memo/planning state
  --format <text|json>
  --json
  -h, --help

Examples:
  node scripts/aios.mjs dream --preview --to pin --json
  node scripts/aios.mjs dream --apply --to both --workspace /tmp/demo --json
`;
    case 'session':
      return `Usage:
  node scripts/aios.mjs session changed-files [--session <id>] [--json]

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
  node scripts/aios.mjs canvas show [--session <id>] [--format mmd|json] [--workspace <path>]
  node scripts/aios.mjs canvas path [--session <id>] [--workspace <path>]
  node scripts/aios.mjs canvas backfill --input <events.jsonl> --client <client> [--session <id>] [--workspace <path>]

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
  node scripts/aios.mjs interception doctor [--fix] [--dry-run] [--enforce-turns] [--json] [--workspace <path>]
  node scripts/aios.mjs interception proof [--session <id>] [--json] [--workspace <path>]
  node scripts/aios.mjs interception tail [--session <id> | --latest] [--limit <n>] [--json] [--workspace <path>]
  node scripts/aios.mjs interception rewrite --command <cmd> [--hook claude] [--json]
  node scripts/aios.mjs interception mcp-migrate [--dry-run] [--json]
  node scripts/aios.mjs interception audit [--timezone <tz>] [--date <YYYY-MM-DD>] [--json] [--workspace <path>]

Subcommands:
  doctor       Verify RTK/Caveman-style interception, MCP proxy routing, refs, and metrics
  proof        Run deterministic shell + MCP sentinel proof and print savings metrics
  tail         Show recent interception metric events from the latest or selected session
  rewrite      Rewrite shell commands for host-native tool hooks
  mcp-migrate  Force MCP configs through scripts/aios-mcp-proxy.mjs
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
  node scripts/aios.mjs perception record [options]
  node scripts/aios.mjs perception insights [options]
  node scripts/aios.mjs perception summary [options]

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
