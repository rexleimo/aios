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
  const routeDecision = resolveTaskRouteDecision({ prompt: opts.prompt, routeMode: opts.routeMode });
  let routedPrompt = String(routeDecision.taskPrompt || '').trim() || String(opts.prompt || '').trim();
  // ALWAYS-ON planning: always create/reuse plan artifact. Only single-route one-shots
  // get text inject — team/harness/subagent keep a clean task prompt (plan lives on disk).
  try {
    const { buildAlwaysOnPlanningDirective } = await import('../planning/auto-gate.mjs');
    const directive = buildAlwaysOnPlanningDirective({
      rootDir: opts.workspaceRoot,
      message: routedPrompt,
      client: opts.agent || 'cli',
    });
    if (routeDecision.routeMode === 'single') {
      routedPrompt = `${directive.text}\n\n## User request\n\n${routedPrompt}\n`;
    }
    console.error(`[aios] always-on planning: ${directive.action} -> ${directive.plan?.relativePath || 'n/a'}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[warn] always-on planning skipped: ${reason}`);
  }
  if (routeDecision.routeMode !== 'single') console.log(`[route] mode=${routeDecision.routeMode} (${routeDecision.reason})`);
  if (opts.dryRun) return { ...dryRunPrompt(opts, routeDecision, routedPrompt), routedPrompt };
  let result;
  if (routeDecision.routeMode === 'single') {
    const outbound = await compactCtxAgentPreSend({ opts, routedPrompt });
    result = runOneShotAgent(opts.agent, outbound.prompt, opts.extraArgs);
  } else {
    result = await runRoutedOneShotTask({ ...opts, taskPrompt: routedPrompt, routeMode: routeDecision.routeMode });
  }
  return { ...result, routedPrompt, turnCompression: routeDecision.routeMode === 'single' };
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
  const { output, exitCode, routedPrompt, turnCompression } = await executePrompt(opts);
  const compactOutput = turnCompression ? await compactCtxAgentPostReceive(opts, output) : output;
  const elapsedMs = Date.now() - startedAt;
  process.stdout.write(compactOutput.endsWith('\n') ? compactOutput : `${compactOutput}\n`);
  const responseStatus = exitCode !== 0 ? 'blocked' : opts.checkpointStatus;
  addResponseEvent(opts, responseTurnId, promptTurnId, compactOutput, exitCode);
  if (opts.autoCheckpoint) await writeAutoCheckpoint(opts, routedPrompt, compactOutput, responseStatus, elapsedMs, exitCode);
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
