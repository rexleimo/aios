import { existsSync } from 'node:fs';
import path from 'node:path';
import { compressPostReceiveTurn, compressPreSendTurn } from '../interception/index.mjs';
import { loadFacade, generateFacadeFromSession } from '../contextdb/facade.mjs';
import { extractTouchedFilesFromText, writeContinuitySummary } from '../contextdb/continuity.mjs';
import { contextDbRelativePath, resolveTasksRoot, toWorkspaceRelative } from '../aios/state-root.mjs';
import { ensureBootstrapTask, isBootstrapEnabled } from '../../ctx-bootstrap.mjs';
import { assertWorkspaceExists } from './common.mjs';
import { buildMemoryPrelude, ensureMemoryLayers } from './memory.mjs';
import { ctx, extractCreatedSessionId, extractLatestSessionId } from './contextdb-cli.mjs';
import {
  buildFacadePrompt,
  buildPersistenceInstructions,
  buildSlimInjection,
  forkAsyncBootstrap,
  formatMemoryPreludeStatus,
  shouldLazyLoad,
  shouldScheduleAsyncBootstrap,
  shouldStrictContextPack,
  writeLatestInjectedContext,
} from './facade.mjs';
import { ensureOpenCodeContextPacket, safeContextPack } from './opencode-context.mjs';
import { buildTaskRouterGuide, resolveTaskRouteDecision, shouldInjectTaskRouterGuide } from './routes.mjs';
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

function routerGuideFor(opts, sessionId) {
  if (!shouldInjectTaskRouterGuide(process.env)) return '';
  return buildTaskRouterGuide({
    agent: opts.agent,
    workspaceRoot: opts.workspaceRoot,
    project: opts.project,
    teamProvider: opts.teamProvider,
    teamWorkers: opts.teamWorkers,
    harnessProvider: opts.harnessProvider,
    harnessMaxIterations: opts.harnessMaxIterations,
    blueprint: opts.blueprint,
    routeMode: opts.routeMode,
    sessionId,
  });
}

async function buildFullContext(workspaceRoot, opts, baseText, sessionId, handoffInjection = '') {
  const memoryPrelude = await buildMemoryPrelude(workspaceRoot, process.env);
  const persistenceInstructions = buildPersistenceInstructions();
  const baseContextText = memoryPrelude
    ? baseText ? `${memoryPrelude}\n\n${persistenceInstructions}\n\n${baseText}` : `${memoryPrelude}\n\n${persistenceInstructions}`
    : baseText ? `${persistenceInstructions}\n\n${baseText}` : persistenceInstructions;
  const withHandoff = handoffInjection ? `${baseContextText}\n\n${handoffInjection}` : baseContextText;
  const routerGuide = routerGuideFor(opts, sessionId);
  return routerGuide ? (withHandoff ? `${withHandoff}\n\n${routerGuide}` : routerGuide) : withHandoff;
}

async function buildLazyInteractivePrompt(opts, facadeResult) {
  const facadePrompt = buildFacadePrompt(facadeResult.facade, opts.agent);
  const sessionId = facadeResult.facade?.sessionId || '';
  if (opts.contextMode === 'slim') {
    const slimInjection = buildSlimInjection({ sessionId, status: 'running', agent: opts.agent, workspaceRoot: opts.workspaceRoot });
    console.error(`[aios] Session: ${sessionId || '(new)'} | Context: slim (registry pull) | Route: ${opts.routeMode}`);
    return { sessionId, effectivePrompt: `${slimInjection}\n\n${facadePrompt}` };
  }

  let handoffInjection = '';
  try {
    const { readHandoffPacket, renderHandoffInjection } = await import('../contextdb/handoff.mjs');
    const prevSessionId = facadeResult.facade?.sessionId;
    if (prevSessionId) handoffInjection = renderHandoffInjection(await readHandoffPacket(opts.workspaceRoot, prevSessionId));
  } catch {
    // handoff injection optional
  }
  const effectivePrompt = await buildFullContext(opts.workspaceRoot, opts, facadePrompt, sessionId, handoffInjection);
  const memoryPrelude = await buildMemoryPrelude(opts.workspaceRoot, process.env);
  console.error(`[aios] Session: ${sessionId || '(new)'}`);
  console.error(`[aios] Memory: ${memoryPrelude ? 'persona+user+workspace loaded' : 'empty'} | Context: lazy-load | Route: ${opts.routeMode}`);
  console.log(formatMemoryPreludeStatus(memoryPrelude));
  return { sessionId, effectivePrompt };
}

