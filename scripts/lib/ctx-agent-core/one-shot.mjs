import { getClientCommandName, resolveClientFromRuntimeId } from '../clients/registry.mjs';
import { ROOT_DIR, parsePositiveInteger, runCommand, runCommandWithInput } from './common.mjs';
import { buildCodexMcpDisableArgs, buildRouteRuntimeEnv, buildCtxAgentRoutePreview, buildHarnessRoutePreview, normalizeOrchestrateBlueprint, normalizeRouteExecutionMode, normalizeRouteMode, resolveHarnessRouteProviderForAgent, resolveRoutedSubagentClient } from './routes.mjs';
import { buildOpenCodePrompt } from './opencode-context.mjs';

const PENDING_SMOKE_ONE_SHOT_AGENTS = new Set(['antigravity-cli', 'crush-cli']);

async function ensurePlanArtifact(rootDir, taskTitle) {
  const { promises: fs } = await import('node:fs');
  const pathMod = await import('node:path');
  const date = new Date().toISOString().slice(0, 10);
  const slug = String(taskTitle || 'task').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
  const planDir = pathMod.join(rootDir, 'docs', 'plans');
  const planPath = pathMod.join(planDir, `${date}-${slug}.md`);
  try {
    await fs.access(planPath);
    return planPath;
  } catch {}
  await fs.mkdir(planDir, { recursive: true });
  const content = [
    `# ${taskTitle || 'Task'}`,
    '',
    '## Progress',
    '- Plan auto-generated for team dispatch.',
    '',
    '## Decision Log',
    '- (none yet)',
    '',
    '## Acceptance',
    '- Task completed and verified.',
    '',
    '## Next Actions',
    '- Execute team dispatch.',
    '',
  ].join('\n');
  await fs.writeFile(planPath, content, 'utf8');
  return planPath;
}

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

function runCodexOneShot(prompt, extraArgs, injectContext, contextText) {
  const cmd = commandForRuntime('codex-cli');
  const args = buildCodexOneShotArgs({ extraArgs });
  const fullPrompt = injectContext ? `${contextText}\n\n## New User Request\n${prompt}` : prompt;
  const result = runCommandWithInput(cmd, args, fullPrompt);
  return { output: `${result.stdout || ''}${result.stderr || ''}`, exitCode: result.status ?? 1 };
}

const ONE_SHOT_HANDLERS = {
  'claude-code': ({ contextText, prompt, extraArgs, injectContext }) => runBufferedCommand(
    commandForRuntime('claude-code'),
    injectContext ? ['--print', '--append-system-prompt', contextText, prompt, ...extraArgs] : ['--print', prompt, ...extraArgs]
  ),
  'gemini-cli': ({ contextText, prompt, extraArgs, injectContext }) => runBufferedCommand(
    commandForRuntime('gemini-cli'),
    ['-p', injectContext ? `${contextText}\n\n## New User Request\n${prompt}` : prompt, ...extraArgs]
  ),
  'codex-cli': ({ contextText, prompt, extraArgs, injectContext }) => runCodexOneShot(prompt, extraArgs, injectContext, contextText),
  'opencode-cli': ({ contextText, prompt, extraArgs, injectContext, contextPacketPath }) => runBufferedCommand(
    commandForRuntime('opencode-cli'),
    ['run', ...extraArgs, buildOpenCodePrompt({ contextPacketPath, contextText, prompt, injectContext, promptKind: 'request' })]
  ),
};

export function runOneShotAgent(agent, contextText, prompt, extraArgs, { injectContext = true, contextPacketPath = '' } = {}) {
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
  return handler({ contextText, prompt, extraArgs, injectContext, contextPacketPath });
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
  const planPath = await ensurePlanArtifact(rootDir, taskTitle);
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
