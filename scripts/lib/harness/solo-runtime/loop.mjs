import { Buffer } from 'node:buffer';
import { readContinuitySummary } from '../../contextdb/continuity.mjs';
import { findCanvasMermaid, compactCanvas } from '../../offload/mermaid-canvas.mjs';
import { capture, resolveStorage, resolveConfig } from '../../offload/tool-offload.mjs';
import { readSoloControl, readSoloRunSummary, writeSoloRunSummary, appendSoloHookEvent, claimSessionOwner, installSessionSignalHandlers } from '../solo-journal.mjs';
import { sleep, resolveSoloBackoffState, shouldAbortForConsecutiveFailures, maxConsecutiveFailures } from './backoff.mjs';
import { resolveCadenceState, resolveCadenceConfig } from './cadence.mjs';
import { chargeQuotaSpend, computeQuotaState, resolveQuotaConfig } from './quota.mjs';
import { resolveShouldRun } from './should-run.mjs';
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
  // 节奏管理（should-run 门）：null = 关闭（attended 默认，行为与历史版本一致）。
  // {quota?: config, cadence?: config, quietThreshold?: number|null}
  pacing = null,
} = {}) {
  if (typeof executeTurn !== 'function') {
    throw new Error('runSoloHarnessLoop requires executeTurn');
  }
  const pacingEnabled = pacing != null && typeof pacing === 'object';
  const quotaConfig = pacingEnabled ? resolveQuotaConfig({ enabled: pacing.quota != null, ...pacing.quota }) : null;
  const cadenceConfig = pacingEnabled ? resolveCadenceConfig({ enabled: pacing.cadence != null, ...(pacing.cadence || {}) }) : null;
  const quietThreshold = pacingEnabled && Number.isFinite(pacing.quietThreshold) && pacing.quietThreshold > 0
    ? Math.floor(pacing.quietThreshold)
    : null;
  // 运行入口（首次启动或显式 resume）视为操作者意图：遗留的 operator gate /
  // human-gate cadence / quiet 计数不拦截本次运行；额度规则不受影响。
  let operatorSignalsAcknowledged = true;
  // safe_bypass：操作者门前的唯一一次只读绕行 turn（unattended + safeBypass 启用）。
  let bypassUsed = false;
  let bypassTurnActive = false;

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

  const ownerLease = await claimSessionOwner({ rootDir, sessionId });
  /* 中文注释：活动 turn 的 abort 句柄；SIGINT/SIGTERM 时由信号处理器触发，
     让脱离进程组的 turn 树也能被立即清理，而不是等它自然结束。 */
  let activeTurnAbort = null;
  const signalHandlers = installSessionSignalHandlers({
    rootDir,
    sessionId,
    onSignal: () => {
      try {
        activeTurnAbort?.abort();
      } catch {
        // abort 失败不能阻塞 stop 请求的持久化。
      }
    },
  });

  // Each turn writes a durable start marker before invoking the external agent.
  // If the process dies mid-turn, recovery can identify the incomplete iteration.
  const recordIterationEvent = async (event) => {
    try {
      await appendSoloHookEvent({ rootDir, sessionId, event: {
        kind: 'iteration-lifecycle',
        ...event,
        ts: new Date().toISOString(),
      } });
    } catch {
      // Journal diagnostics must never block the agent loop.
    }
  };

  const finish = async (value) => {
    activeTurnAbort = null;
    signalHandlers.stop();
    await ownerLease?.stop?.();
    return value;
  };

  // ── Dry-run readiness preflight ──
  // 在进入主循环前检测环境问题，避免 agent 跑到一半才失败。
  // blocked 级别直接拒绝启动；warning 级别记录但继续。
  const readiness = evaluateDryRunReadiness(rootDir, {
    sessionId,
    provider,
    worktree,
    resume: Boolean(summary?.lastIteration),
    // unattended 档对宿主做真实探测（fail-closed），attended 启动保持零开销。
    hostProbe: pacingEnabled,
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
    return finish({ summary, stoppedByControl: false, readiness });
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
      return finish({
        summary,
        stoppedByControl: true,
      });
    }

    const nowMs = Date.now();
    const untilMs = Date.parse(summary.backoff?.until || '');
    if (Number.isFinite(untilMs) && untilMs > nowMs) {
      await sleepImpl(untilMs - nowMs);
    }

    // ── should-run 决策门（pacing 启用时）──
    // wait 不消耗 iteration；ask/quiet 是终态停机，重入仍须显式 resume。
    // safe_bypass 轮跳过本门：它本身就是对操作者门的唯一一次只读响应。
    if (pacingEnabled && !bypassTurnActive) {
      const now = Date.now();
      const pacingState = summary.pacing || {};
      const quotaState = quotaConfig?.enabled
        ? computeQuotaState({ spend: pacingState.quota?.spend, nowMs: now, config: quotaConfig })
        : null;
      const decision = resolveShouldRun({
        lastOutcome: summary.lastOutcome,
        lastStatus: summary.status,
        lastFailureClass: summary.lastFailureClass,
        quotaState,
        cadenceState: operatorSignalsAcknowledged ? null : (pacingState.cadence || null),
        consecutiveNoop: Number.isFinite(pacingState.consecutiveNoop) ? pacingState.consecutiveNoop : 0,
        quietThreshold: operatorSignalsAcknowledged ? null : quietThreshold,
        operatorGateAcknowledged: operatorSignalsAcknowledged,
        nowMs: now,
      });
      summary = { ...summary, pacing: { ...pacingState, lastDecision: decision } };

      if (decision.action === 'wait') {
        await sleepImpl(decision.nextWakeMs);
        await recordIterationEvent({ iteration, status: 'pacing-wait', reason: decision.reasonCode });
        continue; // 不执行 turn，不递增 iteration
      }

      if (decision.action === 'ask' || decision.action === 'quiet') {
        const askOutcome = normalizeSoloIterationOutcome({
          sessionId,
          iteration,
          outcome: decision.action === 'ask' ? 'human-gate' : 'stopped',
          stage: 'handoff',
          summary: decision.action === 'ask'
            ? `Pacing gate requests operator decision: ${decision.reasonCode}.`
            : `Pacing gate shut down after unchanged polls: ${decision.reasonCode}.`,
          evidence: [`shouldRun=${decision.action}`, `reason=${decision.reasonCode}`],
          nextAction: decision.action === 'ask'
            ? 'Review the request and resume explicitly when ready.'
            : 'Objective made no progress across consecutive polls; resume explicitly with a refined objective.',
          shouldStop: true,
          failureClass: decision.action === 'ask' ? 'safety-gate' : 'stop-requested',
        });
        summary = await persistIterationState({
          rootDir,
          sessionId,
          summary,
          outcome: askOutcome,
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
            reason: `pacing-${decision.action}`,
          },
        });
        return finish({ summary, stoppedByControl: false, pacingDecision: decision });
      }
      // action === 'run'：继续执行本轮
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
    // L3: ensure plan exists and mark next task in progress before the turn
    let currentPlanTaskId = null;
    try {
      const { ensurePlanForRuntime, markPlanTaskInProgress } = await import('../../planning/plan-runtime.mjs');
      ensurePlanForRuntime({
        rootDir,
        objective: summary.objective,
        client: summary.clientId || summary.provider || 'solo-harness',
        source: 'solo-harness',
      });
      const inProgressResult = markPlanTaskInProgress(rootDir, { io: console });
      currentPlanTaskId = inProgressResult?.task?.id || null;
    } catch {
      // plan runtime is best-effort; never block harness
    }

    const bypassWasActive = bypassTurnActive;
    await recordIterationEvent({ iteration, status: 'started', bypass: bypassTurnActive || undefined });
    const turnAbort = new AbortController();
    activeTurnAbort = turnAbort;
    let rawTurn;
    try {
      rawTurn = await executeTurn({
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
        bypass: bypassTurnActive,
        abortSignal: turnAbort.signal,
      });
    } finally {
      activeTurnAbort = null;
    }
    bypassTurnActive = false;

    const outcome = normalizeSoloIterationOutcome({
      sessionId,
      iteration,
      ...(rawTurn && typeof rawTurn === 'object' ? rawTurn : {}),
    });
    // safe_bypass 代码级封印：绕行 turn 的 material 声明在这里被降级，
    // 与 rex 结算门（bypass_turn_material_outcome_forbidden）形成双重防线。
    let effectiveOutcome = outcome;
    if (bypassWasActive) {
      effectiveOutcome = normalizeSoloIterationOutcome({
        ...outcome,
        outcome: 'human-gate',
        shouldStop: true,
        failureClass: outcome.failureClass === 'none' ? 'safety-gate' : outcome.failureClass,
        summary: `[safe-bypass] ${outcome.summary}`,
        evidence: [
          ...(Array.isArray(outcome.evidence) ? outcome.evidence : []),
          'safe-bypass: material claims rejected by harness (code-level seal)',
        ],
      });
    }

    // ── 节奏状态回写：material 才扣额度，cadence 按 outcome 迁移，noop 计数 ──
    if (pacingEnabled) {
      operatorSignalsAcknowledged = false;
      const now = Date.now();
      const pacingState = summary.pacing || {};
      const spend = chargeQuotaSpend({
        spend: pacingState.quota?.spend,
        material: effectiveOutcome.outcome === 'success',
        nowMs: now,
        config: quotaConfig,
      });
      const cadence = cadenceConfig?.enabled
        ? resolveCadenceState({ previous: pacingState.cadence, outcome: effectiveOutcome, nowMs: now, config: cadenceConfig })
        : null;
      const consecutiveNoop = effectiveOutcome.outcome === 'noop'
        ? (Number.isFinite(pacingState.consecutiveNoop) ? pacingState.consecutiveNoop : 0) + 1
        : 0;
      summary = {
        ...summary,
        pacing: {
          ...pacingState,
          quota: { spend },
          cadence,
          consecutiveNoop,
          safeBypass: pacing.safeBypass === true ? { available: !bypassUsed, used: bypassUsed } : undefined,
        },
      };
    }

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
        outcome: effectiveOutcome,
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
        outcome: effectiveOutcome,
      },
    });
    if (onBeforeContinuityCommitResult?.logEntry) {
      turnLogEntries.push(onBeforeContinuityCommitResult.logEntry);
    }

    summary = await persistIterationState({
      rootDir,
      sessionId,
      summary,
      outcome: effectiveOutcome,
      prompt: rawTurn?.prompt || '',
      rawOutput: rawTurn?.rawOutput || '',
      extraLogEntries: [...(rawTurn?.logEntries || []), ...turnLogEntries],
      checkpointWriter,
    });
    await recordIterationEvent({ iteration, status: 'completed', outcome: effectiveOutcome.outcome });

    // L3: write iteration outcome back to structured plan (tasks + evidence)
    try {
      const { syncPlanWithIterationOutcome } = await import('../../planning/plan-runtime.mjs');
      const planSync = syncPlanWithIterationOutcome({
        rootDir,
        objective: summary.objective,
        iteration,
        outcome: effectiveOutcome,
        client: summary.clientId || summary.provider || 'solo-harness',
        taskId: currentPlanTaskId,
        io: console,
      });
      if (planSync?.ok && planSync.progress) {
        summary = {
          ...summary,
          planProgress: planSync.progress,
          planTaskId: planSync.taskId,
        };
      }
    } catch {
      // plan runtime is best-effort
    }

    // offload turn output + auto-compact canvas
    try {
      const config = resolveConfig({ offload: { enabled: true, minBytes: 512 } });
      const storage = resolveStorage({}, process.env, { offload: { storage: 'file' } });
      const outputStr = rawTurn?.rawOutput || effectiveOutcome?.summary || '';
      const outputSize = Buffer.byteLength(outputStr, 'utf8');
      if (outputSize >= config.minBytes) {
        await capture(
          {
            client: summary.clientId || summary.provider || 'codex',
            session: sessionId,
            tool: `harness-turn-${iteration}`,
            input: rawTurn?.prompt || summary.objective || '',
            output: outputStr,
            exitCode: effectiveOutcome.outcome === 'success' ? 0 : 1,
            durationMs: 0,
          },
          { workspaceRoot: rootDir, storage, config },
        );
      }
      await compactCanvas(rootDir, sessionId, storage);
    } catch {
      // offload failure should not block harness execution
    }

    // safe_bypass 授予：human-gate 停机前，unattended 档允许恰好一次只读绕行。
    if (effectiveOutcome.shouldStop
      && effectiveOutcome.outcome === 'human-gate'
      && pacingEnabled
      && pacing.safeBypass === true
      && !bypassUsed) {
      bypassUsed = true;
      bypassTurnActive = true;
      await recordIterationEvent({ iteration, status: 'safe-bypass-granted' });
      iteration += 1;
      continue;
    }

    if (effectiveOutcome.shouldStop) {
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
      return finish({
        summary,
        stoppedByControl: false,
      });
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
      return finish({
        summary,
        stoppedByControl: false,
      });
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

  return finish({
    summary,
    stoppedByControl: false,
  });
}
