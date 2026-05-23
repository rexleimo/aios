import path from 'node:path';
import {
  getClientRuntimeId,
  resolveClientFromCommandName,
  resolveClientFromRuntimeId,
  resolveClientsWithCapability,
} from '../../clients/registry.mjs';
import { CTX_AGENT_CLI_PATH, ROOT_DIR } from './constants.mjs';
import { formatShellArg, parseBoolEnv, parsePositiveInteger } from './shared.mjs';

const TEAM_PROVIDERS = new Set(resolveClientsWithCapability('team'));
const HARNESS_PROVIDERS = new Set(resolveClientsWithCapability('harness'));

export function isInteractivePassthrough(command, passthroughArgs) {
  const first = passthroughArgs[0] || '';
  if (!first) return true;
  if (first === '--help' || first === '-h' || first === '--version' || first === '-v') return false;
  // 有其他参数时按子命令/一次性任务处理，避免误注入交互提示。
  return false;
}

export function extractClaudePrintPrompt(passthroughArgs) {
  const remainingArgs = [];
  let printMode = false;
  let prompt = '';

  for (let i = 0; i < passthroughArgs.length; i += 1) {
    const arg = passthroughArgs[i];
    if (arg === '-p' || arg === '--print') {
      printMode = true;
      continue;
    }
    if (printMode && !prompt) {
      prompt = arg;
      continue;
    }
    remainingArgs.push(arg);
  }

  if (printMode && !prompt) {
    return { printMode, prompt: '', remainingArgs: passthroughArgs };
  }

  return { printMode, prompt, remainingArgs };
}

export function extractOneShotPrompt(command, passthroughArgs) {
  if (command === 'claude') {
    return extractClaudePrintPrompt(passthroughArgs);
  }

  return {
    printMode: false,
    prompt: '',
    remainingArgs: passthroughArgs,
  };
}

export function buildCtxAgentRoutePreview({
  agent = 'codex-cli',
  workspaceRoot = '',
  project = '',
  routeMode = 'team',
  executionMode = 'live',
  teamProvider = 'codex',
  teamWorkers = 3,
  blueprint = 'feature',
  taskPrompt = '<task>',
} = {}) {
  const args = [CTX_AGENT_CLI_PATH, '--agent', agent];
  if (String(workspaceRoot || '').trim()) {
    args.push('--workspace', String(workspaceRoot).trim());
  }
  if (String(project || '').trim()) {
    args.push('--project', String(project).trim());
  }
  args.push(
    '--route',
    String(routeMode || 'team').trim(),
    '--route-execute',
    String(executionMode || 'live').trim(),
    '--team-provider',
    normalizeTeamProvider(teamProvider) || 'codex',
    '--team-workers',
    String(parsePositiveInteger(teamWorkers, 3)),
  );
  if (String(routeMode || '').trim() === 'subagent') {
    args.push('--blueprint', blueprint);
  }
  args.push(
    '--prompt',
    String(taskPrompt || '').trim() || '<task>',
    '--no-bootstrap',
  );
  return `node ${args.map((item) => formatShellArg(item)).join(' ')}`;
}

export function normalizeHarnessProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return HARNESS_PROVIDERS.has(normalized) ? normalized : '';
}

export function inferHarnessProviderFromCommand(command) {
  return resolveClientFromCommandName(command) || 'codex';
}

export function buildHarnessRoutePreview({
  workspaceRoot = '',
  sessionId = '',
  provider = 'codex',
  taskPrompt = '<task>',
  maxIterations = 8,
} = {}) {
  const args = [path.join(ROOT_DIR, 'scripts', 'aios.mjs'), 'harness', 'run'];
  args.push('--objective', String(taskPrompt || '').trim() || '<task>');
  if (String(sessionId || '').trim()) {
    args.push('--session', String(sessionId).trim());
  }
  args.push('--provider', normalizeHarnessProvider(provider) || 'codex');
  args.push('--max-iterations', String(parsePositiveInteger(maxIterations, 8)));
  args.push('--worktree');
  if (String(workspaceRoot || '').trim()) {
    args.push('--workspace', String(workspaceRoot).trim());
  }
  return `node ${args.map((item) => formatShellArg(item)).join(' ')}`;
}

export function normalizeTeamProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return TEAM_PROVIDERS.has(normalized) ? normalized : '';
}

export function inferTeamProviderFromCommand(command) {
  const client = resolveClientFromCommandName(command);
  return normalizeTeamProvider(client) || 'codex';
}

