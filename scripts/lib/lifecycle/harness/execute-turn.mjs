/* 中文注释：Harness 单轮执行汇总 CLI 调用与证据路径，是长任务压缩闭环的关键边界。 */
import path from 'node:path';
import { spawnCommand } from '../../platform/process.mjs';
import { buildSoloHarnessCommand } from '../../harness/solo-profiles.mjs';
import { classifySoloFailure } from '../../harness/solo-runtime.mjs';
import { compressPostReceiveTurn, compressPreSendTurn, emitTurnCompressionLog, requireTurnCompression } from '../../interception/index.mjs';
import { normalizeText } from './shared.mjs';
import { buildIterationPrompt, parseHarnessJsonOutput } from './prompt.mjs';

/* 中文注释：生产执行器负责跑一轮 provider，并把 provider 输出纳入 interception packet，防止长任务日志撑爆上下文。 */
export function buildProductionExecuteTurn({ rootDir, aiosRootDir = '', sessionId, objective, provider, spawnCommandImpl = spawnCommand } = {}) {
  const runtimeAiosRootDir = path.resolve(normalizeText(aiosRootDir, rootDir));
  return async ({ iteration, continuity, offloadCanvas, summary, worktree }) => {
    const prompt = buildIterationPrompt({
      objective,
      iteration,
      continuity,
      offloadCanvas,
      summary,
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
      timeoutMs: 30 * 60 * 1000,
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

    if (result.timedOut) {
      /* 中文注释：超时通常是基础设施问题，保留 compact packet 后让 harness backoff 重试。 */
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
