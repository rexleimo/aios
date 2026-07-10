import { getMemoHelpText } from '../memo.mjs';

export function getBasicCommandHelpText(command) {
  switch (command) {
    case 'init':
      return `Usage:
  node scripts/aios.mjs init [--agent <claude|codex|gemini|opencode|hermes|grok>] [--all] [--dry-run] [--yes-compression-tools] [--yes-headroom-mcp]

Options:
  --agent <name>              Init only the specified agent
  --all                       Init all detected agents, even if CLI detection misses them
  --dry-run                   Preview project marker and hook changes without writing files
  --yes-compression-tools     Authorize unattended RTK/Caveman/Headroom installation
  --yes-headroom-mcp          Authorize unattended Gemini/Grok Headroom MCP registration

Unattended example:
  node scripts/aios.mjs init --all --yes-compression-tools --yes-headroom-mcp
`;
    case 'setup':
      return `Usage:
  node scripts/aios.mjs setup [options]

Options:
  --components <list>            Comma list: browser,shell,skills,native,agents,superpowers (default: browser,shell,skills,native,superpowers)
  --mode <all|repo-only|opt-in|off>
  --client <all|codex|claude|gemini|opencode|hermes|grok>
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
  --self-update                 Refresh Harness CLI itself before component updates (default for CLI)
  --skip-self-update            Only update selected integrations
  --components <list>            Comma list: browser,shell,skills,native,agents,superpowers (default: browser,shell,skills,native,superpowers)
  --mode <all|repo-only|opt-in|off>
  --client <all|codex|claude|gemini|opencode|hermes|grok>
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
  --client <all|codex|claude|gemini|opencode|hermes|grok>
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
  --client <all|codex|claude|gemini|opencode|hermes|grok>
  --native
  --verbose
  --fix
  --dry-run
  --profile <minimal|standard|strict>
  -h, --help
`;
    case 'memo':
      return getMemoHelpText();
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
    default:
      return '';
  }
}
