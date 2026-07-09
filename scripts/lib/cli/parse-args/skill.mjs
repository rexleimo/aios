/* 中文注释：skill 参数解析，基于 Commander 声明式 */
import { Command } from 'commander';

const WORKSHOP_SUBCOMMANDS = new Set(['propose', 'review', 'apply', 'rollback', 'index']);
const ALL_SUBCOMMANDS = ['comply', 'health', 'verify-training', 'propose', 'review', 'apply', 'rollback', 'index'];

const SHARED_OPTIONS = [
  ['--json', 'Output as JSON'],
  ['--format <text|json>', 'Output format'],
  ['--dry-run', 'Dry run mode'],
  ['--live', 'Live compliance probe (deterministic local runner)'],
  ['--dashboard', 'Show dashboard'],
  ['--changed', 'Only changed files'],
  ['--base <ref>', 'Base reference (default: HEAD)'],
  ['--client <name>', 'Client name (default: codex)'],
  ['--approve', 'Approve proposal'],
  ['--reject', 'Reject proposal'],
  ['--quarantine', 'Quarantine proposal'],
  ['--scan', 'Scan for proposals'],
  ['--policy', 'Policy check'],
  ['--description <text>', 'Proposal description'],
];

const program = new Command()
  .name('skill')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[args...]');

for (const name of ALL_SUBCOMMANDS) {
  const cmd = program
    .command(name)
    .description(`Skill ${name} command`)
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[args...]');
  for (const [flags, desc] of SHARED_OPTIONS) {
    cmd.option(flags, desc);
  }
}

export function parseSkillArgs(argv = []) {
  const rest = argv.slice(1);
  const rawSubcommand = String(rest[0] || '').trim().toLowerCase();
  const help = argv.includes('-h') || argv.includes('--help') || rest.includes('help');
  const isKnownSub = ALL_SUBCOMMANDS.includes(rawSubcommand);
  const subcommand = help || !isKnownSub ? '' : rawSubcommand;

  const options = {
    subcommand, json: false, format: 'text', dryRun: false,
    dashboard: false, changed: false, base: 'HEAD', client: 'codex',
    description: '', id: '', action: '', name: '', path: '', scan: false, policy: false, live: false,
  };

  try {
    if (!subcommand) {
      if (rawSubcommand && !rawSubcommand.startsWith('-') && !help) {
        throw new Error('skill requires subcommand: comply, health, verify-training, propose, review, apply, rollback, or index');
      }
      return { mode: 'help', help: true, command: 'skill', options };
    }

    // 处理 positional 参数（Commander 会把它们留在 args 中）
    const sliced = rest.slice(1); // 跳过子命令
    const parsed = program.parse(rest, { from: 'user' });

    // 获取子命令的 opts
    let effectiveFlags = {};
    const matchedCmd = parsed.commands?.find((c) => c.name() === subcommand);
    if (matchedCmd?.opts) effectiveFlags = matchedCmd.opts();

    // 从 args 中提取 positional 参数
    const posArgs = (parsed.args || []).filter(a => !String(a).startsWith('-') && a !== subcommand);

    // 提取位置参数到对应字段
    if (subcommand === 'propose') {
      options.description = posArgs[0] || '';
    } else if (subcommand === 'review' || subcommand === 'apply') {
      options.id = posArgs[0] || '';
    } else if (subcommand === 'rollback') {
      options.name = posArgs[0] || '';
    } else if (subcommand === 'comply') {
      options.path = posArgs[0] || '';
    }

    // 映射 flags
    if (effectiveFlags.json === true) { options.json = true; options.format = 'json'; }
    if (effectiveFlags.format) options.format = String(effectiveFlags.format);
    if (effectiveFlags.dryRun === true) options.dryRun = true;
    if (effectiveFlags.live === true) options.live = true;
    if (effectiveFlags.dashboard === true) options.dashboard = true;
    if (effectiveFlags.changed === true) options.changed = true;
    if (effectiveFlags.base) options.base = String(effectiveFlags.base);
    if (effectiveFlags.client) options.client = String(effectiveFlags.client);
    if (effectiveFlags.approve) options.action = 'approve';
    if (effectiveFlags.reject) options.action = 'reject';
    if (effectiveFlags.quarantine) options.action = 'quarantine';
    if (effectiveFlags.scan === true) options.scan = true;
    if (effectiveFlags.policy === true) options.policy = true;
    if (effectiveFlags.description) options.description = String(effectiveFlags.description);

    // 校验
    if (subcommand === 'review' && !options.id) throw new Error('skill review requires a proposal id');
    if (subcommand === 'apply' && !options.id) throw new Error('skill apply requires a proposal id');
    if (subcommand === 'rollback' && !options.name) throw new Error('skill rollback requires a skill name');
    if (subcommand === 'comply' && !options.path) throw new Error('skill comply requires a path');
    if (subcommand === 'index') options.scan = true;

    return { mode: 'command', help: false, command: 'skill', options };
  } catch (e) {
    if (e instanceof Error && (
      e.message.includes('requires a') || e.message.includes('requires subcommand') || e.message.includes('--format')
    )) throw e;
    return { mode: 'help', help: true, command: 'skill', options };
  }
}
