import { getClientCommandName, resolveClientFromRuntimeId } from '../clients/registry.mjs';
import { ROOT_DIR, parsePositiveInteger, runCommand, runCommandWithInput } from './common.mjs';
import { buildCodexMcpDisableArgs, buildRouteRuntimeEnv, buildCtxAgentRoutePreview, buildHarnessRoutePreview, normalizeOrchestrateBlueprint, normalizeRouteExecutionMode, normalizeRouteMode, resolveHarnessRouteProviderForAgent, resolveRoutedSubagentClient } from './routes.mjs';
import { buildOpenCodePrompt } from './opencode-context.mjs';
import { buildOpenCodeStrictAgentArgs } from '../opencode/strict-primary-agent.mjs';

const PENDING_SMOKE_ONE_SHOT_AGENTS = new Set([]);

export function classifyOneShotFailure(detail) {
  if (!detail) return undefined;
  const normalized = String(detail).toLowerCase();
  if (normalized.includes('timeout') || normalized.includes('timed out')) return 'timeout';
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) return 'rate-limit';
  if (normalized.includes('auth') || normalized.includes('login')) return 'auth';
  if (normalized.includes('network') || normalized.includes('enotfound') || normalized.includes('econn')) return 'network';
  if (normalized.includes('permission') || normalized.includes('denied')) return 'permission';
  return 'tool';
}

function commandForRuntime(agent) {
  const client = resolveClientFromRuntimeId(agent);
  if (!client) {
    throw new Error(`Unsupported one-shot agent: ${agent}`);
  }
  return getClientCommandName(client);
}

function runBufferedCommand(command, args) {
  const result = runCommand(command, args);
  return { output: `${result.stdout || ''}${result.stderr || ''}`, exitCode: result.status ?? 1 };
}

export function buildCodexOneShotArgs({ configArgs = buildCodexMcpDisableArgs(process.env), extraArgs = [] } = {}) {
  return ['exec', ...configArgs, ...extraArgs, '-'];
}

function runCodexOneShot(prompt, extraArgs) {
  const cmd = commandForRuntime('codex-cli');
  const args = buildCodexOneShotArgs({ extraArgs });
  const result = runCommandWithInput(cmd, args, prompt);
  return { output: `${result.stdout || ''}${result.stderr || ''}`, exitCode: result.status ?? 1 };
}

const ONE_SHOT_HANDLERS = {
  'claude-code': ({ prompt, extraArgs }) => runBufferedCommand(
    commandForRuntime('claude-code'),
    ['--print', prompt, ...extraArgs]
  ),
  'gemini-cli': ({ prompt, extraArgs }) => runBufferedCommand(
    commandForRuntime('gemini-cli'),
    ['-p', prompt, ...extraArgs]
  ),
  'codex-cli': ({ prompt, extraArgs }) => runCodexOneShot(prompt, extraArgs),
  'opencode-cli': ({ prompt, extraArgs }) => runBufferedCommand(
    commandForRuntime('opencode-cli'),
    ['run', ...buildOpenCodeStrictAgentArgs(extraArgs), buildOpenCodePrompt({ prompt })]
  ),
  'grok-build': ({ prompt, extraArgs }) => runBufferedCommand(
    commandForRuntime('grok-build'),
    ['--always-approve', '-p', prompt, ...extraArgs]
  ),
};

// Exported for tests only: lets verification assert handlers are registered
// even while the pending-smoke short-circuit still blocks live execution.
export const ONE_SHOT_HANDLERS_FOR_TEST = ONE_SHOT_HANDLERS;

export function runOneShotAgent(agent, prompt, extraArgs) {
  if (PENDING_SMOKE_ONE_SHOT_AGENTS.has(agent)) {
    return {
      output: `${agent} is pending-smoke: live one-shot execution is blocked until CLI arguments, MCP config, and unattended smoke evidence are verified.\n`,
      exitCode: 1,
    };
  }
  const handler = ONE_SHOT_HANDLERS[agent];
  if (!handler) {
    return {
      output: `${agent} is unsupported for one-shot execution; no verified handler is registered.\n`,
      exitCode: 1,
    };
  }
  return handler({ prompt, extraArgs });
}

