import path from 'node:path';

import { getClientRuntimeId } from '../../clients/registry.mjs';

import { AIOS_ROUTE_COMMAND_BEGIN, AIOS_ROUTE_COMMAND_END, CLIENT_LAYOUTS, ROUTE_COMMANDS } from './constants.mjs';
import { normalizeClientSelection, resolveHomeMap } from './selection.mjs';

// 纯函数：为生成的 shell 命令统一转义参数。
export function formatShellArg(value = '') {
  const text = String(value ?? '');
  if (text === '$PWD') return '"$PWD"';
  if (text === '${PWD##*/}') return '"${PWD##*/}"';
  if (/^[A-Za-z0-9_./:@=-]+$/u.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

export function buildCtxAgentPath(rootDir) {
  return path.join(rootDir, 'scripts', 'ctx-agent.mjs');
}

export function buildRoutedCommand({ rootDir, clientId, route, harnessProvider }) {
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

export function buildRoutePromptBody({ rootDir, client, route, placeholder }) {
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
      '**ALWAYS-ON planning:** first run `node scripts/aios.mjs plan auto-gate --task "<task arguments>" --client ' + client + '` and follow writing-plans against the AIOS plan artifact before other work.',
      'Continue in the current client and follow the active project instructions, memory, and verification rules.',
      AIOS_ROUTE_COMMAND_END,
    ].join('\n');
  }

  if (route === 'plan') {
    return [
      AIOS_ROUTE_COMMAND_BEGIN,
      `AIOS ${displayTrigger}: ${command.purpose}`,
      '',
      taskBlock,
      '',
      'This is an **AIOS intelligent planning** request. Do **not** stop at host-only Plan UI (Claude Plan mode, Hermes built-in planning, etc.).',
      '',
      'Required steps:',
      '1. Invoke `using-superpowers` then `brainstorming` (if scope unclear) and `writing-plans`.',
      '2. Create or update the AIOS plan artifact under `docs/plans/YYYY-MM-DD-<topic>.md`.',
      '3. Register active plan via shell (or MCP `aios_plan_start`):',
      '',
      '```bash',
      'node scripts/aios.mjs plan start --title "<short-title>" --task "<task arguments>" --client ' + client,
      '```',
      '',
      '4. If host Plan mode was used, **mirror the outcome into that file** before implementation.',
      '5. Do not implement code until the plan artifact exists, unless the user explicitly asked to skip planning.',
      '6. When finishing later, use `verification-before-completion` and `node scripts/aios.mjs plan set-status --status done`.',
      AIOS_ROUTE_COMMAND_END,
    ].join('\n');
  }

  const routedCommand = buildRoutedCommand({
    rootDir,
    clientId: getClientRuntimeId(client),
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

export function buildMarkdownCommandContent({ rootDir, client, route }) {
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

export function escapeTomlString(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildTomlCommandContent({ rootDir, client, route }) {
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

export function buildCommandContent({ rootDir, client, route }) {
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
