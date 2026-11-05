import { getMemoHelpText } from '../memo.mjs';
import { ALL_CLIENTS } from '../../../../foundation/clients/registry.mjs';

/* 中文注释：help 里的客户端清单直接读注册表，避免新增客户端时漏改文案。 */
const CLIENTS_FLAG = ['all', ...ALL_CLIENTS].join('|');

export function getBasicCommandHelpText(command) {
  switch (command) {
    case 'init':
      return `Usage:
  aios init [--agent <claude|codex|gemini|opencode|hermes|grok|workbuddy|pi|zcode|qoder>] [--all] [--dry-run] [--adopt-legacy-superpowers] [--yes-compression-tools] [--yes-headroom-mcp]

Options:
  --agent <name>              Init only the specified agent
  --all                       Init all detected agents, even if CLI detection misses them
  --dry-run                   Preview project marker and hook changes without writing files
  --adopt-legacy-superpowers  Explicit cleanup; preview first with --dry-run
  --yes-compression-tools     Authorize unattended RTK/Caveman/Headroom installation
  --yes-headroom-mcp          Authorize unattended Gemini/Grok Headroom MCP registration

Unattended example:
  aios init --all --yes-compression-tools --yes-headroom-mcp
`;
    case 'setup':
      return `Usage:
  aios setup [options]

Options:
  --components <list>            Comma list: browser,shell,skills,native,agents (default: browser,shell,skills,native)
  --mode <all|repo-only|opt-in|off>
  --client <${CLIENTS_FLAG}>
  --scope <global|project>       Skills install scope (default: global)
  --project-root <path>          Project root for --scope project (default: current directory)
  --install-mode <copy|link>     Skills install mode (default: copy)
  --skills <list>                Comma list of skill names to install
  --adopt-legacy-superpowers     Explicit cleanup; preview first with the standalone reconciler --dry-run
  --skip-playwright-install     Skip browser-use runtime installation (legacy flag name)
  --skip-doctor
  -h, --help
`;
    case 'update':
      return `Usage:
  aios update [options]

Options:
  --self-update                 Refresh AIOS itself before component updates (default for CLI)
  --skip-self-update            Only update selected integrations
  --components <list>            Comma list: browser,shell,skills,native,agents (default: browser,shell,skills,native)
  --mode <all|repo-only|opt-in|off>
  --client <${CLIENTS_FLAG}>
  --scope <global|project>       Skills install scope (default: global)
  --project-root <path>          Project root for --scope project (default: current directory)
  --install-mode <copy|link>     Skills install mode (default: copy)
  --skills <list>                Comma list of skill names to install
  --adopt-legacy-superpowers     Explicit cleanup; preview first with the standalone reconciler --dry-run
  --with-playwright-install     Force browser-use runtime installation (legacy flag name)
  --skip-doctor
  -h, --help
`;
    case 'uninstall':
      return `Usage:
  aios uninstall [options]

Options:
  --components <list>            Comma list: shell,skills,native,agents,browser (default: shell,skills)
  --client <${CLIENTS_FLAG}>
  --scope <global|project>       Skills uninstall scope (default: global)
  --project-root <path>          Project root for --scope project (default: current directory)
  --skills <list>                Comma list of skill names to uninstall
  -h, --help
`;
    case 'doctor':
      return `Usage:
  aios doctor [options]

Options:
  --strict
  --global-security
  --client <${CLIENTS_FLAG}>
  --project-root <path>          Project root to report on (default: current directory)
  --native
  --verbose
  --fix
  --dry-run
  --profile <minimal|standard|strict>
  -h, --help
`;
    case 'tokens':
      return `Usage:
  aios tokens report [options]

Options:
  --session <id>                 Ledger session id (default: default)
  --json                         Output as JSON
  -h, --help
`;
    case 'mcp':
      return `Usage:
  aios mcp list    [--client <id>|all] [--scope home|project|all] [--json]
  aios mcp doctor  [--client <id>|all] [--json]
  aios mcp add     <name> --client <id> [--scope home|project] (--command <cmd> [--arg <v>]... [--type <t>] [--env K=V]... [--cwd <p>] [--timeout <s>] [--startup-timeout-sec <s>] [--lifecycle lazy] [--enabled] | --entry '<json>') [--dry-run] [--adopt] [--restore]
  aios mcp remove  <name> --client <id> [--scope home|project] [--dry-run] [--adopt] [--force]
  aios mcp enable  <name> --client <id> [--scope home|project]
  aios mcp disable <name> --client <id> [--scope home|project]
  aios mcp adopt   <name> --client <id> [--scope home|project]

What it manages:
  A "landing" is one (client, scope) place an MCP server can be registered: claude/home is
  ~/.claude.json, codex/home is ~/.codex/config.toml, hermes/home is a YAML file, and so on.
  \`list\` prints every landing with its file path, bucket path, the field names each entry uses,
  and who owns it. Writing removes/installs entries with text surgery: the other bytes of the
  file stay identical, so a hand-formatted config stays hand-formatted.

Ownership rules — a refusal here is the product working, not failing:
  external        Never registered by AIOS        -> refused. --adopt takes it over as-is (zero
                  bytes changed) and only then can it be removed; --force does not open this door.
  kept-differs    A human edited it after AIOS registered it -> never overwritten silently.
                  Read it as-is, or pass --force to delete the entry exactly as it now stands.
  conflict        AIOS owns it but wants a different shape   -> needs --restore to replace.
  Each write is recorded in <AIOS_HOME>/mcp/ledger/<client>.json (--ledger-dir to move it).
  A config change that cannot be recorded is rolled back; no unowned edit survives.
  --dry-run touches neither the config file nor the ledger directory.

Privacy:
  Output carries field NAMES, env KEY names, and fingerprints — never values. There is no flag
  that prints an entry's env or header values.

Options:
  --client <id>                  Client id as shown by \`aios mcp list\` (claude, codex, gemini,
                                 opencode, hermes, grok, qoder, workbuddy, zcode, pi)
  --scope <home|project|all>     Landing scope; "all" only for list/doctor
  --file <path>                  Override the landing file (self-checks and unusual installs)
  --home-dir / --project-root    Resolve landings relative to these instead of the real homes
  --ledger-dir <path>            Ownership ledger directory override
  --backup-dir <path>            Where pre-write backups go
  --json                         Output as JSON (schema mcp.list.v1 / mcp.action.v1)
  -h, --help
`;
    case 'memo':
      return getMemoHelpText();
    case 'quality-gate':
      return `Usage:
  aios quality-gate [quick|full|pre-pr] [options]

Options:
  --profile <minimal|standard|strict>
  --global-security
  --session <id>
  AIOS_RELEASE_GATE_MIN_SAMPLES=<n>        (env) Override release strict gate sample floor (default: 8)
  AIOS_RELEASE_GATE_MAX_FAILURE_RATE=<0-1> (env) Override release strict gate max failure rate (default: 0.2)
  AIOS_RELEASE_GATE_MAX_FALLBACK_RATE=<0-1> (env) Override release strict gate max fallback rate (default: 0.1)
  -h, --help
`;
    default:
      return '';
  }
}
