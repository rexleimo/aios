import fs from 'node:fs/promises';
import path from 'node:path';

import { getClientHomes } from '../platform/paths.mjs';

export const AIOS_ROUTE_COMMAND_BEGIN = '<!-- AIOS ROUTE COMMAND BEGIN -->';
export const AIOS_ROUTE_COMMAND_END = '<!-- AIOS ROUTE COMMAND END -->';

const ROUTE_COMMANDS = [
  {
    route: 'single',
    description: 'AIOS route: single',
    purpose: 'keep this task in the current client.',
  },
  {
    route: 'subagent',
    description: 'AIOS route: subagent',
    purpose: 'run one staged AIOS subagent route with verification gates.',
  },
  {
    route: 'team',
    description: 'AIOS route: team',
    purpose: 'run an AIOS team route for independent parallel work-items.',
  },
  {
    route: 'harness',
    description: 'AIOS route: harness',
    purpose: 'run the AIOS solo harness for long-running resumable work.',
  },
];

const CLIENT_LAYOUTS = {
  codex: {
    clientId: 'codex-cli',
    commandDir: 'prompts',
    extension: 'md',
    trigger: '/prompts',
    placeholder: '$ARGUMENTS',
    harnessProvider: 'codex',
  },
  claude: {
    clientId: 'claude-code',
    commandDir: 'commands',
    extension: 'md',
    trigger: '',
    placeholder: '$ARGUMENTS',
    harnessProvider: 'claude',
  },
  gemini: {
    clientId: 'gemini-cli',
    commandDir: 'commands',
    extension: 'toml',
    trigger: '',
    placeholder: '{{args}}',
    harnessProvider: 'gemini',
  },
  opencode: {
    clientId: 'opencode-cli',
    commandDir: 'commands',
    extension: 'md',
    trigger: '',
    placeholder: '$ARGUMENTS',
    harnessProvider: 'opencode',
  },
};

const ALL_CLIENTS = Object.keys(CLIENT_LAYOUTS);

function normalizeClientSelection(client = 'all') {
  const normalized = String(client || 'all').trim().toLowerCase();
  if (normalized === 'all') return [...ALL_CLIENTS];
  if (!CLIENT_LAYOUTS[normalized]) {
    throw new Error(`unsupported route command client: ${normalized}`);
  }
  return [normalized];
}

function resolveHomeMap(homeMap = {}, env = process.env) {
  return { ...getClientHomes(env), ...homeMap };
}

