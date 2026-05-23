import {
  resolveClientCommandNames,
  resolveClientRuntimeIds,
} from '../../clients/registry.mjs';

export function usage() {
  console.log(`Usage:
  node scripts/contextdb-shell-bridge.mjs --agent <codex-cli|claude-code|gemini-cli|opencode-cli> --command <codex|claude|gemini|opencode> [--cwd <path>] [-- <args...>]

Environment:
  AIOS_ROOT_DIR          AIOS install root containing scripts/ctx-agent.mjs
  AIOS_ROOT              Alias for AIOS_ROOT_DIR
  ROOTPATH               Legacy alias for AIOS_ROOT_DIR
  CTXDB_RUNNER           Explicit runner path (overrides AIOS root discovery)
  CTXDB_REPO_NAME        Optional project name override
  CTXDB_WRAP_MODE        all|repo-only|opt-in|off (default: repo-only)
  CTXDB_MARKER_FILE      Marker filename for opt-in mode (default: .contextdb-enable)
  CTXDB_AUTO_CREATE_MARKER 1/true/yes/on to auto-create marker in opt-in mode (default: on)
  CTXDB_INTERACTIVE_AUTO_ROUTE 1/true/yes/on to inject route auto prompt in interactive mode (default: on)
  CTXDB_HARNESS_PROVIDER codex|claude|gemini|opencode for injected harness route (default: current CLI)
  CTXDB_HARNESS_MAX_ITERATIONS Positive integer for injected harness route (default: 8)
  CTXDB_PRIVACY_BANNER   0/false/off to hide the interactive privacy banner (default: on)
  CTXDB_PRIVACY_COLOR    0/false/off to disable banner ANSI color (default: on unless NO_COLOR is set)
  CTXDB_CODEX_DISABLE_MCP 1/true/yes/on to launch Codex without MCP startup in wrapped runs
  CTXDB_DEBUG            1/true/yes/on to print bridge decisions`);
}

export function parseArgs(argv, cwd = process.cwd()) {
  const opts = {
    agent: '',
    command: '',
    cwd,
    help: false,
    passthroughArgs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--agent':
        opts.agent = argv[++i] || '';
        break;
      case '--command':
        opts.command = argv[++i] || '';
        break;
      case '--cwd':
        opts.cwd = argv[++i] || cwd;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--':
        opts.passthroughArgs = argv.slice(i + 1);
        i = argv.length;
        break;
      default:
        opts.passthroughArgs.push(arg);
        break;
    }
  }

  return opts;
}

export function validateOptions(opts) {
  const validAgents = new Set(resolveClientRuntimeIds('all'));
  const validCommands = new Set(resolveClientCommandNames('all'));

  if (!validAgents.has(opts.agent)) {
    throw new Error(`--agent must be one of: ${[...validAgents].join(', ')}`);
  }

  if (!validCommands.has(opts.command)) {
    throw new Error(`--command must be one of: ${[...validCommands].join(', ')}`);
  }
}
