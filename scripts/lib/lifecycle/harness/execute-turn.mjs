/* 中文注释：Harness 单轮执行汇总 CLI 调用与证据路径，是长任务压缩闭环的关键边界。 */
import path from 'node:path';
import { spawnCommand } from '../../platform/process.mjs';
import { buildSoloHarnessCommand } from '../../harness/solo-profiles.mjs';
import { classifySoloFailure } from '../../harness/solo-runtime.mjs';
import { compressPostReceiveTurn, compressPreSendTurn, emitTurnCompressionLog, requireTurnCompression } from '../../interception/index.mjs';
import { normalizeText } from './shared.mjs';
import { buildIterationPrompt, parseHarnessJsonOutput } from './prompt.mjs';

const DEFAULT_TURN_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_TURN_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const MIN_TURN_TIMEOUT_MS = 1000;

/* 中文注释：turn 超时是进程树的硬上限；验证类长任务可以显式放宽，但保持在安全边界内。 */
function normalizeTurnTimeoutMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_TURN_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(numeric), MIN_TURN_TIMEOUT_MS), MAX_TURN_TIMEOUT_MS);
}

/* 中文注释：把进程树清理结果转成可审计证据，孤儿兜底与超时重试共用。 */
function buildTerminationEvidence(result = {}, timeoutMs = 0) {
  const evidence = [`turnTimeoutMs=${timeoutMs}`, `treeAlive=${result.treeAlive === true}`];
  if (Number.isInteger(result.childPid)) evidence.push(`childPid=${result.childPid}`);
  if (result.killEscalated === true) evidence.push('killEscalated=SIGKILL');
  if (result.terminationError) evidence.push(`terminationError=${result.terminationError}`);
  return evidence;
}

