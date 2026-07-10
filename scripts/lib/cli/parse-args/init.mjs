/* 中文注释：init 解析只校验 agent 名称和初始化开关——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';
import { INIT_AGENT_NAMES } from './shared.mjs';

const INIT_CLI = new Command()
  .name('init')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(false)
  .allowExcessArguments(false)
  .option('--agent <name>', 'Agent name to initialize for')
  .option('--default-mode <mode>', 'Default initialization mode')
  .option('--all', 'Initialize for all agents')
  .option('--dry-run', 'Preview changes without writing')
  .option('--yes-compression-tools', 'Authorize unattended RTK/Caveman/Headroom installation')
  .option('--yes-headroom-mcp', 'Authorize unattended Gemini/Grok Headroom MCP registration');

export function parseInitArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');

  try {
    const parsed = INIT_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const agent = String(flags.agent || '').trim().toLowerCase();

    if (flags.agent && !INIT_AGENT_NAMES.has(agent)) {
      throw new Error(`--agent must be one of: ${[...INIT_AGENT_NAMES].join(', ')}`);
    }

    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'init',
      options: {
        agent: agent || '',
        all: flags.all === true,
        dryRun: flags.dryRun === true,
        yesCompressionTools: flags.yesCompressionTools === true,
        yesHeadroomMcp: flags.yesHeadroomMcp === true,
        defaultMode: String(flags.defaultMode || '').trim(),
      },
    };
  } catch (e) {
    if (e instanceof Error && e.message.includes('--agent must be one of')) throw e;
    return {
      mode: 'help',
      help: true,
      command: 'init',
      options: {
        agent: '',
        all: false,
        dryRun: false,
        yesCompressionTools: false,
        yesHeadroomMcp: false,
        defaultMode: '',
      },
    };
  }
}
