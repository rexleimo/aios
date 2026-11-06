/* 中文注释：skill 参数解析，基于 Commander 声明式 */
import { Command } from 'commander';

const WORKSHOP_SUBCOMMANDS = new Set(['propose', 'review', 'apply', 'rollback', 'index']);
const ALL_SUBCOMMANDS = ['list', 'install', 'sync', 'remove', 'diagnose', 'comply', 'health', 'certify', 'verify-training', 'add', 'propose', 'review', 'apply', 'rollback', 'index'];

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
  ['--skill <ids>', 'Named Skill ids (repeatable or comma-separated) for certify/verify-training/add'],
  ['--yes', 'Non-interactive: install every skill found in the source'],
  ['--scope <global|project>', 'Skill scope'],
  ['--kind <builtin|external>', 'Skill source kind'],
  ['--source <path-or-url>', 'External skill source'],
  ['--project-root <path>', 'Project scope root'],
  ['--expected-revision <hash>', 'Require this preview revision before writing'],
  ['--force', 'Replace existing unmanaged skill directories'],
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
    skill: [], source: '', yes: false, force: false,
  };

  try {
    if (!subcommand) {
      if (rawSubcommand && !rawSubcommand.startsWith('-') && !help) {
        throw new Error('skill requires subcommand: comply, health, certify, verify-training, add, propose, review, apply, rollback, or index');
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
    } else if (subcommand === 'add') {
      options.source = posArgs[0] || '';
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
    if (effectiveFlags.yes === true) options.yes = true;
    if (effectiveFlags.force === true) options.force = true;
    if (effectiveFlags.skill !== undefined) {
      const listed = Array.isArray(effectiveFlags.skill) ? effectiveFlags.skill : [effectiveFlags.skill];
      options.skill = listed
        .flatMap((entry) => String(entry || '').split(','))
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    if (['list', 'install', 'sync', 'remove', 'diagnose'].includes(subcommand)) {
      options.name = posArgs[0] || '';
      options.scope = effectiveFlags.scope || 'global';
      options.kind = effectiveFlags.kind || 'external';
      options.source = effectiveFlags.source || '';
      options.projectRoot = effectiveFlags.projectRoot || '';
      options.expectedRevision = effectiveFlags.expectedRevision || '';
      options.client = effectiveFlags.client || (['list', 'diagnose'].includes(subcommand) ? 'all' : '');
      if (!['list', 'diagnose'].includes(subcommand) && !options.client) throw new Error('skill management requires a --client selection');
    }

    // 校验
    if (subcommand === 'add') {
      // add 的分发默认是"所有客户端"，与 comply 等审查类子命令默认单客户端不同。
      if (!effectiveFlags.client) options.client = 'all';
      if (!options.source) throw new Error('skill add requires a source path or git URL');
    }
    if (subcommand === 'review' && !options.id) throw new Error('skill review requires a proposal id');
    if (subcommand === 'apply' && !options.id) throw new Error('skill apply requires a proposal id');
    if (subcommand === 'rollback' && !options.name) throw new Error('skill rollback requires a skill name');
    if (subcommand === 'comply' && !options.path) throw new Error('skill comply requires a path');
    if (subcommand === 'certify' && !options.changed && options.skill.length === 0) {
      throw new Error('skill certify requires --changed or --skill <id>');
    }
    if (subcommand === 'index') options.scan = true;

    return { mode: 'command', help: false, command: 'skill', options };
  } catch (e) {
    if (e instanceof Error && (
      e.message.includes('requires a') || e.message.includes('requires subcommand') || e.message.includes('--format')
    )) throw e;
    return { mode: 'help', help: true, command: 'skill', options };
  }
}
