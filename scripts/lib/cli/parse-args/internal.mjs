/* 中文注释：internal 解析只处理组件维护入口，避免 maintenance 聚合所有命令语法。 */
import {
  INTERNAL_TARGETS,
  normalizeClient,
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeWrapMode,
  parsePositiveInteger,
  parsePrivacyMode,
  takeValue,
} from './shared.mjs';

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
  let help = false;
  const options = { target, action };
  if (target === 'native' && action === 'repair') {
    options.repairAction = 'list';
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (target === 'native' && action === 'repair' && !arg.startsWith('-')) {
      const repairAction = String(arg || '').trim().toLowerCase();
      if (!['list', 'show'].includes(repairAction)) {
        throw new Error('native repair action must be one of: list, show');
      }
      options.repairAction = repairAction;
      continue;
    }

    switch (arg) {
      case '--mode':
        options.mode = target === 'privacy'
          ? parsePrivacyMode(takeValue(rest, index, '--mode'))
          : normalizeWrapMode(takeValue(rest, index, '--mode'));
        index += 1;
        break;
      case '--client':
        options.client = normalizeClient(takeValue(rest, index, '--client'));
        index += 1;
        break;
      case '--scope':
        options.scope = normalizeSkillScope(takeValue(rest, index, '--scope'));
        index += 1;
        break;
      case '--skills':
        options.skills = normalizeSkillNames(takeValue(rest, index, '--skills'));
        index += 1;
        break;
      case '--install-mode':
        if (target !== 'skills') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.installMode = normalizeSkillInstallMode(takeValue(rest, index, '--install-mode'));
        index += 1;
        break;
      case '--rc-file':
        options.rcFile = takeValue(rest, index, '--rc-file');
        index += 1;
        break;
      case '--repo':
        options.repoUrl = takeValue(rest, index, '--repo');
        index += 1;
        break;
      case '--repair-id':
        if (target !== 'native' || (action !== 'rollback' && action !== 'repair')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.repairId = takeValue(rest, index, '--repair-id');
        index += 1;
        break;
      case '--limit':
        if (target !== 'native' || action !== 'repair') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.limit = parsePositiveInteger(takeValue(rest, index, '--limit'), '--limit');
        index += 1;
        break;
      case '--force':
        options.force = true;
        break;
      case '--update':
        options.update = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        if (target !== 'native' || action !== 'doctor') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.verbose = true;
        break;
      case '--fix':
        if (((target !== 'native' && target !== 'browser' && target !== 'codemap') || action !== 'doctor')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.fix = true;
        break;
      case '--skip-playwright-install':
        options.skipPlaywrightInstall = true;
        break;
      case '--enable':
        options.enable = true;
        break;
      case '--disable':
        options.disable = true;
        break;
      case '--workspace':
        if (target !== 'offload') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--storage':
        if (target !== 'offload') {
          throw new Error(`Unknown option: ${arg}`);
        }
        options.storage = takeValue(rest, index, '--storage');
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'internal',
    options,
  };
}
