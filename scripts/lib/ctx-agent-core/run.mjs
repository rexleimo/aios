import { existsSync } from 'node:fs';
import path from 'node:path';
import { compressPostReceiveTurn, compressPreSendTurn, emitTurnCompressionLog, requireTurnCompression } from '../interception/index.mjs';
import { loadFacade, generateFacadeFromSession } from '../contextdb/facade.mjs';
import { extractTouchedFilesFromText, writeContinuitySummary } from '../contextdb/continuity.mjs';
import { resolveTasksRoot, toWorkspaceRelative } from '../aios/state-root.mjs';
import { ensureBootstrapTask, isBootstrapEnabled } from '../../ctx-bootstrap.mjs';
import { assertWorkspaceExists } from './common.mjs';
import { ctx, extractCreatedSessionId, extractLatestSessionId } from './contextdb-cli.mjs';
import { printStartupSummary } from './startup-summary.mjs';
import { resolveTaskRouteDecision } from './routes.mjs';
import { classifyOneShotFailure, buildRoutedCommandSpec, runOneShotAgent, runRoutedOneShotTask } from './one-shot.mjs';
import { runInteractiveAgentWithSaveGuard } from './interactive.mjs';
import { handleWorkspaceCommand, runSaveGuardCheckpoint } from './workspace-commands.mjs';
import { parseArgs, resolveInitialWorkspace, validateOpts } from './args.mjs';

