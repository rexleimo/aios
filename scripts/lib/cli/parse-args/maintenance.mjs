import {
  INIT_AGENT_NAMES,
  INTERNAL_TARGETS,
  normalizeClient,
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeWrapMode,
  parsePositiveInteger,
  parsePrivacyMode,
  takeValue,
} from "./shared.mjs";

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
        if (target === 'privacy') {
          options.mode = parsePrivacyMode(takeValue(rest, index, '--mode'));
        } else {
          options.mode = normalizeWrapMode(takeValue(rest, index, '--mode'));
        }
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

export function parseMemoArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const passthrough = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') {
      passthrough.push(...rest.slice(index + 1));
      break;
    }
    if (arg === '-h' || arg === '--help' || arg === 'help') {
      help = true;
      continue;
    }
    passthrough.push(arg);
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'memo',
    options: {
      argv: passthrough,
    },
  };
}

export function parsePerceptionArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const options = {};

  let index = 0;
  if (rest[0] && !String(rest[0]).startsWith('-')) {
    options.subcommand = String(rest[0]).trim().toLowerCase();
    index = 1;
  }

  for (; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--space':
        options.space = takeValue(rest, index, '--space');
        index += 1;
        break;
      case '--format':
        options.format = takeValue(rest, index, '--format');
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--content-id':
        options.contentId = takeValue(rest, index, '--content-id');
        index += 1;
        break;
      case '--platform':
        options.platform = takeValue(rest, index, '--platform');
        index += 1;
        break;
      case '--content-type':
        options.contentType = takeValue(rest, index, '--content-type');
        index += 1;
        break;
      case '--title':
        options.title = takeValue(rest, index, '--title');
        index += 1;
        break;
      case '--publish-time':
        options.publishTime = takeValue(rest, index, '--publish-time');
        index += 1;
        break;
      case '--snapshot-window':
        options.snapshotWindow = takeValue(rest, index, '--snapshot-window');
        index += 1;
        break;
      case '--metrics':
        options.metrics = takeValue(rest, index, '--metrics');
        index += 1;
        break;
      case '--context':
        options.context = takeValue(rest, index, '--context');
        index += 1;
        break;
      case '--max-chars':
        options.maxChars = takeValue(rest, index, '--max-chars');
        index += 1;
        break;
      case '--min-sample':
        options.minSample = takeValue(rest, index, '--min-sample');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'perception',
    options,
  };
}

export function parseInitArgs(argv) {
  const rest = argv.slice(1);
  const options = {
    agent: '',
    all: false,
    dryRun: false,
  };
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--agent': {
        const agent = String(takeValue(rest, index, '--agent')).trim().toLowerCase();
        if (!INIT_AGENT_NAMES.has(agent)) {
          throw new Error(`--agent must be one of: ${[...INIT_AGENT_NAMES].join(', ')}`);
        }
        options.agent = agent;
        index += 1;
        break;
      }
      case '--all':
        options.all = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'init',
    options,
  };
}


export function parseRefsArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const options = { subcommand: 'list', session: '', limit: '20', keepDays: '30', pattern: '', nodeId: '', storage: '', workspaceRoot: '' };

  if (rest[0] && !String(rest[0]).startsWith('-')) {
    const sub = String(rest[0]).trim().toLowerCase();
    if (['grep', 'read', 'list', 'prune'].includes(sub)) {
      options.subcommand = sub;
      rest.shift();
    }
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '-h' || arg === '--help') { help = true; continue; }
    switch (arg) {
      case '--session': options.session = takeValue(rest, index, '--session'); index += 1; break;
      case '--limit': options.limit = takeValue(rest, index, '--limit'); index += 1; break;
      case '--keep-days': options.keepDays = takeValue(rest, index, '--keep-days'); index += 1; break;
      case '--storage': options.storage = takeValue(rest, index, '--storage'); index += 1; break;
      case '--workspace': options.workspaceRoot = takeValue(rest, index, '--workspace'); index += 1; break;
      default:
        if (!arg.startsWith('-')) {
          if (options.subcommand === 'grep' && !options.pattern) { options.pattern = arg; }
          else if (options.subcommand === 'read' && !options.nodeId) { options.nodeId = arg; }
        } else {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }
  return { mode: help ? 'help' : 'command', help, command: 'refs', options };
}

export function parseCanvasArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const options = { subcommand: 'show', session: 'default', format: 'mmd', storage: '', client: '', inputPath: '', workspaceRoot: '' };

  if (rest[0] && !String(rest[0]).startsWith('-')) {
    const sub = String(rest[0]).trim().toLowerCase();
    if (['show', 'path', 'backfill'].includes(sub)) {
      options.subcommand = sub;
      rest.shift();
    }
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '-h' || arg === '--help') { help = true; continue; }
    switch (arg) {
      case '--session': options.session = takeValue(rest, index, '--session'); index += 1; break;
      case '--format': options.format = takeValue(rest, index, '--format'); index += 1; break;
      case '--storage': options.storage = takeValue(rest, index, '--storage'); index += 1; break;
      case '--client': options.client = takeValue(rest, index, '--client'); index += 1; break;
      case '--input':
      case '--input-path': options.inputPath = takeValue(rest, index, arg); index += 1; break;
      case '--workspace': options.workspaceRoot = takeValue(rest, index, '--workspace'); index += 1; break;
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { mode: help ? 'help' : 'command', help, command: 'canvas', options };
}

export function parseModelRouterArgs(argv) {
  const rest = argv.slice(1);
  let help = false;
  const options = {};

  let index = 0;
  if (rest[0] && !String(rest[0]).startsWith('-')) {
    options.subcommand = String(rest[0]).trim().toLowerCase();
    index = 1;
  }

  for (; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--task':
      case '--prompt':
        options.task = takeValue(rest, index, arg);
        index += 1;
        break;
      case '--task-type':
        options.taskType = takeValue(rest, index, '--task-type');
        index += 1;
        break;
      case '--format':
        options.format = takeValue(rest, index, '--format');
        index += 1;
        break;
      case '--profile':
        options.profile = takeValue(rest, index, '--profile');
        index += 1;
        break;
      case '--explain':
        options.explain = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'model-router',
    options,
  };
}
