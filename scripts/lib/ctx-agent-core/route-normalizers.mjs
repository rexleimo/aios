import path from 'node:path';
import {
  CTX_AGENT_CLI_PATH,
  CTXDB_CODEX_DISABLE_MCP_ENV,
  ROOT_DIR,
  formatShellArg,
  parseBoolEnv,
  parsePositiveInteger,
} from './common.mjs';
import {
  getClientRuntimeId,
  resolveClientFromRuntimeId,
  resolveClientHarnessProviders,
  resolveClientRuntimeIds,
  resolveClientTeamProviders,
} from '../clients/registry.mjs';

export const ROUTE_MODES = new Set(['auto', 'single', 'team', 'subagent', 'harness']);
export const ROUTE_EXECUTION_MODES = new Set(['dry-run', 'live']);
export const TEAM_ROUTE_PROVIDERS = new Set(['auto', ...resolveClientTeamProviders('all')]);
export const HARNESS_ROUTE_PROVIDERS = new Set(['auto', ...resolveClientHarnessProviders('all')]);
export const ORCHESTRATE_BLUEPRINTS = new Set(['feature', 'bugfix', 'refactor', 'security']);
export const SUPPORTED_SUBAGENT_CLIENT_IDS = new Set(resolveClientRuntimeIds('all'));

export function normalizeRouteMode(rawValue = 'auto') {
  const value = String(rawValue || 'auto').trim().toLowerCase();
  if (!ROUTE_MODES.has(value)) throw new Error('--route must be one of: auto, single, team, subagent, harness');
  return value;
}

export function normalizeRouteExecutionMode(rawValue = 'dry-run') {
  const value = String(rawValue || 'live').trim().toLowerCase();
  if (!ROUTE_EXECUTION_MODES.has(value)) throw new Error('--route-execute must be one of: dry-run, live');
  return value;
}

export function normalizeTeamRouteProvider(rawValue = 'auto') {
  const value = String(rawValue || 'auto').trim().toLowerCase();
  if (!TEAM_ROUTE_PROVIDERS.has(value)) {
    throw new Error(`--team-provider must be one of: ${Array.from(TEAM_ROUTE_PROVIDERS).join(', ')}`);
  }
  return value;
}

export function normalizeOrchestrateBlueprint(rawValue = 'feature') {
  const value = String(rawValue || 'feature').trim().toLowerCase();
  if (!ORCHESTRATE_BLUEPRINTS.has(value)) throw new Error('--blueprint must be one of: feature, bugfix, refactor, security');
  return value;
}

export function normalizeHarnessRouteProvider(rawValue = 'auto') {
  const value = String(rawValue || 'auto').trim().toLowerCase();
  if (!HARNESS_ROUTE_PROVIDERS.has(value)) {
    throw new Error(`--harness-provider must be one of: ${Array.from(HARNESS_ROUTE_PROVIDERS).join(', ')}`);
  }
  return value;
}

export function inferHarnessProviderFromAgent(agent = '') {
  const provider = resolveClientFromRuntimeId(agent) || 'codex';
  return HARNESS_ROUTE_PROVIDERS.has(provider) ? provider : 'codex';
}

export function inferTeamProviderFromAgent(agent = '') {
  const provider = resolveClientFromRuntimeId(agent) || 'codex';
  return TEAM_ROUTE_PROVIDERS.has(provider) ? provider : 'codex';
}

export function inferSubagentClientFromProvider(provider = 'codex') {
  try {
    return getClientRuntimeId(provider);
  } catch {
    return getClientRuntimeId('codex');
  }
}

export function normalizeSubagentClient(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value) return '';
  return SUPPORTED_SUBAGENT_CLIENT_IDS.has(value) ? value : '';
}