/* 中文注释：生产执行器负责跑一轮 provider，并把 provider 输出纳入 interception packet，防止长任务日志撑爆上下文。 */
export function buildProductionExecuteTurn({ rootDir, aiosRootDir = '', sessionId, objective, provider, spawnCommandImpl = spawnCommand, turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS } = {}) {
  const runtimeAiosRootDir = path.resolve(normalizeText(aiosRootDir, rootDir));
  const effectiveTurnTimeoutMs = normalizeTurnTimeoutMs(turnTimeoutMs);
  return async ({ iteration, continuity, offloadCanvas, summary, worktree, bypass = false, abortSignal = null }) => {
    const prompt = buildIterationPrompt({
      objective,
      iteration,
      continuity,
      offloadCanvas,
      summary,
      bypass,
    });
    const workspaceRoot = worktree?.enabled && worktree?.path ? worktree.path : rootDir;
    const preSendPacket = await requireTurnCompression({
      workspaceRoot: rootDir,
      cwd: workspaceRoot,
      sessionId,
      clientId: 'aios-harness',
      hostLevel: 'L3',
      mode: 'tight',
      eventKind: 'pre_send',
      text: prompt,
      run: () => compressPreSendTurn({
        workspaceRoot: rootDir,
        cwd: workspaceRoot,
        sessionId,
        clientId: 'aios-harness',
        hostLevel: 'L3',
        prompt,
        mode: 'tight',
        metrics: { enabled: true },
      }),
    });
    emitTurnCompressionLog(preSendPacket);
    const providerPrompt = preSendPacket?.refs?.length ? JSON.stringify(preSendPacket, null, 2) : prompt;
    const providerObjective = preSendPacket?.refs?.length
      ? 'AIOS compacted solo harness objective; use the compact packet in --prompt.'
      : objective;
    const built = buildSoloHarnessCommand({
      rootDir: summary?.workspaceRoot || rootDir,
      aiosRootDir: summary?.aiosRootDir || runtimeAiosRootDir,
      sessionId,
      objective: providerObjective,
      provider,
      workspaceRoot,
      prompt: providerPrompt,
    });
    const result = await spawnCommandImpl(built.command, built.args, {
      cwd: built.cwd,
      env: process.env,
      timeoutMs: effectiveTurnTimeoutMs,
      ...(abortSignal ? { signal: abortSignal } : {}),
    });
    const rawOutput = `${result.stdout || ''}${result.stderr || ''}`.trim();
    /* 中文注释：rawOutput 用于解析 provider JSON，interceptedOutput 用于写入 journal/返回给上层。 */
    const interceptedOutput = await buildHarnessInterceptionPacket({
      rootDir,
      sessionId,
      built,
      result,
      rawOutput,
      workspaceRoot,
    });
    const parsed = parseHarnessJsonOutput(rawOutput);

    if (result.aborted === true) {
      /* 中文注释：操作者信号触发的主动取消：turn 树已被清理，按 stopped 结算，不进入重试统计。 */
      return {
        prompt,
        rawOutput: interceptedOutput,
        outcome: 'stopped',
        summary: 'Turn aborted by operator stop signal; process tree terminated.',
        keyChanges: [],
        keyLearnings: [],
        nextAction: 'No action required; the harness stop request is being honored.',
        shouldStop: true,
        failureClass: 'stop-requested',
        evidence: buildTerminationEvidence(result, effectiveTurnTimeoutMs),
      };
    }

    if (result.timedOut) {
      if (result.treeAlive === true) {
        /* 中文注释：fail-closed：整树未死透时拒绝进入下一轮，避免两个 agent 并发写同一工作区。 */
        return {
          prompt,
          rawOutput: interceptedOutput,
          outcome: 'blocked',
          summary: `Turn exceeded ${effectiveTurnTimeoutMs}ms and its process tree survived SIGKILL; refusing to continue to avoid orphan agents.`,
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'Kill the surviving process group manually (evidence includes childPid), then resume once the workspace is quiet.',
          shouldStop: true,
          failureClass: 'runtime-error',
          evidence: buildTerminationEvidence(result, effectiveTurnTimeoutMs),
        };
      }
      /* 中文注释：超时通常是基础设施问题，保留 compact packet 后让 harness backoff 重试；树已清理干净才允许重试。 */
      return {
        prompt,
        rawOutput: interceptedOutput,
        outcome: 'infra-retry',
        summary: 'Provider timed out before returning a valid iteration payload.',
        keyChanges: [],
        keyLearnings: [],
        nextAction: 'Retry after backoff.',
        shouldStop: false,
        failureClass: 'runtime-error',
        evidence: buildTerminationEvidence(result, effectiveTurnTimeoutMs),
      };
    }

    if (result.error) {
      /* 中文注释：启动错误同样进入 compact packet，避免错误堆栈直接塞满下一轮上下文。 */
      return {
        prompt,
        rawOutput: interceptedOutput,
        outcome: 'infra-retry',
        summary: result.error.message || 'Provider execution failed.',
        keyChanges: [],
        keyLearnings: [],
        nextAction: 'Retry after backoff.',
        shouldStop: false,
        failureClass: classifySoloFailure(result.error),
      };
    }

    if (parsed && typeof parsed === 'object') {
      /* 中文注释：合法 JSON contract 直接透传业务字段，但 rawOutput 已被替换成 compact packet。 */
      return {
        prompt,
        rawOutput: interceptedOutput,
        ...parsed,
      };
    }

    if ((result.status ?? 1) !== 0) {
      const failureClass = classifySoloFailure(rawOutput);
      const humanGate = failureClass === 'ownership-gate' || failureClass === 'safety-gate';
      /* 中文注释：安全/归属类失败不能自动重试；其他 provider 失败可以进入 infra retry。 */
      return {
        prompt,
        rawOutput: interceptedOutput,
        outcome: humanGate ? 'human-gate' : 'infra-retry',
        summary: normalizeText(rawOutput, 'Provider returned a non-zero exit code.'),
        keyChanges: [],
        keyLearnings: [],
        nextAction: humanGate ? 'Review the provider failure and resume manually.' : 'Retry after backoff.',
        shouldStop: humanGate,
        failureClass,
      };
    }

    return {
      prompt,
      rawOutput: interceptedOutput,
      outcome: 'infra-retry',
      summary: 'Provider output did not include a valid JSON payload for the iteration contract.',
      keyChanges: [],
      keyLearnings: [],
      nextAction: 'Retry with stricter output formatting.',
      shouldStop: false,
      failureClass: 'runtime-error',
    };
  };
}

/* 中文注释：Harness 直接调用 Engine，而不是走外部 CLI，这样长任务内部也能复用同一套 packet/ref/metrics。 */
async function buildHarnessInterceptionPacket({ rootDir, sessionId, built, result, rawOutput, workspaceRoot }) {
  const packet = await requireTurnCompression({
    workspaceRoot: rootDir,
    cwd: workspaceRoot,
    sessionId,
    clientId: 'aios-harness',
    hostLevel: 'L3',
    mode: 'tight',
    eventKind: 'post_receive',
    text: `${result.stdout || ''}${result.stderr || ''}`,
    run: () => compressPostReceiveTurn({
      workspaceRoot: rootDir,
      cwd: workspaceRoot,
      sessionId,
      clientId: 'aios-harness',
      hostLevel: 'L3',
      output: `${result.stdout || ''}${result.stderr || ''}`,
      command: [built.command, ...(built.args || [])].join(' '),
      mode: 'tight',
      metrics: { enabled: true },
    }),
  });
  emitTurnCompressionLog(packet);
  /* 中文注释：小输出没有 ref 时保留原文，避免 harness journal 里全是无意义 packet。 */
  if (!packet.refs?.length) return rawOutput;
  return JSON.stringify(packet, null, 2);
}
