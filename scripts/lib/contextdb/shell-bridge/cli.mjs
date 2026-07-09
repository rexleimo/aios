import { Command } from 'commander';
import {
  resolveClientCommandNames,
  resolveClientRuntimeIds,
} from '../../clients/registry.mjs';

// 中文注释：Commander 声明式解析，替代手写 for+switch 循环。
const SHELL_BRIDGE_CLI = new Command()
  .name('contextdb-shell-bridge')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .option('--agent <name>', 'Agent runtime ID')
  .option('--command <name>', 'Client command name')
  .option('--cwd <path>', 'Working directory')
  .argument('[args...]');

export function usage() {
  console.log(`Usage:
  node scripts/contextdb-shell-bridge.mjs --agent <codex-cli|claude-code|gemini-cli|opencode-cli|hermes-agent|grok-build> --command <codex|claude|gemini|opencode|hermes|grok> [--cwd <path>] [-- <args...>]

Environment:
  AIOS_ROOT_DIR          AIOS install root containing scripts/ctx-agent.mjs
  AIOS_ROOT              Alias for AIOS_ROOT_DIR
  ROOTPATH               Legacy alias for AIOS_ROOT_DIR
  CTXDB_RUNNER           Explicit runner path (overrides AIOS root discovery)
  CTXDB_REPO_NAME        Optional project name override
  CTXDB_WRAP_MODE        all|repo-only|opt-in|off (default: repo-only)
  CTXDB_MARKER_FILE      Marker filename for opt-in mode (default: .contextdb-enable)
  CTXDB_AUTO_CREATE_MARKER 1/true/yes/on to auto-create marker in opt-in mode (default: on)
  CTXDB_PRIVACY_BANNER   0/false/off to hide the interactive privacy banner (default: on)
  CTXDB_PRIVACY_COLOR    0/false/off to disable banner ANSI color (default: on unless NO_COLOR is set)
  CTXDB_CODEX_DISABLE_MCP 1/true/yes/on to launch Codex without MCP startup in wrapped runs
  CTXDB_ALLOW_DIRECT_NATIVE_AGENT 1 to bypass AIOS direct-agent block for diagnostics
  CTXDB_DEBUG            1/true/yes/on to print bridge decisions`);
}

export function parseArgs(argv, cwd = process.cwd()) {
  // 中文注释：-- 之后的参数全部是 passthrough，不检查 help 标记。
  const doubleDashIdx = argv.indexOf('--');
  const scanRange = doubleDashIdx !== -1 ? argv.slice(0, doubleDashIdx) : argv;
  const help = scanRange.includes('-h') || scanRange.includes('--help');

  try {
    const parsed = SHELL_BRIDGE_CLI.parse(argv, { from: 'user' });
    const flags = parsed.opts();

    // 提取 -- 后的 passthroughArgs
    let passthroughArgs;
    if (doubleDashIdx !== -1) {
      passthroughArgs = argv.slice(doubleDashIdx + 1);
    } else {
      passthroughArgs = (parsed.args || []).filter(
        (a) => !['-h', '--help'].includes(a),
      );
    }

    return {
      agent: flags.agent || '',
      command: flags.command || '',
      cwd: flags.cwd || cwd,
      help,
      passthroughArgs,
    };
  } catch {
    return {
      agent: '',
      command: '',
      cwd,
      help,
      passthroughArgs: [],
    };
  }
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
