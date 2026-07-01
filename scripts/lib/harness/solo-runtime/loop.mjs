import { Buffer } from 'node:buffer';
import { readContinuitySummary } from '../../contextdb/continuity.mjs';
import { findCanvasMermaid, compactCanvas } from '../../offload/mermaid-canvas.mjs';
import { capture, resolveStorage, resolveConfig } from '../../offload/tool-offload.mjs';
import { readSoloControl, readSoloRunSummary, writeSoloRunSummary } from '../solo-journal.mjs';
import { sleep, resolveSoloBackoffState, shouldAbortForConsecutiveFailures, maxConsecutiveFailures } from './backoff.mjs';
import { evaluateDryRunReadiness, formatDryRunReadiness } from './dry-run-readiness.mjs';
import { writeSoloIterationCheckpoint } from './checkpoint.mjs';
import { invokeLifecycleHook } from './hooks.mjs';
import { normalizeSoloIterationOutcome } from './normalizers.mjs';
import { buildStopOutcome, persistIterationState } from './state.mjs';

export async function runSoloHarnessLoop({
  rootDir,
  sessionId,
  objective,
  provider,
  clientId,
  profile,
  worktree = null,
  maxIterations = 20,
  executeTurn,
  lifecycleHooks = {},
  checkpointWriter = writeSoloIterationCheckpoint,
  sleepImpl = sleep,
} = {}) {
  if (typeof executeTurn !== 'function') {
    throw new Error('runSoloHarnessLoop requires executeTurn');
  }

  let summary = await readSoloRunSummary({ rootDir, sessionId });
  if (!summary) {
    summary = await writeSoloRunSummary({
      rootDir,
      sessionId,
      objective,
      provider,
      clientId,
      profile,
      worktree,
    });
  }

  // ── Dry-run readiness preflight ──
  // 在进入主循环前检测环境问题，避免 agent 跑到一半才失败。
  // blocked 级别直接拒绝启动；warning 级别记录但继续。
  const readiness = evaluateDryRunReadiness(rootDir, {
    sessionId,
    provider,
    worktree,
    resume: Boolean(summary?.lastIteration),
  });
  if (readiness.level === 'blocked') {
    const blockedOutcome = normalizeSoloIterationOutcome({
      sessionId,
      iteration: 0,
      outcome: 'failed',
      stage: 'handoff',
      summary: `Harness blocked by dry-run readiness check: ${readiness.reasons.join('; ')}`,
      evidence: readiness.checks.filter(c => c.status === 'fail').map(c => `${c.label}: ${c.detail}`),
      nextAction: readiness.nextActions.join(' '),
      shouldStop: true,
      failureClass: 'safety-gate',
    });
    summary = await persistIterationState({
      rootDir,
      sessionId,
      summary,
      outcome: blockedOutcome,
      checkpointWriter,
    });
    return { summary, stoppedByControl: false, readiness };
  }

  let iteration = Number.isFinite(summary.lastIteration) ? summary.lastIteration + 1 : 1;
  const max = Number.isFinite(maxIterations) ? Math.max(1, Math.floor(maxIterations)) : 20;

  while (iteration <= max) {
    const control = await readSoloControl({ rootDir, sessionId });
    if (control?.stopRequested === true) {
      summary = await persistIterationState({
        rootDir,
        sessionId,
        summary,
        outcome: buildStopOutcome({ sessionId, iteration }),
        checkpointWriter,
      });
      await invokeLifecycleHook({
        rootDir,
        sessionId,
        hook: 'onSessionEnd',
        phase: 'session-end',
        iteration,
        callback: lifecycleHooks?.onSessionEnd,
        payload: {
          rootDir,
          sessionId,
          objective: summary.objective,
          iteration,
          summary,
          stoppedByControl: true,
          reason: 'control-stop-request',
        },
      });
      return {
        summary,
        stoppedByControl: true,
      };
    }

    const nowMs = Date.now();
    const untilMs = Date.parse(summary.backoff?.until || '');
    if (Number.isFinite(untilMs) && untilMs > nowMs) {
      await sleepImpl(untilMs - nowMs);
    }

    const turnLogEntries = [];
    const onTurnStartResult = await invokeLifecycleHook({
      rootDir,
      sessionId,
      hook: 'onTurnStart',
      phase: 'turn-start',
      iteration,
      callback: lifecycleHooks?.onTurnStart,
      payload: {
        rootDir,
        sessionId,
        objective: summary.objective,
        iteration,
        summary,
        provider: summary.provider,
        clientId: summary.clientId,
        profile: summary.profile,
        worktree,
      },
    });
    if (onTurnStartResult?.logEntry) {
      turnLogEntries.push(onTurnStartResult.logEntry);
    }

    const [continuity, offloadCanvas] = await Promise.all([
      readContinuitySummary({ workspaceRoot: rootDir, sessionId }),
      findCanvasMermaid(rootDir, sessionId),
    ]);
    const rawTurn = await executeTurn({
      rootDir,
      sessionId,
      objective: summary.objective,
      iteration,
      provider: summary.provider,
      clientId: summary.clientId,
      profile: summary.profile,
      summary,
      continuity,
      offloadCanvas,
      worktree,
    });

    const outcome = normalizeSoloIterationOutcome({
      sessionId,
      iteration,
      ...(rawTurn && typeof rawTurn === 'object' ? rawTurn : {}),
    });

    const onTurnCompleteResult = await invokeLifecycleHook({
      rootDir,
      sessionId,
      hook: 'onTurnComplete',
      phase: 'turn-complete',
      iteration,
      callback: lifecycleHooks?.onTurnComplete,
      payload: {
        rootDir,
        sessionId,
        objective: summary.objective,
        iteration,
        summary,
        outcome,
        rawTurn: rawTurn && typeof rawTurn === 'object' ? rawTurn : {},
      },
    });
    if (onTurnCompleteResult?.logEntry) {
      turnLogEntries.push(onTurnCompleteResult.logEntry);
    }

    const onBeforeContinuityCommitResult = await invokeLifecycleHook({
      rootDir,
      sessionId,
      hook: 'onBeforeContinuityCommit',
      phase: 'pre-continuity-commit',
      iteration,
      callback: lifecycleHooks?.onBeforeContinuityCommit,
      payload: {
        rootDir,
        sessionId,
        objective: summary.objective,
        iteration,
        summary,
        outcome,
      },
    });
    if (onBeforeContinuityCommitResult?.logEntry) {
      turnLogEntries.push(onBeforeContinuityCommitResult.logEntry);
    }

    summary = await persistIterationState({
      rootDir,
      sessionId,
      summary,
      outcome,
      prompt: rawTurn?.prompt || '',
      rawOutput: rawTurn?.rawOutput || '',
      extraLogEntries: [...(rawTurn?.logEntries || []), ...turnLogEntries],
      checkpointWriter,
    });

    // offload turn output + auto-compact canvas
    try {
      const config = resolveConfig({ offload: { enabled: true, minBytes: 512 } });
      const storage = resolveStorage({}, process.env, { offload: { storage: 'file' } });
      const outputStr = rawTurn?.rawOutput || outcome?.summary || '';
      const outputSize = Buffer.byteLength(outputStr, 'utf8');
      if (outputSize >= config.minBytes) {
        await capture(
          {
            client: summary.clientId || summary.provider || 'codex',
            session: sessionId,
            tool: `harness-turn-${iteration}`,
            input: rawTurn?.prompt || summary.objective || '',
            output: outputStr,
            exitCode: outcome.outcome === 'success' ? 0 : 1,
            durationMs: 0,
          },
          { workspaceRoot: rootDir, storage, config },
        );
      }
      await compactCanvas(rootDir, sessionId, storage);
    } catch {
      // offload failure should not block harness execution
    }

    if (outcome.shouldStop) {
      await invokeLifecycleHook({
        rootDir,
        sessionId,
        hook: 'onSessionEnd',
        phase: 'session-end',
        iteration,
        callback: lifecycleHooks?.onSessionEnd,
        payload: {
          rootDir,
          sessionId,
          objective: summary.objective,
          iteration,
          summary,
          stoppedByControl: false,
          reason: 'iteration-stop',
        },
      });
      return {
        summary,
        stoppedByControl: false,
      };
    }

    // 连续失败 abort：避免 agent 在不可恢复的故障中无限重试浪费 token
    if (shouldAbortForConsecutiveFailures(summary.backoff)) {
      const abortOutcome = normalizeSoloIterationOutcome({
        sessionId,
        iteration,
        outcome: 'failed',
        stage: 'handoff',
        summary: `Aborted after ${maxConsecutiveFailures()} consecutive failures.`,
        evidence: [`consecutiveFailures=${summary.backoff?.consecutiveFailures || maxConsecutiveFailures()}`],
        nextAction: 'Inspect the harness journal and checkpoint to diagnose the repeated failure, then resume with a fresh objective.',
        shouldStop: true,
        failureClass: summary.backoff?.consecutiveInfraFailures > 0 ? 'runtime-error' : 'no-progress',
      });
      summary = await persistIterationState({
        rootDir,
        sessionId,
        summary,
        outcome: abortOutcome,
        checkpointWriter,
      });
      await invokeLifecycleHook({
        rootDir,
        sessionId,
        hook: 'onSessionEnd',
        phase: 'session-end',
        iteration,
        callback: lifecycleHooks?.onSessionEnd,
        payload: {
          rootDir,
          sessionId,
          objective: summary.objective,
          iteration,
          summary,
          stoppedByControl: false,
          reason: 'consecutive-failures-abort',
        },
      });
      return {
        summary,
        stoppedByControl: false,
      };
    }

    iteration += 1;
  }

  const maxOutcome = normalizeSoloIterationOutcome({
    sessionId,
    iteration,
    outcome: 'human-gate',
    stage: 'handoff',
    summary: `Reached maxIterations (${max}).`,
    evidence: [`maxIterations=${max}`],
    nextAction: 'Review the latest iteration and resume when the objective is ready for another loop.',
    shouldStop: true,
    failureClass: 'safety-gate',
  });
  summary = await persistIterationState({
    rootDir,
    sessionId,
    summary,
    outcome: maxOutcome,
    checkpointWriter,
  });

  await invokeLifecycleHook({
    rootDir,
    sessionId,
    hook: 'onSessionEnd',
    phase: 'session-end',
    iteration,
    callback: lifecycleHooks?.onSessionEnd,
    payload: {
      rootDir,
      sessionId,
      objective: summary.objective,
      iteration,
      summary,
      stoppedByControl: false,
      reason: 'max-iterations',
    },
  });

  return {
    summary,
    stoppedByControl: false,
  };
}