export function inferSubagentClientFromProvider(provider) {
  const normalized = normalizeTeamProvider(provider);
  return normalized ? getClientRuntimeId(normalized) : 'codex-cli';
}

export function inferSubagentClientFromCommand(command) {
  const client = resolveClientFromCommandName(command);
  return client ? getClientRuntimeId(client) : '';
}

export function normalizeSubagentClient(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return resolveClientFromRuntimeId(normalized) ? normalized : '';
}

export function resolveSubagentClientForPrompt(command, provider, env) {
  const explicitRouteClient = normalizeSubagentClient(env.CTXDB_ROUTE_SUBAGENT_CLIENT);
  if (explicitRouteClient) return explicitRouteClient;
  const explicitClient = normalizeSubagentClient(env.AIOS_SUBAGENT_CLIENT);
  if (explicitClient) return explicitClient;
  const commandClient = normalizeSubagentClient(inferSubagentClientFromCommand(command));
  if (commandClient) return commandClient;
  return inferSubagentClientFromProvider(provider);
}

export function buildInteractiveAutoPrompt({
  agent = 'codex-cli',
  command = 'codex',
  workspaceRoot = '',
  project = '',
  env = process.env,
} = {}) {
  const provider = normalizeTeamProvider(env.CTXDB_TEAM_PROVIDER)
    || normalizeTeamProvider(env.AIOS_TEAM_PROVIDER)
    || inferTeamProviderFromCommand(command);
  const workers = parsePositiveInteger(env.CTXDB_TEAM_WORKERS, 3);
  const rawBlueprint = String(env.CTXDB_ORCHESTRATE_BLUEPRINT || '').trim().toLowerCase();
  const blueprint = rawBlueprint === 'bugfix' || rawBlueprint === 'refactor' || rawBlueprint === 'security'
    ? rawBlueprint
    : 'feature';
  const subagentClient = resolveSubagentClientForPrompt(command, provider, env);
  const harnessProvider = normalizeHarnessProvider(env.CTXDB_HARNESS_PROVIDER)
    || normalizeHarnessProvider(env.AIOS_HARNESS_PROVIDER)
    || inferHarnessProviderFromCommand(command);
  const harnessMaxIterations = parsePositiveInteger(env.CTXDB_HARNESS_MAX_ITERATIONS || env.AIOS_HARNESS_MAX_ITERATIONS, 8);
  const teamCommand = buildCtxAgentRoutePreview({
    agent,
    workspaceRoot,
    project,
    routeMode: 'team',
    executionMode: 'live',
    teamProvider: provider,
    teamWorkers: workers,
    taskPrompt: '<task>',
  });
  const subagentCommand = buildCtxAgentRoutePreview({
    agent: subagentClient,
    workspaceRoot,
    project,
    routeMode: 'subagent',
    executionMode: 'live',
    teamProvider: provider,
    teamWorkers: workers,
    blueprint,
    taskPrompt: '<task>',
  });
  const harnessCommand = buildHarnessRoutePreview({
    workspaceRoot,
    provider: harnessProvider,
    taskPrompt: '<task>',
    maxIterations: harnessMaxIterations,
  });

  return [
    'Continue from this state and execute the next best step.',
    'Routing policy: default to single-route execution.',
    'Privacy boundary: LLM instructions are advisory; deterministic AIOS checks are the enforcement layer.',
    'Use `aios privacy read --file <path>` for sensitive files such as .env, tokens, cookies, session data, browser profiles, and MCP configs.',
    'Do not paste raw secrets, credentials, cookies, personal data, or private browser profile data into prompts/logs/checkpoints.',
    'Do not claim strict privacy compliance unless AIOS gates verified it; report what was checked and any remaining risk.',
    'Only choose team/subagent when the user explicitly asks for delegation/parallel work, or when there are 2+ clearly independent domains.',
    'Only choose harness for explicit long-running, overnight, resumable, checkpoint-heavy objectives that need an iteration journal.',
    'Do NOT spawn built-in explorer/worker subagents just to scan a codebase; start single-agent first.',
    'If delegated workers are running, post a heartbeat every 30s and stop waiting after 120s with a fallback plan.',
    `If route=team, run: ${teamCommand}`,
    `If route=subagent, run: ${subagentCommand}`,
    `If route=harness, run: ${harnessCommand}`,
    'Do not ask the user to manually trigger these commands unless they requested preview/dry-run.',
  ].join('\n');
}

export function shouldInjectInteractiveAutoPrompt(env) {
  return parseBoolEnv(env.CTXDB_INTERACTIVE_AUTO_ROUTE, true);
}
