/* 中文注释：Pi RPC 托管执行器——solo harness 的长会话 transport。
   与 one-shot 执行器共用同一套迭代提示、压缩包与 JSON 契约解析；区别仅在
   provider 边界：Pi 进程跨轮复用（`pi --mode rpc --no-session`），每轮
   newSession 保持单轮上下文语义。任何传输层失败都丢弃当前会话、下一轮重建，
   与 one-shot 超时后 fail-closed 的取向一致。 */
import { createPiRpcSession } from '../../pi/rpc-client.mjs';
import { classifySoloFailure } from '../../harness/solo-runtime.mjs';
import { compressPostReceiveTurn, compressPreSendTurn, emitTurnCompressionLog, requireTurnCompression } from '../../interception/index.mjs';
import { normalizeTurnTimeoutMs } from './execute-turn.mjs';
import { buildIterationPrompt, parseHarnessJsonOutput } from './prompt.mjs';

const PI_RPC_COMMAND_LABEL = 'pi --mode rpc --no-session (aios managed transport)';

/* 中文注释：sessionImpl 仅供测试注入；生产路径由 rpc-client 自行 spawn。 */
export function buildPiRpcExecuteTurn({ rootDir, sessionId, objective, turnTimeoutMs, sessionImpl = null } = {}) {
  const effectiveTurnTimeoutMs = normalizeTurnTimeoutMs(turnTimeoutMs);
  let sessionPromise = null;

  async function getSession() {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const session = sessionImpl ? sessionImpl() : createPiRpcSession({});
        session.start();
        return session;
      })();
    }
    return sessionPromise;
  }

  async function dispose() {
    if (!sessionPromise) return;
    const pending = sessionPromise;
    sessionPromise = null;
    const session = await pending.catch(() => null);
    await session?.close?.();
  }

  async function compressPreSend({ prompt, workspaceRoot }) {
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
    return preSendPacket?.refs?.length ? JSON.stringify(preSendPacket, null, 2) : prompt;
  }

  async function compressPostReceive({ rawOutput, workspaceRoot }) {
    const packet = await requireTurnCompression({
      workspaceRoot: rootDir,
      cwd: workspaceRoot,
      sessionId,
      clientId: 'aios-harness',
      hostLevel: 'L3',
      mode: 'tight',
      eventKind: 'post_receive',
      text: rawOutput,
      run: () => compressPostReceiveTurn({
        workspaceRoot: rootDir,
        cwd: workspaceRoot,
        sessionId,
        clientId: 'aios-harness',
        hostLevel: 'L3',
        output: rawOutput,
        command: PI_RPC_COMMAND_LABEL,
        mode: 'tight',
        metrics: { enabled: true },
      }),
    });
    emitTurnCompressionLog(packet);
    if (!packet.refs?.length) return rawOutput;
    return JSON.stringify(packet, null, 2);
  }

  return {
    async executeTurn({ iteration, continuity, offloadCanvas, summary, worktree, bypass = false, abortSignal = null }) {
      const prompt = buildIterationPrompt({ objective, iteration, continuity, offloadCanvas, summary, bypass });
      const workspaceRoot = worktree?.enabled && worktree?.path ? worktree.path : rootDir;
      const providerPrompt = await compressPreSend({ prompt, workspaceRoot });
      const transportEvidence = [`transport=pi-rpc`, `turnTimeoutMs=${effectiveTurnTimeoutMs}`];

      const stoppedTurn = (rawOutput) => ({
        prompt,
        rawOutput,
        outcome: 'stopped',
        summary: 'Turn aborted by operator stop signal; managed pi session is being closed.',
        keyChanges: [],
        keyLearnings: [],
        nextAction: 'No action required; the harness stop request is being honored.',
        shouldStop: true,
        failureClass: 'stop-requested',
        evidence: transportEvidence,
      });

      if (abortSignal?.aborted) {
        return stoppedTurn('');
      }

      let session;
      try {
        session = await getSession();
      } catch (error) {
        await dispose();
        return {
          prompt,
          rawOutput: '',
          outcome: 'infra-retry',
          summary: error?.message || 'Managed pi session failed to start.',
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'Retry after backoff.',
          shouldStop: false,
          failureClass: classifySoloFailure(error),
          evidence: transportEvidence,
        };
      }

      const onAbort = () => { session.abort?.().catch(() => {}); };
      abortSignal?.addEventListener('abort', onAbort, { once: true });

      try {
        /* 中文注释：每轮 newSession：provider 进程复用，但上下文单轮隔离，与 one-shot 等价。 */
        await session.newSession();
        const flow = await session.runPromptFlow(providerPrompt, { timeoutMs: effectiveTurnTimeoutMs });
        const rawOutput = String(flow?.text || '');
        const interceptedOutput = await compressPostReceive({ rawOutput, workspaceRoot });

        if (abortSignal?.aborted) {
          return stoppedTurn(interceptedOutput);
        }

        const parsed = parseHarnessJsonOutput(rawOutput);
        if (parsed && typeof parsed === 'object') {
          return { prompt, rawOutput: interceptedOutput, ...parsed };
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
          evidence: transportEvidence,
        };
      } catch (error) {
        /* 中文注释：传输层失败（进程退出、settled 超时、prompt 被拒）一律丢弃会话，
           避免把卡死的 agent 带进下一轮；进程级清理后再进入 backoff 重试。 */
        await dispose();
        if (abortSignal?.aborted) {
          return stoppedTurn('');
        }
        return {
          prompt,
          rawOutput: '',
          outcome: 'infra-retry',
          summary: error?.message || 'Managed pi turn failed.',
          keyChanges: [],
          keyLearnings: [],
          nextAction: 'Retry after backoff; the managed pi session will be rebuilt.',
          shouldStop: false,
          failureClass: classifySoloFailure(error),
          evidence: transportEvidence,
        };
      } finally {
        abortSignal?.removeEventListener('abort', onAbort);
      }
    },
    async dispose() {
      await dispose();
    },
  };
}
