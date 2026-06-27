import { takeValue } from './shared.mjs';

function isHelpArg(arg) {
  return arg === '-h' || arg === '--help' || arg === 'help';
}

const WORKSHOP_SUBCOMMANDS = new Set(['propose', 'review', 'apply', 'rollback', 'index']);

export function parseSkillArgs(argv = []) {
  const rest = argv.slice(1);
  const rawSubcommand = String(rest[0] || '').trim().toLowerCase();
  const options = {
    subcommand: isHelpArg(rawSubcommand) ? '' : rawSubcommand,
    json: false,
    format: 'text',
    dryRun: false,
    dashboard: false,
    changed: false,
    base: 'HEAD',
    client: 'codex',
    // Workshop fields
    description: '',
    id: '',
    action: '',
    name: '',
    scan: false,
    policy: false,
  };
  let help = isHelpArg(rawSubcommand);
  let start = 1;

  // Positional arguments for workshop subcommands:
  //   propose <description>
  //   review <id>
  //   apply <id>
  //   rollback <name>
  if (options.subcommand === 'propose') {
    const descArg = rest[1] || '';
    if (descArg && !isHelpArg(descArg) && !String(descArg).startsWith('-')) {
      options.description = descArg;
      start = 2;
    }
  } else if (options.subcommand === 'review') {
    const idArg = rest[1] || '';
    if (idArg && !isHelpArg(idArg) && !String(idArg).startsWith('-')) {
      options.id = idArg;
      start = 2;
    }
  } else if (options.subcommand === 'apply') {
    const idArg = rest[1] || '';
    if (idArg && !isHelpArg(idArg) && !String(idArg).startsWith('-')) {
      options.id = idArg;
      start = 2;
    }
  } else if (options.subcommand === 'rollback') {
    const nameArg = rest[1] || '';
    if (nameArg && !isHelpArg(nameArg) && !String(nameArg).startsWith('-')) {
      options.name = nameArg;
      start = 2;
    }
  } else if (options.subcommand === 'comply') {
    const pathArg = rest[1] || '';
    if (pathArg && !isHelpArg(pathArg) && !String(pathArg).startsWith('-')) {
      options.path = pathArg;
      start = 2;
    } else {
      options.path = '';
    }
  }

  for (let index = 1; index < rest.length; index += 1) {
    const arg = rest[index];
    if (index < start) {
      continue;
    }
    if (isHelpArg(arg)) {
      help = true;
      continue;
    } else if (arg === '--json') {
      options.json = true;
      options.format = 'json';
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--dashboard') {
      options.dashboard = true;
    } else if (arg === '--changed') {
      options.changed = true;
    } else if (arg === '--base') {
      options.base = takeValue(rest, index, '--base');
      index += 1;
    } else if (arg === '--client') {
      options.client = takeValue(rest, index, '--client');
      index += 1;
    } else if (arg === '--format') {
      options.format = takeValue(rest, index, '--format');
      options.json = options.format === 'json';
      index += 1;
    } else if (arg === '--approve') {
      options.action = 'approve';
    } else if (arg === '--reject') {
      options.action = 'reject';
    } else if (arg === '--quarantine') {
      options.action = 'quarantine';
    } else if (arg === '--scan') {
      options.scan = true;
    } else if (arg === '--policy') {
      options.policy = true;
    } else if (arg === '--description') {
      options.description = takeValue(rest, index, '--description');
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (help) {
    return {
      mode: 'help',
      help: true,
      command: 'skill',
      options,
    };
  }

  // Workshop subcommands don't need the old strict validation
  if (options.subcommand === 'propose') {
    // description is optional (defaults to empty)
    return { mode: 'command', help: false, command: 'skill', options };
  }
  if (options.subcommand === 'review') {
    if (!options.id) throw new Error('skill review requires a proposal id');
    return { mode: 'command', help: false, command: 'skill', options };
  }
  if (options.subcommand === 'apply') {
    if (!options.id) throw new Error('skill apply requires a proposal id');
    return { mode: 'command', help: false, command: 'skill', options };
  }
  if (options.subcommand === 'rollback') {
    if (!options.name) throw new Error('skill rollback requires a skill name');
    return { mode: 'command', help: false, command: 'skill', options };
  }
  if (options.subcommand === 'index') {
    // --scan is optional; defaults to true when subcommand is 'index'
    options.scan = true;
    return { mode: 'command', help: false, command: 'skill', options };
  }

  if (!options.subcommand) throw new Error('skill requires subcommand: comply, health, verify-training, propose, review, apply, rollback, or index');
  if (options.subcommand === 'comply') {
    if (!options.path) throw new Error('skill comply requires a path');
  }
  if (!['comply', 'health', 'verify-training', ...WORKSHOP_SUBCOMMANDS].includes(options.subcommand)) {
    throw new Error('skill requires subcommand: comply, health, verify-training, propose, review, apply, rollback, or index');
  }
  return {
    mode: 'command',
    help: false,
    command: 'skill',
    options,
  };
}