async function maybeCreateBootstrapTask(opts) {
  if (!opts.autoBootstrap || !isBootstrapEnabled(process.env)) return;
  try {
    const bootstrapResult = await ensureBootstrapTask(opts.workspaceRoot, { project: opts.project, agent: opts.agent });
    if (bootstrapResult.created) {
      const tasksRel = toWorkspaceRelative(opts.workspaceRoot, resolveTasksRoot(opts.workspaceRoot, { preferLegacyExisting: true }));
      console.log(`Bootstrap task created: ${tasksRel}/${bootstrapResult.taskPath}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] bootstrap task initialization failed: ${reason}`);
  }
}

async function runInteractiveStartup(opts) {
  if (opts.prompt) return false;

  let sessionId = opts.sessionId || '';
  let facadeResult = await loadFacade(opts.workspaceRoot);
  if (!facadeResult.ok) {
    facadeResult = { ok: true, facade: await generateFacadeFromSession(opts.workspaceRoot, opts.agent, opts.project) };
  }
  sessionId = facadeResult.facade?.sessionId || sessionId;
  await printStartupSummary(opts.workspaceRoot, facadeResult.facade);

  runInteractiveAgentWithSaveGuard(opts.agent, opts.extraArgs, {
    ...opts,
    sessionId,
  });
  return true;
}

function resolveSession(opts) {
  if (opts.sessionId) return opts.sessionId;
  const latestJson = ctx(opts.workspaceRoot, 'session:latest', ['--agent', opts.agent, '--project', opts.project]);
  const latestSessionId = extractLatestSessionId(latestJson);
  if (latestSessionId) return latestSessionId;
  const goal = opts.goal || `Shared context session for ${opts.agent} on ${opts.project}`;
  const createJson = ctx(opts.workspaceRoot, 'session:new', ['--agent', opts.agent, '--project', opts.project, '--goal', goal]);
  return extractCreatedSessionId(createJson);
}

async function ensureWorkspaceIndex(opts) {
  try {
    const { initWorkspace } = await import('../contextdb/workspace.mjs');
    const wsResult = await initWorkspace(opts.workspaceRoot);
    if (wsResult.created) {
      const { buildSkillIndex, writeSkillIndex } = await import('../contextdb/skill-index.mjs');
      const index = await buildSkillIndex(opts.workspaceRoot);
      await writeSkillIndex(opts.workspaceRoot, index);
      console.error(`[aios] Workspace initialized with ${index.skills.length} skills indexed`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] workspace bootstrap skipped: ${reason}`);
  }
}

function addPromptEvent(opts, promptTurnId) {
  ctx(opts.workspaceRoot, 'event:add', ['--session', opts.sessionId, '--role', 'user', '--kind', 'prompt', '--text', opts.prompt, '--turn-id', promptTurnId, '--turn-type', 'main', '--environment', 'cli', '--hindsight-status', 'pending']);
}

function addResponseEvent(opts, responseTurnId, promptTurnId, output, exitCode) {
  const maxChars = Number.parseInt(opts.maxLogChars, 10);
  const logOutput = output.slice(0, Number.isFinite(maxChars) ? maxChars : 8000);
  ctx(opts.workspaceRoot, 'event:add', [
    '--session', opts.sessionId, '--role', 'assistant', '--kind', exitCode === 0 ? 'response' : 'error', '--text', logOutput,
    '--turn-id', responseTurnId, '--parent-turn-id', promptTurnId, '--turn-type', 'main', '--environment', 'cli',
    '--hindsight-status', 'evaluated', '--outcome', exitCode === 0 ? 'success' : 'retry-needed',
  ]);
}

async function writeAutoCheckpoint(opts, routedPrompt, output, responseStatus, elapsedMs, exitCode) {
  const promptSnippet = opts.prompt.replace(/\n/g, ' ').slice(0, 200);
  const responseSnippet = output.replace(/\n/g, ' ').slice(0, 300);
  const summary = `Auto checkpoint: ${opts.agent} one-shot run completed. prompt="${promptSnippet}" response="${responseSnippet}"`;
  const nextActions = responseStatus === 'blocked' ? 'Inspect error output|Retry with adjusted prompt' : 'Review response|Continue with next prompt';
  const failureCategory = responseStatus === 'blocked' ? classifyOneShotFailure(output) : undefined;
  const checkpointArgs = ['--session', opts.sessionId, '--summary', summary, '--status', responseStatus, '--next', nextActions, '--verify-result', 'unknown', '--retry-count', '0', '--elapsed-ms', String(elapsedMs)];
  if (failureCategory) checkpointArgs.push('--failure-category', failureCategory);
  ctx(opts.workspaceRoot, 'checkpoint', checkpointArgs);
  await writeContinuityAndHandoff(opts, routedPrompt, output, summary, nextActions, exitCode);
}

async function writeContinuityAndHandoff(opts, routedPrompt, output, summary, nextActions, exitCode) {
  const touchedFiles = extractTouchedFilesFromText({ workspaceRoot: opts.workspaceRoot }, opts.prompt, output);
  if (opts.continuitySummary) {
    try {
      await writeContinuitySummary({ workspaceRoot: opts.workspaceRoot, sessionId: opts.sessionId, intent: routedPrompt, summary, touchedFiles, nextActions: nextActions.split('|') });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[warn] continuity summary skipped: ${reason}`);
    }
  }
  try {
    const { normalizeHandoffPacket, writeHandoffPacket } = await import('../contextdb/handoff.mjs');
    const packet = normalizeHandoffPacket({ fromSessionId: opts.sessionId, agentType: opts.agent, role: 'implementer', intent: routedPrompt, progress: summary, nextActions: nextActions.split('|'), touchedFiles, confidence: exitCode === 0 ? 'high' : 'low' });
    await writeHandoffPacket(opts.workspaceRoot, opts.sessionId, packet);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] handoff packet skipped: ${reason}`);
  }
}

async function executePrompt(opts) {
  // Parse an explicit execution route first, then let the policy decide whether
  // this turn is eligible for routing or plan persistence at all.
  const requestedRoute = resolveTaskRouteDecision({ prompt: opts.prompt, routeMode: opts.routeMode });
  const explicitIntent = requestedRoute.explicitTrigger && requestedRoute.routeMode !== 'single'
    ? (requestedRoute.routeMode === 'subagent' ? 'team' : requestedRoute.routeMode)
    : null;
  let workflow = null;
  try {
    const { runAutoGate } = await import('../planning/auto-gate.mjs');
    workflow = runAutoGate({
      rootDir: opts.workspaceRoot,
      message: opts.prompt,
      client: opts.agent || 'cli',
      sessionId: opts.sessionId || '',
      source: 'ctx-agent',
      explicitIntent,
      dryRun: Boolean(opts.dryRun || opts.routeExecutionMode === 'dry-run'),
    });
    console.error(`[aios] workflow: ${workflow.decision.disposition}/${workflow.decision.action} -> ${workflow.plan?.relativePath || 'n/a'}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] workflow policy skipped: ${reason}`);
  }

  let routeDecision = requestedRoute;
  if (workflow?.decision?.disposition !== 'planned') {
    routeDecision = {
      ...requestedRoute,
      routeMode: 'single',
      reason: `workflow ${workflow?.decision?.disposition || 'direct'}`,
    };
  } else if (!requestedRoute.explicitTrigger && ['team', 'harness'].includes(workflow.decision.executionHost)) {
    routeDecision = {
      ...requestedRoute,
      routeMode: workflow.decision.executionHost,
      reason: `workflow executionHost=${workflow.decision.executionHost}`,
    };
  }

  const routedPrompt = String(routeDecision.taskPrompt || '').trim() || String(opts.prompt || '').trim();
  if (routeDecision.routeMode !== 'single') console.log(`[route] mode=${routeDecision.routeMode} (${routeDecision.reason})`);
  if (opts.dryRun) {
    const previewPrompt = workflow?.injection
      ? `${workflow.injection}\n## User request\n\n${routedPrompt}\n`
      : routedPrompt;
    return { ...dryRunPrompt(opts, routeDecision, previewPrompt), routedPrompt, workflow };
  }
  // single/team/harness 共用同一外层 pre_send；执行宿主不能绕过压缩门或丢失当前 rex Command。
  const outbound = await compactCtxAgentPreSend({ opts, routedPrompt });
  let providerPrompt = workflow?.injection
    ? `${workflow.injection}\n## User request\n\n${outbound.prompt}\n`
    : outbound.prompt;
  if (workflow?.capabilityCommand?.provider?.kind === 'agent') {
    const { prepareAiosAgentProviderExecution } = await import('../workflows/rex-agent-provider.mjs');
    const prepared = await prepareAiosAgentProviderExecution({
      command: workflow.capabilityCommand,
      evidenceRoot: opts.workspaceRoot,
      workflowDirective: workflow.injection,
      userRequest: outbound.prompt,
    });
    providerPrompt = prepared.prompt;
  }

  let result;
  if (routeDecision.routeMode === 'single') {
    result = runOneShotAgent(opts.agent, providerPrompt, opts.extraArgs);
  } else {
    result = await runRoutedOneShotTask({
      ...opts,
      taskPrompt: providerPrompt,
      routeMode: routeDecision.routeMode,
      planPath: workflow?.plan?.absolutePath || '',
    });
  }
  return { ...result, routedPrompt, turnCompression: true, workflow };
}