async function maybeRunLazyInteractive(opts) {
  if (!shouldLazyLoad(process.env) || opts.prompt) return false;
  let facadeResult = await loadFacade(opts.workspaceRoot);
  if (!facadeResult.ok) {
    facadeResult = { ok: true, facade: await generateFacadeFromSession(opts.workspaceRoot, opts.agent, opts.project) };
  }
  const { sessionId, effectivePrompt } = await buildLazyInteractivePrompt(opts, facadeResult);
  if (shouldScheduleAsyncBootstrap(facadeResult, opts.agent, opts.workspaceRoot)) forkAsyncBootstrap(opts.workspaceRoot, opts);
  runInteractiveAgentWithSaveGuard(opts.agent, effectivePrompt, opts.extraArgs, { ...opts, injectContext: true, sessionId });
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

async function prepareContext(opts) {
  const packPath = contextDbRelativePath(opts.workspaceRoot, 'exports', `${opts.sessionId}-context.md`);
  const strictPack = shouldStrictContextPack(process.env);
  const packResult = await safeContextPack(opts.workspaceRoot, { sessionId: opts.sessionId, eventLimit: opts.eventLimit, packPath }, { strict: strictPack });
  const contextText = packResult.contextText;
  const effectiveContextText = opts.contextMode === 'slim'
    ? (contextText ? `${buildSlimInjection({ sessionId: opts.sessionId, status: opts.checkpointStatus, agent: opts.agent, workspaceRoot: opts.workspaceRoot })}\n\n${contextText}` : buildSlimInjection({ sessionId: opts.sessionId, status: opts.checkpointStatus, agent: opts.agent, workspaceRoot: opts.workspaceRoot }))
    : await buildFullContext(opts.workspaceRoot, opts, contextText, opts.sessionId);
  return { packPath, strictPack, packResult, contextText, effectiveContextText, injectContext: String(effectiveContextText).trim().length > 0 };
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

async function executePrompt(opts, context) {
  const routeDecision = resolveTaskRouteDecision({ prompt: opts.prompt, routeMode: opts.routeMode });
  const routedPrompt = String(routeDecision.taskPrompt || '').trim() || String(opts.prompt || '').trim();
  if (routeDecision.routeMode !== 'single') console.log(`[route] mode=${routeDecision.routeMode} (${routeDecision.reason})`);
  if (opts.dryRun) return { ...dryRunPrompt(opts, context.packResult.packAbs, routeDecision, routedPrompt), routedPrompt };
  let result;
  if (routeDecision.routeMode === 'single') {
    const outbound = await compactCtxAgentPreSend({ opts, context, routedPrompt });
    result = runOneShotAgent(opts.agent, outbound.contextText, outbound.prompt, opts.extraArgs, { injectContext: outbound.injectContext, contextPacketPath: context.openCodeContextPacketPath });
  } else {
    result = await runRoutedOneShotTask({ ...opts, taskPrompt: routedPrompt, routeMode: routeDecision.routeMode });
  }
  return { ...result, routedPrompt, turnCompression: routeDecision.routeMode === 'single' };
}

async function compactCtxAgentPreSend({ opts, context, routedPrompt }) {
  const sentText = context.openCodeContextPacketPath
    ? routedPrompt
    : context.injectContext ? `${context.effectiveContextText}\n\n${routedPrompt}` : routedPrompt;
  const packet = await compressPreSendTurn({
    workspaceRoot: opts.workspaceRoot,
    cwd: opts.workspaceRoot,
    sessionId: opts.sessionId,
    clientId: opts.agent,
    hostLevel: 'L2',
    prompt: sentText,
    mode: 'tight',
    metrics: { enabled: true },
  });
  if (!packet?.refs?.length) {
    return { contextText: context.effectiveContextText, prompt: routedPrompt, injectContext: context.injectContext };
  }
  return {
    contextText: JSON.stringify(packet, null, 2),
    prompt: 'Use the AIOS compact packet above for this turn. Recall raw refs only if necessary.',
    injectContext: true,
  };
}

async function compactCtxAgentPostReceive(opts, output) {
  const packet = await compressPostReceiveTurn({
    workspaceRoot: opts.workspaceRoot,
    cwd: opts.workspaceRoot,
    sessionId: opts.sessionId,
    clientId: opts.agent,
    hostLevel: 'L2',
    output,
    mode: 'tight',
    metrics: { enabled: true },
  });
  return packet?.refs?.length ? JSON.stringify(packet, null, 2) : output;
}

function dryRunPrompt(opts, packAbs, routeDecision, routedPrompt) {
  if (routeDecision.routeMode === 'single') {
    return { output: `[dry-run] ${opts.agent} would execute prompt with context packet: ${packAbs}\nPrompt: ${routedPrompt}`, exitCode: 0 };
  }
  const routedSpec = buildRoutedCommandSpec({ ...opts, taskPrompt: routedPrompt, routeMode: routeDecision.routeMode });
  return { output: `[dry-run] routed task via ${routeDecision.routeMode} (${routedSpec.executionMode})\nCommand: ${routedSpec.preview}\nTask: ${routedPrompt}`, exitCode: 0 };
}

async function runPromptFlow(opts, context) {
  const oneShotTurnSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const promptTurnId = `oneshot:${opts.sessionId}:${oneShotTurnSeed}:prompt`;
  const responseTurnId = `oneshot:${opts.sessionId}:${oneShotTurnSeed}:response`;
  addPromptEvent(opts, promptTurnId);
  const startedAt = Date.now();
  const { output, exitCode, routedPrompt, turnCompression } = await executePrompt(opts, context);
  const compactOutput = turnCompression ? await compactCtxAgentPostReceive(opts, output) : output;
  const elapsedMs = Date.now() - startedAt;
  process.stdout.write(compactOutput.endsWith('\n') ? compactOutput : `${compactOutput}\n`);
  const responseStatus = exitCode !== 0 ? 'blocked' : opts.checkpointStatus;
  addResponseEvent(opts, responseTurnId, promptTurnId, compactOutput, exitCode);
  if (opts.autoCheckpoint) await writeAutoCheckpoint(opts, routedPrompt, compactOutput, responseStatus, elapsedMs, exitCode);
  try {
    await safeContextPack(opts.workspaceRoot, { sessionId: opts.sessionId, eventLimit: opts.eventLimit, packPath: context.packPath }, { strict: context.strictPack });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] context packet refresh skipped: ${reason}`);
  }
  if (exitCode !== 0) process.exit(exitCode);
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

  await maybeCreateBootstrapTask(opts);
  await ensureMemoryLayers(opts.workspaceRoot, { agent: opts.agent, project: opts.project });
  if (await maybeRunLazyInteractive(opts)) return;

  ctx(opts.workspaceRoot, 'init', []);
  opts.sessionId = resolveSession(opts);
  if (!opts.sessionId) throw new Error('Failed to resolve session id from contextdb output');
  await ensureWorkspaceIndex(opts);

  const context = await prepareContext(opts);
  try {
    if (context.injectContext) await writeLatestInjectedContext({ workspaceRoot: opts.workspaceRoot, agent: opts.agent, sessionId: opts.sessionId, contextText: context.effectiveContextText });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] latest context snapshot write failed: ${reason}`);
  }
  context.openCodeContextPacketPath = opts.agent === 'opencode-cli' && context.injectContext
    ? await ensureOpenCodeContextPacket({ workspaceRoot: opts.workspaceRoot, sessionId: opts.sessionId, packAbs: context.packResult.ok ? context.packResult.packAbs : '', contextText: context.effectiveContextText, baseContextText: context.contextText })
    : '';

  console.error(`[aios] Session: ${opts.sessionId}`);
  console.error(`[aios] Context: ${opts.contextMode === 'slim' ? 'slim (registry pull)' : `full (${context.packResult.mode})`} | Route: ${opts.routeMode}`);
  if (opts.prompt && opts.dryRun) console.log(context.effectiveContextText);
  if (opts.prompt) { await runPromptFlow(opts, context); return; }
  runInteractiveAgentWithSaveGuard(opts.agent, context.effectiveContextText, opts.extraArgs, { ...opts, injectContext: context.injectContext, contextPacketPath: context.openCodeContextPacketPath });
}
