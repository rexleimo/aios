/* 中文注释：internal 解析只处理组件维护入口——基于 Commander 声明式替代手写 for 循环。
 * internal 子命令结构复杂（target/action 动态组合），Commander 不适合完全接管。
 * 保留 target/action 的手写分发，但选项解析交给 Commander。 */
import { Command } from 'commander';
import {
  INTERNAL_TARGETS,
  normalizeClient,
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeWrapMode,
  parsePositiveInteger,
  parsePrivacyMode,
} from './shared.mjs';

// 根据不同 target/action 组合动态构建 Commander spec
function buildInternalCli(target, action) {
  const program = new Command()
    .name('internal')
    .helpOption(false)
    .exitOverride()
    .allowUnknownOption(true)
    .allowExcessArguments(true);

  // 通用选项——所有 target 共享
  const commonOptions = [
    ['--dry-run', 'Preview without writing'],
    ['--force', 'Force operation'],
    ['--update', 'Update mode'],
  ];

  for (const [flags, desc] of commonOptions) {
    program.option(flags, desc);
  }

  // target-specific 选项
  if (target === 'native' || target === 'browser' || target === 'codemap') {
    if (action === 'doctor') {
      program.option('--verbose', 'Verbose output');
      program.option('--fix', 'Auto-fix issues');
    }
  }
  if (target === 'native' && (action === 'rollback' || action === 'repair')) {
    program.option('--repair-id <id>', 'Repair/rollback target ID');
  }
  if (target === 'native' && action === 'repair') {
    program.option('--limit <n>', 'Max repair entries');
  }
  if (target === 'skills') {
    program.option('--install-mode <mode>', 'Skill install mode');
    program.option('--skills <names>', 'Comma-separated skill names');
    program.option('--scope <scope>', 'Skill scope');
    program.option('--enable', 'Enable skills');
    program.option('--disable', 'Disable skills');
  }
  program.option('--mode <mode>', 'Operation mode');
  program.option('--client <name>', 'Target client');
  program.option('--rc-file <path>', 'RC file path');
  program.option('--repo <url>', 'Repository URL');
  program.option('--skip-playwright-install', 'Skip Playwright install');

  if (target === 'offload') {
    program.option('--workspace <path>', 'Workspace root');
    program.option('--storage <path>', 'Storage path');
  }

  return program;
}

export function parseInternalArgs(argv) {
  const target = String(argv[0] || '').trim().toLowerCase();
  const action = String(argv[1] || '').trim().toLowerCase();
  if (!INTERNAL_TARGETS.has(target)) {
    throw new Error(`Unknown internal target: ${argv[0] || '<missing>'}`);
  }
  if (!action) {
    throw new Error(`Missing internal action for target: ${target}`);
  }

  const rest = argv.slice(2);
  const help = rest.includes('-h') || rest.includes('--help');
  const options = { target, action };
  if (target === 'native' && action === 'repair') {
    options.repairAction = 'list';
  }

  // 位置参数：native repair 的 repair-action
  const positionalArgs = rest.filter(a => !a.startsWith('-') && a !== '--');

  try {
    const cli = buildInternalCli(target, action);
    const parsed = cli.parse(rest, { from: 'user' });
    const flags = parsed.opts();

    // 位置参数：native repair 子命令
    if (target === 'native' && action === 'repair' && positionalArgs.length > 0) {
      const repairAction = String(positionalArgs[0]).trim().toLowerCase();
      if (!['list', 'show'].includes(repairAction)) {
        throw new Error('native repair action must be one of: list, show');
      }
      options.repairAction = repairAction;
    }

    // 映射 Commander flags 到 options
    if (flags.dryRun) options.dryRun = true;
    if (flags.force) options.force = true;
    if (flags.update) options.update = true;
    if (flags.mode) {
      options.mode = target === 'privacy'
        ? parsePrivacyMode(flags.mode)
        : normalizeWrapMode(flags.mode);
    }
    if (flags.client) options.client = normalizeClient(flags.client);
    if (flags.scope) options.scope = normalizeSkillScope(flags.scope);
    if (flags.skills) options.skills = normalizeSkillNames(flags.skills);
    if (flags.installMode) options.installMode = normalizeSkillInstallMode(flags.installMode);
    if (flags.rcFile) options.rcFile = flags.rcFile;
    if (flags.repo) options.repoUrl = flags.repo;
    if (flags.repairId) options.repairId = flags.repairId;
    if (flags.limit) options.limit = parsePositiveInteger(flags.limit, '--limit');
    if (flags.verbose) options.verbose = true;
    if (flags.fix) options.fix = true;
    if (flags.skipPlaywrightInstall) options.skipPlaywrightInstall = true;
    if (flags.enable) options.enable = true;
    if (flags.disable) options.disable = true;
    if (flags.workspace) options.workspaceRoot = flags.workspace;
    if (flags.storage) options.storage = flags.storage;

    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'internal',
      options,
    };
  } catch (e) {
    if (e instanceof Error && (
      e.message.includes('Unknown internal target') ||
      e.message.includes('must be one of') ||
      e.message.includes('Missing internal'))) throw e;
    return {
      mode: 'help',
      help: true,
      command: 'internal',
      options,
    };
  }
}