async function compactCtxAgentPreSend({ opts, routedPrompt }) {
  const packet = await requireTurnCompression({
    workspaceRoot: opts.workspaceRoot,
    cwd: opts.workspaceRoot,
    sessionId: opts.sessionId,
    clientId: opts.agent,
    hostLevel: 'L2',
    mode: 'tight',
    eventKind: 'pre_send',
    text: routedPrompt,
    run: () => compressPreSendTurn({
      workspaceRoot: opts.workspaceRoot,
      cwd: opts.workspaceRoot,
      sessionId: opts.sessionId,
      clientId: opts.agent,
      hostLevel: 'L2',
      prompt: routedPrompt,
      mode: 'tight',
      metrics: { enabled: true },
    }),
  });
  emitTurnCompressionLog(packet);
  if (!packet?.refs?.length) {
    return { prompt: routedPrompt };
  }
  return {
    prompt: [
      'Use the AIOS compact packet below for this turn. Recall raw refs only if necessary.',
      '',
      JSON.stringify(packet, null, 2),
    ].join('\n'),
  };
}

async function compactCtxAgentPostReceive(opts, output) {
  const packet = await requireTurnCompression({
    workspaceRoot: opts.workspaceRoot,
    cwd: opts.workspaceRoot,
    sessionId: opts.sessionId,
    clientId: opts.agent,
    hostLevel: 'L2',
    mode: 'tight',
    eventKind: 'post_receive',
    text: output,
    run: () => compressPostReceiveTurn({
      workspaceRoot: opts.workspaceRoot,
      cwd: opts.workspaceRoot,
      sessionId: opts.sessionId,
      clientId: opts.agent,
      hostLevel: 'L2',
      output,
      mode: 'tight',
      metrics: { enabled: true },
    }),
  });
  emitTurnCompressionLog(packet);
  return packet?.refs?.length ? JSON.stringify(packet, null, 2) : output;
}