function formatShellArg(value = '') {
  const text = String(value ?? '');
  if (text === '$PWD') return '"$PWD"';
  if (text === '${PWD##*/}') return '"${PWD##*/}"';
  if (/^[A-Za-z0-9_./:@=-]+$/u.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function buildCtxAgentPath(rootDir) {
  return path.join(rootDir, 'scripts', 'ctx-agent.mjs');
}

function buildRoutedCommand({ rootDir, clientId, route, harnessProvider }) {
  const args = [
    buildCtxAgentPath(rootDir),
    '--agent',
    clientId,
    '--workspace',
    '$PWD',
    '--project',
    '${PWD##*/}',
    '--route',
    route,
    '--route-execute',
    'live',
    '--team-provider',
    'auto',
    '--team-workers',
    '3',
  ];
  if (route === 'subagent') {
    args.push('--blueprint', 'feature');
  }
  if (route === 'harness') {
    args.push('--harness-provider', harnessProvider, '--harness-max-iterations', '8');
  }
  args.push('--prompt', '<task>', '--no-bootstrap');
  return `node ${args.map((item) => formatShellArg(item)).join(' ')}`;
}

function buildRoutePromptBody({ rootDir, client, route, placeholder }) {
  const layout = CLIENT_LAYOUTS[client];
  const command = ROUTE_COMMANDS.find((item) => item.route === route);
  const displayTrigger = layout.trigger ? `${layout.trigger}:${route}` : `/${route}`;
  const taskBlock = [
    '**Task arguments**',
    placeholder,
  ].join('\n\n');

  if (route === 'single') {
    return [
      AIOS_ROUTE_COMMAND_BEGIN,
      `AIOS ${displayTrigger}: ${command.purpose}`,
      '',
      taskBlock,
      '',
      'Use the task arguments as the user request. If they are empty, ask for the task.',
      'Route decision: `single`. Do not invoke AIOS `subagent`, `team`, or `harness` commands for this request.',
      'Continue in the current client and follow the active project instructions, memory, and verification rules.',
      AIOS_ROUTE_COMMAND_END,
    ].join('\n');
  }

  const routedCommand = buildRoutedCommand({
    rootDir,
    clientId: layout.clientId,
    route,
    harnessProvider: layout.harnessProvider,
  });

  return [
    AIOS_ROUTE_COMMAND_BEGIN,
    `AIOS ${displayTrigger}: ${command.purpose}`,
    '',
    taskBlock,
    '',
    'If the task arguments are empty, ask for the task before running anything.',
    'Otherwise, execute the AIOS route directly from the current workspace; do not ask the user to run it manually unless they requested preview/dry-run.',
    'Replace `<task>` with the exact task arguments, quoted safely for the shell.',
    '',
    '```bash',
    routedCommand,
    '```',
    '',
    'After the routed command returns, summarize the command, status, artifacts, and next action.',
    AIOS_ROUTE_COMMAND_END,
  ].join('\n');
}

function buildMarkdownCommandContent({ rootDir, client, route }) {
  const layout = CLIENT_LAYOUTS[client];
  const command = ROUTE_COMMANDS.find((item) => item.route === route);
  return [
    '---',
    `description: ${command.description}`,
    'argument-hint: task',
    '---',
    '',
    buildRoutePromptBody({
      rootDir,
      client,
      route,
      placeholder: layout.placeholder,
    }),
    '',
  ].join('\n');
}

function escapeTomlString(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildTomlCommandContent({ rootDir, client, route }) {
  const layout = CLIENT_LAYOUTS[client];
  const command = ROUTE_COMMANDS.find((item) => item.route === route);
  return [
    '# AIOS ROUTE COMMAND BEGIN',
    `description = "${escapeTomlString(command.description)}"`,
    '',
    'prompt = """',
    buildRoutePromptBody({
      rootDir,
      client,
      route,
      placeholder: layout.placeholder,
    }),
    '"""',
    '# AIOS ROUTE COMMAND END',
    '',
  ].join('\n');
}

function buildCommandContent({ rootDir, client, route }) {
  const layout = CLIENT_LAYOUTS[client];
  if (layout.extension === 'toml') {
    return buildTomlCommandContent({ rootDir, client, route });
  }
  return buildMarkdownCommandContent({ rootDir, client, route });
}

export function buildRouteTriggerCommandTargets({
  rootDir,
  client = 'all',
  homeMap = {},
  env = process.env,
} = {}) {
  const homes = resolveHomeMap(homeMap, env);
  const clients = normalizeClientSelection(client);
  const targets = [];

  for (const currentClient of clients) {
    const layout = CLIENT_LAYOUTS[currentClient];
    const home = homes[currentClient];
    if (!home) {
      throw new Error(`missing home directory for ${currentClient}`);
    }
    for (const command of ROUTE_COMMANDS) {
      targets.push({
        client: currentClient,
        route: command.route,
        targetPath: path.join(home, layout.commandDir, `${command.route}.${layout.extension}`),
        content: buildCommandContent({ rootDir, client: currentClient, route: command.route }),
      });
    }
  }

  return targets;
}

function isManagedRouteCommand(content = '') {
  const text = String(content || '');
  return text.includes(AIOS_ROUTE_COMMAND_BEGIN) && text.includes(AIOS_ROUTE_COMMAND_END);
}

async function readOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return '';
    throw error;
  }
}

function createResult(client) {
  return {
    client,
    installed: 0,
    updated: 0,
    reused: 0,
    skipped: 0,
    removed: 0,
  };
}

export async function syncRouteTriggerCommands({
  rootDir,
  client = 'all',
  mode = 'install',
  homeMap = {},
  env = process.env,
  io = console,
} = {}) {
  const normalizedMode = String(mode || 'install').trim().toLowerCase();
  if (normalizedMode !== 'install' && normalizedMode !== 'uninstall') {
    throw new Error('route command mode must be install or uninstall');
  }

  const resultsByClient = new Map(normalizeClientSelection(client).map((item) => [item, createResult(item)]));
  const targets = buildRouteTriggerCommandTargets({ rootDir, client, homeMap, env });

  for (const target of targets) {
    const result = resultsByClient.get(target.client);
    const current = await readOptional(target.targetPath);

    if (normalizedMode === 'uninstall') {
      if (!current) {
        result.reused += 1;
        continue;
      }
      if (!isManagedRouteCommand(current)) {
        result.skipped += 1;
        io.log(`[skip] ${target.client} route command unmanaged: ${target.targetPath}`);
        continue;
      }
      await fs.rm(target.targetPath, { force: true });
      result.removed += 1;
      continue;
    }

    if (!current) {
      await fs.mkdir(path.dirname(target.targetPath), { recursive: true });
      await fs.writeFile(target.targetPath, target.content, 'utf8');
      result.installed += 1;
      continue;
    }
    if (current === target.content) {
      result.reused += 1;
      continue;
    }
    if (!isManagedRouteCommand(current)) {
      result.skipped += 1;
      io.log(`[skip] ${target.client} route command unmanaged: ${target.targetPath}`);
      continue;
    }
    await fs.writeFile(target.targetPath, target.content, 'utf8');
    result.updated += 1;
  }

  return {
    ok: true,
    results: [...resultsByClient.values()],
  };
}

export async function checkRouteTriggerCommandsSync({
  rootDir,
  client = 'all',
  homeMap = {},
  env = process.env,
} = {}) {
  const targets = buildRouteTriggerCommandTargets({ rootDir, client, homeMap, env });
  const reports = new Map(normalizeClientSelection(client).map((item) => [item, {
    client: item,
    issues: [],
    targets: [],
  }]));
  const issues = [];

  for (const target of targets) {
    const report = reports.get(target.client);
    report.targets.push(target.targetPath);
    const current = await readOptional(target.targetPath);
    if (!current) {
      const issue = `[${target.client}] [missing] ${target.targetPath}`;
      report.issues.push(issue);
      issues.push(issue);
      continue;
    }
    if (current === target.content) {
      continue;
    }
    if (!isManagedRouteCommand(current)) {
      const issue = `[${target.client}] [unmanaged conflict] ${target.targetPath}`;
      report.issues.push(issue);
      issues.push(issue);
      continue;
    }
    const issue = `[${target.client}] [drift] ${target.targetPath}`;
    report.issues.push(issue);
    issues.push(issue);
  }

  return {
    ok: issues.length === 0,
    reports: [...reports.values()],
    issues,
  };
}