export function resolveRoutedSubagentClient({ agent = 'codex-cli', teamProvider = 'auto', env = process.env } = {}) {
  const explicitRouteClient = normalizeSubagentClient(env?.CTXDB_ROUTE_SUBAGENT_CLIENT || '');
  if (explicitRouteClient) return explicitRouteClient;
  const explicitSubagentClient = normalizeSubagentClient(env?.AIOS_SUBAGENT_CLIENT || '');
  if (explicitSubagentClient) return explicitSubagentClient;
  const agentClient = normalizeSubagentClient(agent);
  if (agentClient) return agentClient;
  const provider = teamProvider === 'auto' ? inferTeamProviderFromAgent(agent) : normalizeTeamRouteProvider(teamProvider);
  return inferSubagentClientFromProvider(provider);
}

export function shouldInjectTaskRouterGuide(env = process.env) {
  return parseBoolEnv(env.CTXDB_TASK_ROUTER_GUIDE, true);
}

export function buildCodexMcpDisableArgs(env = process.env) {
  const disableMcpStartup = parseBoolEnv(env?.[CTXDB_CODEX_DISABLE_MCP_ENV], false);
  return disableMcpStartup ? ['-c', 'mcp_servers={}', '-c', 'features.rmcp_client=false'] : [];
}

export function resolveHarnessRouteProviderForAgent({ agent = 'codex-cli', harnessProvider = 'auto' } = {}) {
  const normalized = normalizeHarnessRouteProvider(harnessProvider);
  return normalized === 'auto' ? inferHarnessProviderFromAgent(agent) : normalized;
}

export function buildCtxAgentRoutePreview({
  agent = 'codex-cli', workspaceRoot = '', project = '', sessionId = '', routeMode = 'team', executionMode = 'live',
  teamProvider = 'auto', teamWorkers = 3, blueprint = 'feature', taskPrompt = '<task>',
} = {}) {
  const args = [CTX_AGENT_CLI_PATH, '--agent', agent];
  if (String(workspaceRoot || '').trim()) args.push('--workspace', String(workspaceRoot).trim());
  if (String(project || '').trim()) args.push('--project', String(project).trim());
  if (String(sessionId || '').trim()) args.push('--session', String(sessionId).trim());
  args.push('--route', normalizeRouteMode(routeMode), '--route-execute', normalizeRouteExecutionMode(executionMode), '--team-provider', normalizeTeamRouteProvider(teamProvider), '--team-workers', String(parsePositiveInteger(teamWorkers, 3)));
  if (normalizeRouteMode(routeMode) === 'subagent') args.push('--blueprint', normalizeOrchestrateBlueprint(blueprint));
  args.push('--prompt', String(taskPrompt || '').trim() || '<task>', '--no-bootstrap');
  return `node ${args.map((item) => formatShellArg(item)).join(' ')}`;
}

export function buildHarnessRoutePreview({ workspaceRoot = '', sessionId = '', provider = 'codex', taskPrompt = '<task>', maxIterations = 8, worktree = true } = {}) {
  const args = [path.join(ROOT_DIR, 'scripts', 'aios.mjs'), 'harness', 'run'];
  args.push('--objective', String(taskPrompt || '').trim() || '<task>');
  if (String(sessionId || '').trim()) args.push('--session', String(sessionId).trim());
  args.push('--provider', normalizeHarnessRouteProvider(provider));
  args.push('--max-iterations', String(parsePositiveInteger(maxIterations, 8)));
  if (worktree) args.push('--worktree');
  if (String(workspaceRoot || '').trim()) args.push('--workspace', String(workspaceRoot).trim());
  return `node ${args.map((item) => formatShellArg(item)).join(' ')}`;
}

export function buildRouteRuntimeEnv({ agent = 'codex-cli', teamProvider = 'auto', teamWorkers = 3, executionMode = 'live' } = {}) {
  const provider = teamProvider === 'auto' ? inferTeamProviderFromAgent(agent) : normalizeTeamRouteProvider(teamProvider);
  const env = {
    ...process.env,
    AIOS_SUBAGENT_CLIENT: resolveRoutedSubagentClient({ agent, teamProvider: provider, env: process.env }),
    AIOS_SUBAGENT_CONCURRENCY: String(parsePositiveInteger(teamWorkers, 3)),
  };
  if (normalizeRouteExecutionMode(executionMode) === 'live') env.AIOS_EXECUTE_LIVE = '1';
  return { env, provider };
}