async function ingestRexProviderEvidence(opts, workflow, output, exitCode) {
  const command = workflow?.capabilityCommand;
  const activationId = command?.activationId || workflow?.capabilityActivation?.activationId;
  if (!activationId || !command) return Object.freeze({ required: false, ingested: true, reason: '' });
  if (exitCode !== 0) {
    return Object.freeze({ required: true, ingested: false, reason: 'provider-exit-nonzero' });
  }

  try {
    const { ingestCapabilityProviderOutput } = await import('../workflows/rex-capability-runtime.mjs');
    const ingestion = ingestCapabilityProviderOutput({
      rootDir: opts.workspaceRoot,
      command,
      output,
    });
    if (!ingestion.ingested) {
      console.warn(`[warn] rex evidence not recorded: ${ingestion.reason}; activation=${activationId}`);
      return Object.freeze({ required: true, ...ingestion });
    }

    const result = ingestion.result;
    const nextCommand = result.command || result.nextCapability?.command || null;
    console.error([
      `[aios] rex evidence: ${result.outcome}`,
      `activation=${activationId}`,
      `missing=${result.missingEvidence.length}`,
      `next=${nextCommand?.provider?.id || 'none'}`,
    ].join(' '));
    return Object.freeze({ required: true, ...ingestion });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] rex evidence rejected: ${reason}; activation=${activationId}`);
    return Object.freeze({ required: true, ingested: false, reason });
  }
}

function dryRunPrompt(opts, routeDecision, routedPrompt) {
  if (routeDecision.routeMode === 'single') {
    return { output: `[dry-run] ${opts.agent} would execute prompt without injected context.\nPrompt: ${routedPrompt}`, exitCode: 0 };
  }
  const routedSpec = buildRoutedCommandSpec({ ...opts, taskPrompt: routedPrompt, routeMode: routeDecision.routeMode });
  return { output: `[dry-run] routed task via ${routeDecision.routeMode} (${routedSpec.executionMode})\nCommand: ${routedSpec.preview}\nTask: ${routedPrompt}`, exitCode: 0 };
}

async function runPromptFlow(opts) {
  const oneShotTurnSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const promptTurnId = `oneshot:${opts.sessionId}:${oneShotTurnSeed}:prompt`;
  const responseTurnId = `oneshot:${opts.sessionId}:${oneShotTurnSeed}:response`;
  addPromptEvent(opts, promptTurnId);
  const startedAt = Date.now();
  const {
    output,
    protocolOutput = output,
    exitCode,
    routedPrompt,
    workflow,
  } = await executePrompt(opts);
  // 先从原始 Provider 输出摄取证据，再执行 post_receive 压缩；压缩结果不能作为状态机输入。
  const ingestion = await ingestRexProviderEvidence(opts, workflow, protocolOutput, exitCode);
  const effectiveExitCode = exitCode === 0 && ingestion.required && !ingestion.ingested ? 1 : exitCode;
  const blockedOutput = effectiveExitCode !== exitCode
    ? `${output}${output.endsWith('\n') ? '' : '\n'}[aios] blocked: rex Provider evidence contract failed (${ingestion.reason}).\n`
    : output;
  const compactOutput = await compactCtxAgentPostReceive(opts, blockedOutput);
  const elapsedMs = Date.now() - startedAt;
  process.stdout.write(compactOutput.endsWith('\n') ? compactOutput : `${compactOutput}\n`);
  const responseStatus = effectiveExitCode !== 0 ? 'blocked' : opts.checkpointStatus;
  addResponseEvent(opts, responseTurnId, promptTurnId, compactOutput, effectiveExitCode);
  if (opts.autoCheckpoint) await writeAutoCheckpoint(opts, routedPrompt, compactOutput, responseStatus, elapsedMs, effectiveExitCode);
  if (effectiveExitCode !== 0) process.exitCode = effectiveExitCode;
}

export async function runCtxAgent(argv = process.argv.slice(2)) {
  const firstArg = argv[0];
  if (['workspace-init', 'workspace-sync', 'workspace-doctor'].includes(firstArg)) {
    await handleWorkspaceCommand(firstArg, resolveInitialWorkspace({ workspaceRoot: '' }));
    return;
  }

  const opts = parseArgs(argv);
  validateOpts(opts);
  opts.workspaceRoot = path.resolve(resolveInitialWorkspace(opts));
  assertWorkspaceExists(opts.workspaceRoot);
  if (!opts.project) opts.project = path.basename(opts.workspaceRoot);
  if (opts.saveGuard) { runSaveGuardCheckpoint(opts); return; }

  if (opts.prompt) {
    await maybeCreateBootstrapTask(opts);
  }
  if (await runInteractiveStartup(opts)) return;

  ctx(opts.workspaceRoot, 'init', []);
  opts.sessionId = resolveSession(opts);
  if (!opts.sessionId) throw new Error('Failed to resolve session id from contextdb output');
  await ensureWorkspaceIndex(opts);

  console.error(`[aios] Session: ${opts.sessionId}`);
  console.error(`[aios] Context: none (no prompt injection) | Route: ${opts.routeMode}`);
  if (opts.prompt) { await runPromptFlow(opts); return; }
}
