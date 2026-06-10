/* 中文注释：Subagent turn 压缩集中在这里，避免 phase-job 同时承担 prompt/result 网关细节。 */
import { compressPostReceiveTurn, compressPreSendTurn, emitTurnCompressionLog, requireTurnCompression } from '../../interception/index.mjs';
import { normalizeText } from './text.mjs';

export async function prepareSubagentTurnPrompts({
  rootDir,
  job,
  executionClientId,
  systemPrompt,
  userPrompt,
  io = null,
}) {
  const sessionId = resolveTurnSessionId(job);
  const text = `${systemPrompt}\n\n${userPrompt}`;
  const packet = await requireTurnCompression({
    workspaceRoot: rootDir || process.cwd(),
    cwd: rootDir || process.cwd(),
    sessionId,
    clientId: executionClientId,
    hostLevel: 'L2',
    mode: 'tight',
    eventKind: 'pre_send',
    text,
    run: () => compressPreSendTurn({
      workspaceRoot: rootDir || process.cwd(),
      cwd: rootDir || process.cwd(),
      sessionId,
      clientId: executionClientId,
      hostLevel: 'L2',
      prompt: text,
      mode: 'tight',
      metrics: { enabled: true },
    }),
  });
  emitTurnCompressionLog(packet, { write: (line) => (io?.error?.(line) || io?.log?.(line)) });
  if (!packet?.refs?.length) {
    return { sessionId, systemPrompt, userPrompt };
  }
  const compact = JSON.stringify(packet, null, 2);
  return { sessionId, systemPrompt: compact, userPrompt: compact };
}

export async function compactSubagentTurnOutput({
  rootDir,
  sessionId,
  executionClientId,
  outputText,
  rawCommandOutput,
  io = null,
}) {
  const text = outputText || rawCommandOutput;
  const packet = await requireTurnCompression({
    workspaceRoot: rootDir || process.cwd(),
    cwd: rootDir || process.cwd(),
    sessionId,
    clientId: executionClientId,
    hostLevel: 'L2',
    mode: 'tight',
    eventKind: 'post_receive',
    text,
    run: () => compressPostReceiveTurn({
      workspaceRoot: rootDir || process.cwd(),
      cwd: rootDir || process.cwd(),
      sessionId,
      clientId: executionClientId,
      hostLevel: 'L2',
      output: text,
      mode: 'tight',
      metrics: { enabled: true },
    }),
  });
  emitTurnCompressionLog(packet, { write: (line) => (io?.error?.(line) || io?.log?.(line)) });
  if (!packet?.refs?.length) {
    return { outputText, rawCommandOutput };
  }
  const compact = JSON.stringify(packet, null, 2);
  return { outputText: compact, rawCommandOutput: compact };
}

function resolveTurnSessionId(job) {
  return normalizeText(job?.jobId) || 'subagent-turn';
}