export function buildRoutedCommandSpec({
  workspaceRoot = process.cwd(), project = '', agent = 'codex-cli', routeMode = 'team', routeExecutionMode = 'dry-run', teamProvider = 'auto',
  teamWorkers = 3, harnessProvider = 'auto', harnessMaxIterations = 8, blueprint = 'feature', taskPrompt = '', sessionId = '',
} = {}) {
  const executionMode = normalizeRouteExecutionMode(routeExecutionMode);
  const effectiveRoute = normalizeRouteMode(routeMode);
  const effectivePrompt = String(taskPrompt || '').trim();
  const { env: commandEnv, provider } = buildRouteRuntimeEnv({ agent, teamProvider, teamWorkers, executionMode });
  const workers = parsePositiveInteger(teamWorkers, 3);

  if (effectiveRoute === 'team') {
    return { command: process.execPath, args: [], env: commandEnv, cwd: workspaceRoot, preview: buildCtxAgentRoutePreview({ agent, workspaceRoot, project, sessionId, routeMode: 'team', executionMode, teamProvider: provider, teamWorkers: workers, taskPrompt: effectivePrompt }), provider, workers, executionMode, routeMode: effectiveRoute };
  }
  if (effectiveRoute === 'subagent') {
    const effectiveBlueprint = normalizeOrchestrateBlueprint(blueprint);
    const subagentClient = resolveRoutedSubagentClient({ agent, teamProvider: provider, env: process.env });
    return { command: process.execPath, args: [], env: commandEnv, cwd: workspaceRoot, preview: buildCtxAgentRoutePreview({ agent: subagentClient, workspaceRoot, project, sessionId, routeMode: 'subagent', executionMode, teamProvider: provider, teamWorkers: workers, blueprint: effectiveBlueprint, taskPrompt: effectivePrompt }), provider, workers, executionMode, routeMode: effectiveRoute, blueprint: effectiveBlueprint };
  }
  if (effectiveRoute === 'harness') {
    const resolvedProvider = resolveHarnessRouteProviderForAgent({ agent, harnessProvider });
    return { command: process.execPath, args: [], env: commandEnv, cwd: workspaceRoot, preview: buildHarnessRoutePreview({ workspaceRoot, sessionId, provider: resolvedProvider, taskPrompt: effectivePrompt, maxIterations: harnessMaxIterations }), provider: resolvedProvider, workers, executionMode, routeMode: effectiveRoute, harnessMaxIterations: parsePositiveInteger(harnessMaxIterations, 8) };
  }
  throw new Error(`Unsupported routed mode: ${effectiveRoute}`);
}

function createBufferedIo(outputChunks) {
  return {
    log: (...parts) => outputChunks.push(parts.join(' ')),
    warn: (...parts) => outputChunks.push(parts.join(' ')),
    error: (...parts) => outputChunks.push(parts.join(' ')),
  };
}

function formatRoutedOutput(spec, commandOutput) {
  const lines = [`[ctx-agent route] mode=${spec.routeMode} execute=${spec.executionMode}`, `Command: ${spec.preview}`];
  if (commandOutput) lines.push(commandOutput);
  return `${lines.join('\n')}\n`;
}

export async function runRoutedOneShotTask(options = {}) {
  const spec = buildRoutedCommandSpec(options);
  const outputChunks = [];
  const io = createBufferedIo(outputChunks);

  if (spec.routeMode === 'harness') {
    const { runHarnessCommand } = await import('../lifecycle/harness.mjs');
    const result = await runHarnessCommand({
      subcommand: 'run', objective: String(options.taskPrompt || '').trim(), sessionId: String(options.sessionId || '').trim(),
      provider: spec.provider, profile: 'standard', worktree: true, baseRef: 'HEAD', maxIterations: spec.harnessMaxIterations,
      lifecycleHooks: true, dryRun: spec.executionMode !== 'live', json: true,
    }, { rootDir: options.workspaceRoot || process.cwd(), aiosRootDir: ROOT_DIR, io });
    return { output: formatRoutedOutput(spec, outputChunks.join('\n').trim()), exitCode: result.exitCode ?? 1, preview: spec.preview, routeMode: spec.routeMode, executionMode: spec.executionMode };
  }

  const { runOrchestrate } = await import('../lifecycle/orchestrate.mjs');
  const useGroupChat = spec.routeMode === 'team' && spec.executionMode === 'live';
  const rootDir = options.workspaceRoot || process.cwd();
  const taskTitle = String(options.taskPrompt || '').trim();
  const planPath = String(options.planPath || '').trim();
  if (!planPath && spec.executionMode === 'live') {
    return {
      output: formatRoutedOutput(spec, '[workflow] live routed execution requires a persisted policy plan.'),
      exitCode: 1,
      preview: spec.preview,
      routeMode: spec.routeMode,
      executionMode: spec.executionMode,
    };
  }
  const result = await runOrchestrate({
    blueprint: spec.routeMode === 'subagent' ? spec.blueprint : options.blueprint,
    taskTitle,
    contextSummary: '',
    planPath,
    sessionId: String(options.sessionId || '').trim(),
    dispatchMode: 'local',
    executionMode: spec.executionMode,
    preflightMode: 'auto',
    format: 'json',
  }, { rootDir, env: spec.env, io, runtimeId: useGroupChat ? 'groupchat-runtime' : '' });
  return { output: formatRoutedOutput(spec, outputChunks.join('\n').trim()), exitCode: result.exitCode ?? 1, preview: spec.preview, routeMode: spec.routeMode, executionMode: spec.executionMode };
}
